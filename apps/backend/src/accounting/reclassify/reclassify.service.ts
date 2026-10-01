/**
 * RECLASSIFY TRANSACTIONS ENGINE (Lead, 2026-10-01) — owner QBO spec §24 ("very important to build,
 * follow for the batch transactions"). QBO Tools → Reclassify: filter GL lines → select many → change
 * account / class / vendor → every document updated and re-posted, audit per document, undo per batch.
 *
 * IH35 ledger law: postings are never edited or deleted (WORM). So a reclassification is ONE
 * RECLASSIFICATION journal entry per source document, carrying for each selected posting a PAIR of
 * lines: the old side reversed (same account/class/entity, opposite dr/cr) and the new side posted
 * (target account/class/entity, same dr/cr). Net by account moves exactly the amount; the original JE
 * stays intact and linked. The source document line (expense_lines / bill_lines) is rewritten so the
 * document and the ledger agree; when it cannot be (no 1:1 line, or a bill's vendor — A/P subledger),
 * the batch line says so in document_update_note instead of pretending. Closed period → refused.
 * Undo = reverse every reclass JE of the batch (reverseJournalEntryNoFlip) + restore document lines.
 *
 * Linkage declaration (TRANSACTION-LINKAGE-LAW): reclassify_batches → identity.users (actor),
 * catalogs.accounts / catalogs.classes (targets); reclassify_batch_lines → journal_entry_postings
 * (posting_id), journal_entries (original + reclass + undo), the source document by
 * source_transaction_type/id/line_id (expense / bill / invoice / …), catalogs.accounts, catalogs.classes,
 * entity (vendor / customer / driver / unit). Reverse: the reclass JE's postings carry
 * source_transaction_type/id of the ORIGINAL document, so a document's ledger drill shows the
 * reclassification; audit.audit_events one row per document per batch.
 */
import { withCurrentUser } from "../../auth/db.js";
import { createJournalEntryOnClient, reverseJournalEntryNoFlip } from "../journal-entries.service.js";
import { PostingEngineError } from "../posting-engine.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export type ReclassifyLineFilter = {
  operating_company_id: string;
  from_date: string;
  to_date: string;
  account_ids?: string[];
  source_types?: string[];
  class_id?: string | null;
  entity_uuid?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
};

export type ReclassifyLineRow = {
  posting_id: string;
  journal_entry_id: string;
  entry_date: string;
  source_transaction_type: string | null;
  source_transaction_id: string | null;
  source_transaction_line_id: string | null;
  document_number: string | null;
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  account_type?: string | null;
  account_subtype?: string | null;
  system_purpose?: string | null;
  is_bank_ledger?: boolean;
  class_id: string | null;
  class_name: string | null;
  entity_uuid: string | null;
  entity_type: string | null;
  entity_name: string | null;
  description: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  /** signed: debit positive, credit negative — QBO's NET AMOUNT on an expense account */
  net_amount_cents: number;
  already_reclassified_batch_id: string | null;
};

export function buildLineWhere(filter: ReclassifyLineFilter, values: unknown[]): string {
  const where: string[] = [
    `p.operating_company_id = $1::uuid`,
    `je.status = 'posted'`,
    `je.entry_date BETWEEN $2::date AND $3::date`,
    // a reversed line (void) and its reversal net to zero: neither is reclassifiable
    `p.reversed_by_line_id IS NULL`,
    `p.reversal_of_line_id IS NULL`,
  ];
  if (filter.account_ids?.length) {
    values.push(filter.account_ids);
    where.push(`p.account_id = ANY($${values.length}::uuid[])`);
  }
  if (filter.source_types?.length) {
    values.push(filter.source_types);
    where.push(`coalesce(p.source_transaction_type, 'journal_entry') = ANY($${values.length}::text[])`);
  }
  if (filter.class_id) {
    values.push(filter.class_id);
    where.push(`p.class_id = $${values.length}::uuid`);
  }
  if (filter.entity_uuid) {
    values.push(filter.entity_uuid);
    where.push(`p.entity_uuid = $${values.length}::uuid`);
  }
  if (filter.search && filter.search.trim()) {
    values.push(`%${filter.search.trim()}%`);
    where.push(`(p.description ILIKE $${values.length} OR je.memo ILIKE $${values.length})`);
  }
  return where.join("\n          AND ");
}

const LINE_SELECT = `
        SELECT p.id::text AS posting_id,
               p.journal_entry_uuid::text AS journal_entry_id,
               je.entry_date::text AS entry_date,
               p.source_transaction_type,
               p.source_transaction_id,
               p.source_transaction_line_id,
               CASE p.source_transaction_type
                 WHEN 'expense' THEN (SELECT e.expense_number FROM accounting.expenses e WHERE e.id::text = p.source_transaction_id)
                 WHEN 'bill' THEN (SELECT coalesce(b.display_id, b.bill_number) FROM accounting.bills b WHERE b.id::text = p.source_transaction_id)
                 WHEN 'invoice' THEN (SELECT i.display_id FROM accounting.invoices i WHERE i.id::text = p.source_transaction_id)
                 ELSE NULL END AS document_number,
               p.account_id::text AS account_id,
               a.account_number, a.account_name, a.account_type, a.account_subtype, a.system_purpose,
               EXISTS (SELECT 1 FROM banking.bank_accounts ba WHERE ba.ledger_account_id = p.account_id) AS is_bank_ledger,
               p.class_id::text AS class_id, c.class_name,
               p.entity_uuid::text AS entity_uuid, p.entity_type,
               CASE p.entity_type
                 WHEN 'vendor' THEN (SELECT v.vendor_name FROM mdata.vendors v WHERE v.id = p.entity_uuid)
                 WHEN 'customer' THEN (SELECT cu.customer_name FROM mdata.customers cu WHERE cu.id = p.entity_uuid)
                 WHEN 'driver' THEN (SELECT concat_ws(' ', d.first_name, d.last_name) FROM mdata.drivers d WHERE d.id = p.entity_uuid)
                 WHEN 'unit' THEN (SELECT u.unit_number::text FROM mdata.units u WHERE u.id = p.entity_uuid)
                 ELSE NULL END AS entity_name,
               coalesce(p.description, je.memo) AS description,
               p.debit_or_credit,
               p.amount_cents::bigint AS amount_cents,
               (CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)::bigint AS net_amount_cents,
               (SELECT rl.batch_id::text FROM accounting.reclassify_batch_lines rl
                  JOIN accounting.reclassify_batches rb ON rb.id = rl.batch_id AND rb.status = 'applied'
                 WHERE rl.posting_id = p.id AND rl.result = 'applied' LIMIT 1) AS already_reclassified_batch_id
          FROM accounting.journal_entry_postings p
          JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
          LEFT JOIN catalogs.accounts a ON a.id = p.account_id AND a.operating_company_id = p.operating_company_id
          LEFT JOIN catalogs.classes c ON c.id = p.class_id AND c.operating_company_id = p.operating_company_id`;

function numberize(r: ReclassifyLineRow): ReclassifyLineRow {
  return { ...r, amount_cents: Number(r.amount_cents), net_amount_cents: Number(r.net_amount_cents) };
}

export async function findReclassifyLines(userId: string, filter: ReclassifyLineFilter) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [filter.operating_company_id]);
    const values: unknown[] = [filter.operating_company_id, filter.from_date, filter.to_date];
    const where = buildLineWhere(filter, values);
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const offset = Math.max(filter.offset ?? 0, 0);
    const totals = await client.query<{ n: string; net: string }>(
      `SELECT count(*)::text AS n,
              coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS net
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
        WHERE ${where}`,
      values,
    );
    const rows = await client.query<ReclassifyLineRow>(
      `${LINE_SELECT}
         WHERE ${where}
         ORDER BY je.entry_date DESC, p.journal_entry_uuid, p.line_sequence
         LIMIT ${limit} OFFSET ${offset}`,
      values,
    );
    return {
      lines: rows.rows.map(numberize),
      total_lines: Number(totals.rows[0]?.n ?? 0),
      total_net_amount_cents: Number(totals.rows[0]?.net ?? 0),
      limit,
      offset,
    };
  });
}

export type ApplyReclassifyInput = {
  operating_company_id: string;
  posting_ids: string[];
  reason: string;
  to_account_id?: string | null;
  to_class_id?: string | null;
  to_entity_uuid?: string | null;
  to_entity_type?: "customer" | "vendor" | "driver" | "unit" | null;
  filter_snapshot?: Record<string, unknown>;
};

export type ReclassifyDocumentResult = {
  source_transaction_type: string | null;
  source_transaction_id: string | null;
  document_number: string | null;
  reclass_journal_entry_id: string | null;
  lines_applied: number;
  lines_refused: number;
  document_updated: boolean;
  document_update_note: string | null;
  refusal_reason: string | null;
};

export type ReclassifyBatchResult = {
  batch_id: string;
  lines_requested: number;
  lines_applied: number;
  lines_refused: number;
  amount_cents_moved: number;
  documents: ReclassifyDocumentResult[];
};

type SelectedPosting = ReclassifyLineRow & { je_status: string; memo: string | null };

/**
 * CONTROL ACCOUNTS (QBO's own Reclassify rule, made explicit): A/R, A/P, bank, credit card, undeposited
 * funds and the factoring/escrow control accounts are SUBLEDGER-backed — their GL balance must equal
 * the invoices / bills / bank register / reserve ledger that feed them. A reclassification moves
 * CATEGORY lines only; it never moves a line off or onto a control account. A control-account line
 * is refused with the pointer to the document that owns it (void-and-reissue / bank match).
 */
export const CONTROL_SUBTYPE_RE = /accounts\s*receivable|accounts\s*payable|\(a\/r\)|\(a\/p\)|^checking$|^savings$|^bank$|cash\s*on\s*hand|^cashonhand$|credit\s*card|^creditcard$|undeposited\s*funds|^undepositedfunds$/i;
export const CONTROL_PURPOSES = new Set([
  "accounts_receivable", "accounts_payable", "bank_operating", "undeposited_funds", "factoring_ar_assigned", "factoring_reserves",
  "factoring_advance_liability", "faro_factoring_wallet", "relay_fuel_wallet", "driver_escrow_liability", "retained_earnings",
]);
export function controlAccountReason(acc: { account_type: string | null; account_subtype: string | null; system_purpose: string | null; is_bank_ledger?: boolean }): string | null {
  if (acc.is_bank_ledger) return "bank/cash ledger account: the bank register owns this line (match or exclude it in Banking)";
  if (acc.system_purpose && CONTROL_PURPOSES.has(acc.system_purpose)) return `${acc.system_purpose} control account: its subledger owns this line (void-and-reissue the document)`;
  if (acc.account_subtype && CONTROL_SUBTYPE_RE.test(acc.account_subtype)) return `${acc.account_subtype} control account: its subledger owns this line (void-and-reissue the document)`;
  return null;
}

/** Pure: which selected lines are eligible and why the others are not. Unit-tested without a DB. */
export function classifySelection(
  postings: SelectedPosting[],
  target: { to_account_id?: string | null; to_class_id?: string | null; to_entity_uuid?: string | null },
): { eligible: SelectedPosting[]; refused: Array<{ posting: SelectedPosting; why: string }> } {
  const eligible: SelectedPosting[] = [];
  const refused: Array<{ posting: SelectedPosting; why: string }> = [];
  for (const p of postings) {
    if (p.je_status !== "posted") { refused.push({ posting: p, why: `journal entry is ${p.je_status}` }); continue; }
    if (p.already_reclassified_batch_id) { refused.push({ posting: p, why: `already reclassified in batch ${p.already_reclassified_batch_id}; undo that batch first` }); continue; }
    const control = controlAccountReason({ account_type: p.account_type ?? null, account_subtype: p.account_subtype ?? null, system_purpose: p.system_purpose ?? null, is_bank_ledger: p.is_bank_ledger });
    if (control && target.to_account_id) { refused.push({ posting: p, why: control }); continue; }
    const noChange =
      (!target.to_account_id || target.to_account_id === p.account_id) &&
      (!target.to_class_id || target.to_class_id === p.class_id) &&
      (!target.to_entity_uuid || target.to_entity_uuid === p.entity_uuid);
    if (noChange) { refused.push({ posting: p, why: "line already carries the requested account/class/entity" }); continue; }
    eligible.push(p);
  }
  return { eligible, refused };
}

/** Pure: the reclass JE lines for one document — a reverse+repost PAIR per selected posting. */
export function buildReclassPairs(
  eligible: SelectedPosting[],
  target: { to_account_id?: string | null; to_class_id?: string | null; to_entity_uuid?: string | null; to_entity_type?: string | null },
  batchId: string,
) {
  return eligible.flatMap((p) => {
    const flip: "debit" | "credit" = p.debit_or_credit === "debit" ? "credit" : "debit";
    const what = [target.to_account_id ? "account" : null, target.to_class_id ? "class" : null, target.to_entity_uuid ? "entity" : null].filter(Boolean).join("/");
    const desc = `Reclass ${batchId.slice(0, 8)} (${what}) · ${p.description ?? ""}`.trim();
    const base = { amount_cents: p.amount_cents, description: desc, source_transaction_type: p.source_transaction_type, source_transaction_id: p.source_transaction_id };
    return [
      { ...base, account_id: p.account_id, class_id: p.class_id, entity_uuid: p.entity_uuid, entity_type: p.entity_type, debit_or_credit: flip },
      {
        ...base,
        account_id: target.to_account_id ?? p.account_id,
        class_id: target.to_class_id ?? p.class_id,
        entity_uuid: target.to_entity_uuid ?? p.entity_uuid,
        entity_type: target.to_entity_uuid ? (target.to_entity_type ?? null) : p.entity_type,
        debit_or_credit: p.debit_or_credit,
      },
    ];
  });
}

async function loadSelectedPostings(client: DbClient, companyId: string, postingIds: string[]): Promise<SelectedPosting[]> {
  const res = await client.query<SelectedPosting>(
    `${LINE_SELECT.replace("SELECT p.id::text AS posting_id,", "SELECT je.status AS je_status, je.memo, p.id::text AS posting_id,")}
       WHERE p.operating_company_id = $1::uuid AND p.id = ANY($2::uuid[])
       ORDER BY p.journal_entry_uuid, p.line_sequence`,
    [companyId, postingIds],
  );
  return res.rows.map((r) => numberize(r) as SelectedPosting);
}

/** Rewrite the source document line so document and ledger agree. Returns a note when it cannot. */
async function rewriteDocumentLine(
  client: DbClient,
  companyId: string,
  p: SelectedPosting,
  target: { account_id: string | null; class_id: string | null; entity_uuid: string | null; entity_type: string | null },
): Promise<{ updated: boolean; note: string | null }> {
  const type = p.source_transaction_type;
  if (!type || !p.source_transaction_id) return { updated: false, note: "hand-keyed journal entry: no source document to rewrite (ledger moved by the reclass JE)" };
  const notes: string[] = [];
  if (type === "expense") {
    if (target.entity_uuid && target.entity_type && target.entity_type !== "vendor") notes.push(`expense payee can only become a vendor (asked ${target.entity_type}); ledger moved, header unchanged`);
    if (target.entity_uuid && target.entity_type === "vendor") {
      await client.query(`UPDATE accounting.expenses SET vendor_uuid = $3::uuid, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [p.source_transaction_id, companyId, target.entity_uuid]);
    }
    if (target.account_id) {
      let lineUpdated = 0;
      if (p.source_transaction_line_id) {
        const r = await client.query(`UPDATE accounting.expense_lines SET expense_account_uuid = $3::uuid WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [p.source_transaction_line_id, companyId, target.account_id]);
        lineUpdated = r.rowCount ?? 0;
      } else {
        // posting carries no line id: the one expense line with this exact account + amount, else leave it and say so
        const r = await client.query(
          `UPDATE accounting.expense_lines SET expense_account_uuid = $4::uuid
            WHERE id = (SELECT id FROM accounting.expense_lines WHERE expense_id = $1::uuid AND operating_company_id = $2::uuid
                          AND expense_account_uuid = $3::uuid AND amount_cents = $5::bigint ORDER BY line_sequence LIMIT 1)`,
          [p.source_transaction_id, companyId, p.account_id, target.account_id, p.amount_cents],
        );
        lineUpdated = r.rowCount ?? 0;
      }
      if (lineUpdated === 0) notes.push("no 1:1 expense line matched this posting; ledger moved, expense line unchanged");
    }
    if (target.class_id) {
      await client.query(`UPDATE accounting.expenses SET class_id = $3::uuid, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [p.source_transaction_id, companyId, target.class_id]);
    }
    return { updated: notes.length === 0, note: notes.length ? notes.join("; ") : null };
  }
  if (type === "bill") {
    if (target.entity_uuid) notes.push("bill vendor is the A/P subledger: void-and-reissue the bill to change it; vendor dimension not moved");
    if (target.account_id && p.source_transaction_line_id) {
      const r = await client.query(`UPDATE accounting.bill_lines SET account_id = $3::uuid WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL`, [p.source_transaction_line_id, companyId, target.account_id]);
      if ((r.rowCount ?? 0) === 0) notes.push("bill line not found or voided; ledger moved, bill line unchanged");
    } else if (target.account_id) {
      notes.push("bill posting carries no line id; ledger moved, bill line unchanged");
    }
    return { updated: notes.length === 0, note: notes.length ? notes.join("; ") : null };
  }
  return { updated: false, note: `${type}: ledger moved by the reclass JE; this document type has no line rewrite yet` };
}

const INSERT_LINE = `
  INSERT INTO accounting.reclassify_batch_lines
    (batch_id, operating_company_id, posting_id, journal_entry_id, source_transaction_type, source_transaction_id, source_transaction_line_id,
     from_account_id, from_class_id, from_entity_uuid, from_entity_type, to_account_id, to_class_id, to_entity_uuid, to_entity_type,
     debit_or_credit, amount_cents, result, refusal_reason, reclass_journal_entry_id, document_updated, document_update_note)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid, $9::uuid, $10::uuid, $11, $12::uuid, $13::uuid, $14::uuid, $15, $16, $17, $18, $19, $20::uuid, $21, $22)`;

export async function applyReclassify(input: ApplyReclassifyInput, actor: { userId: string; role: string }): Promise<ReclassifyBatchResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("reclassify_reason_required");
  if (!input.to_account_id && !input.to_class_id && !input.to_entity_uuid) throw new Error("reclassify_changes_nothing");
  if (!!input.to_entity_uuid !== !!input.to_entity_type) throw new Error("reclassify_entity_pair_incomplete");
  const postingIds = Array.from(new Set(input.posting_ids));
  if (postingIds.length === 0) throw new Error("reclassify_no_lines_selected");
  if (postingIds.length > 500) throw new Error("reclassify_too_many_lines_max_500");
  const target = { to_account_id: input.to_account_id ?? null, to_class_id: input.to_class_id ?? null, to_entity_uuid: input.to_entity_uuid ?? null, to_entity_type: input.to_entity_type ?? null };

  return withCurrentUser(actor.userId, async (client) => {
    const companyId = input.operating_company_id;
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);

    if (target.to_account_id) {
      const acc = await client.query<{ ok: boolean; account_type: string | null; account_subtype: string | null; system_purpose: string | null; is_bank_ledger: boolean }>(
        `SELECT (deactivated_at IS NULL AND is_postable) AS ok, account_type, account_subtype, system_purpose,
                EXISTS (SELECT 1 FROM banking.bank_accounts ba WHERE ba.ledger_account_id = a.id) AS is_bank_ledger
           FROM catalogs.accounts a WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [target.to_account_id, companyId]);
      if (!acc.rows[0]) throw new Error("reclassify_target_account_not_found");
      if (!acc.rows[0].ok) throw new Error("reclassify_target_account_not_postable");
      if (controlAccountReason(acc.rows[0])) throw new Error("reclassify_target_is_control_account");
    }
    if (target.to_class_id) {
      const cls = await client.query<{ ok: boolean }>(`SELECT (deactivated_at IS NULL) AS ok FROM catalogs.classes WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [target.to_class_id, companyId]);
      if (!cls.rows[0]?.ok) throw new Error("reclassify_target_class_not_found");
    }

    const batchRes = await client.query<{ id: string }>(
      `INSERT INTO accounting.reclassify_batches
         (operating_company_id, created_by_user_id, reason, filter_snapshot, to_account_id, to_class_id, to_entity_uuid, to_entity_type, lines_requested)
       VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::uuid, $6::uuid, $7::uuid, $8, $9) RETURNING id::text`,
      [companyId, actor.userId, reason, JSON.stringify(input.filter_snapshot ?? {}), target.to_account_id, target.to_class_id, target.to_entity_uuid, target.to_entity_type, postingIds.length],
    );
    const batchId = batchRes.rows[0]!.id;
    const result: ReclassifyBatchResult = { batch_id: batchId, lines_requested: postingIds.length, lines_applied: 0, lines_refused: 0, amount_cents_moved: 0, documents: [] };

    const recordRefusal = async (p: SelectedPosting, why: string) => {
      result.lines_refused += 1;
      await client.query(INSERT_LINE, [
        batchId, companyId, p.posting_id, p.journal_entry_id, p.source_transaction_type, p.source_transaction_id, p.source_transaction_line_id,
        p.account_id, p.class_id, p.entity_uuid, p.entity_type, target.to_account_id ?? p.account_id, target.to_class_id ?? p.class_id, target.to_entity_uuid ?? p.entity_uuid, target.to_entity_uuid ? target.to_entity_type : p.entity_type,
        p.debit_or_credit, p.amount_cents, "refused", why, null, false, null,
      ]);
      result.documents.push({ source_transaction_type: p.source_transaction_type, source_transaction_id: p.source_transaction_id, document_number: p.document_number, reclass_journal_entry_id: null, lines_applied: 0, lines_refused: 1, document_updated: false, document_update_note: null, refusal_reason: why });
    };

    const postings = await loadSelectedPostings(client as DbClient, companyId, postingIds);
    const found = new Set(postings.map((p) => p.posting_id));
    const missing = postingIds.filter((id) => !found.has(id));
    result.lines_refused += missing.length;
    for (const id of missing) result.documents.push({ source_transaction_type: null, source_transaction_id: id, document_number: null, reclass_journal_entry_id: null, lines_applied: 0, lines_refused: 1, document_updated: false, document_update_note: null, refusal_reason: "posting not found in this company" });

    const groups = new Map<string, SelectedPosting[]>();
    for (const p of postings) {
      const key = p.source_transaction_type && p.source_transaction_id ? `${p.source_transaction_type}:${p.source_transaction_id}` : `je:${p.journal_entry_id}`;
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }

    for (const [, group] of groups) {
      const head = group[0]!;
      const { eligible, refused } = classifySelection(group, target);
      for (const r of refused) await recordRefusal(r.posting, r.why);
      if (eligible.length === 0) continue;
      const entryDate = head.entry_date; // the document's own period; closed → refused, never shifted
      const lines = buildReclassPairs(eligible, target, batchId);

      await client.query("SAVEPOINT reclass_doc");
      try {
        const je = await createJournalEntryOnClient(
          client as never,
          {
            operating_company_id: companyId,
            entry_date: entryDate,
            memo: `Reclassify batch ${batchId}: ${reason}${head.document_number ? ` · ${head.source_transaction_type} ${head.document_number}` : ""}`,
            source: "auto",
            journal_entry_type_code: "RECLASSIFICATION",
            postings: lines,
          } as never,
          actor,
        );
        const jeId = (je as { id: string }).id;
        let docUpdated = true;
        const notes: string[] = [];
        for (const p of eligible) {
          const rw = await rewriteDocumentLine(client as DbClient, companyId, p, { account_id: target.to_account_id, class_id: target.to_class_id, entity_uuid: target.to_entity_uuid, entity_type: target.to_entity_type });
          if (!rw.updated) { docUpdated = false; if (rw.note) notes.push(rw.note); }
          await client.query(INSERT_LINE, [
            batchId, companyId, p.posting_id, p.journal_entry_id, p.source_transaction_type, p.source_transaction_id, p.source_transaction_line_id,
            p.account_id, p.class_id, p.entity_uuid, p.entity_type, target.to_account_id ?? p.account_id, target.to_class_id ?? p.class_id, target.to_entity_uuid ?? p.entity_uuid, target.to_entity_uuid ? target.to_entity_type : p.entity_type,
            p.debit_or_credit, p.amount_cents, "applied", null, jeId, rw.updated, rw.note,
          ]);
          result.lines_applied += 1;
          result.amount_cents_moved += p.amount_cents;
        }
        await client.query(
          `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
           VALUES (gen_random_uuid(), now(), 'accounting.reclassify.document_reclassified', 'info', $1::jsonb, $2::uuid, 'RECLASSIFY-ENGINE')`,
          [JSON.stringify({ batch_id: batchId, reclass_journal_entry_id: jeId, source_transaction_type: head.source_transaction_type, source_transaction_id: head.source_transaction_id, document_number: head.document_number, lines: eligible.length, ...target, reason }), actor.userId],
        );
        await client.query("RELEASE SAVEPOINT reclass_doc");
        result.documents.push({ source_transaction_type: head.source_transaction_type, source_transaction_id: head.source_transaction_id, document_number: head.document_number, reclass_journal_entry_id: jeId, lines_applied: eligible.length, lines_refused: refused.length, document_updated: docUpdated, document_update_note: notes.length ? Array.from(new Set(notes)).join("; ") : null, refusal_reason: null });
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT reclass_doc");
        await client.query("RELEASE SAVEPOINT reclass_doc");
        const why = error instanceof PostingEngineError && error.code === "PERIOD_LOCKED"
          ? `period closed for ${entryDate}: reopen the period or post a dated adjusting entry`
          : error instanceof Error ? error.message : String(error);
        for (const p of eligible) await recordRefusal(p, why);
      }
    }

    await client.query(`UPDATE accounting.reclassify_batches SET lines_applied = $2, lines_refused = $3, amount_cents_moved = $4 WHERE id = $1::uuid`, [batchId, result.lines_applied, result.lines_refused, result.amount_cents_moved]);
    return result;
  });
}

export async function undoReclassifyBatch(input: { operating_company_id: string; batch_id: string; reason: string }, actor: { userId: string; role: string }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("reclassify_undo_reason_required");
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const batch = await client.query<{ status: string }>(`SELECT status FROM accounting.reclassify_batches WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [input.batch_id, input.operating_company_id]);
    if (!batch.rows[0]) throw new Error("reclassify_batch_not_found");
    if (batch.rows[0].status !== "applied") throw new Error("reclassify_batch_already_undone");
    const jes = await client.query<{ je: string }>(`SELECT DISTINCT reclass_journal_entry_id::text AS je FROM accounting.reclassify_batch_lines WHERE batch_id = $1::uuid AND result = 'applied' AND reclass_journal_entry_id IS NOT NULL`, [input.batch_id]);
    let reversed = 0;
    for (const row of jes.rows) {
      const r = await reverseJournalEntryNoFlip(client as never, { operatingCompanyId: input.operating_company_id, journalEntryId: row.je, reason: `Undo reclassify batch ${input.batch_id}: ${reason}`, actorUserId: actor.userId });
      const undoId = r.reversal.reversal_journal_entry_id ?? null;
      await client.query(`UPDATE accounting.reclassify_batch_lines SET undo_journal_entry_id = $2::uuid WHERE batch_id = $1::uuid AND reclass_journal_entry_id = $3::uuid`, [input.batch_id, undoId, row.je]);
      reversed += 1;
    }
    const lines = await client.query<{ source_transaction_type: string | null; source_transaction_id: string | null; source_transaction_line_id: string | null; from_account_id: string; from_class_id: string | null; from_entity_uuid: string | null; document_updated: boolean }>(
      `SELECT source_transaction_type, source_transaction_id, source_transaction_line_id, from_account_id::text, from_class_id::text, from_entity_uuid::text, document_updated
         FROM accounting.reclassify_batch_lines WHERE batch_id = $1::uuid AND result = 'applied'`,
      [input.batch_id],
    );
    for (const l of lines.rows) {
      if (!l.document_updated) continue;
      if (l.source_transaction_type === "expense" && l.source_transaction_id) {
        if (l.source_transaction_line_id) await client.query(`UPDATE accounting.expense_lines SET expense_account_uuid = $2::uuid WHERE id = $1::uuid`, [l.source_transaction_line_id, l.from_account_id]);
        await client.query(`UPDATE accounting.expenses SET class_id = $2::uuid, vendor_uuid = coalesce($3::uuid, vendor_uuid), updated_at = now() WHERE id = $1::uuid`, [l.source_transaction_id, l.from_class_id, l.from_entity_uuid]);
      } else if (l.source_transaction_type === "bill" && l.source_transaction_line_id) {
        await client.query(`UPDATE accounting.bill_lines SET account_id = $2::uuid WHERE id = $1::uuid`, [l.source_transaction_line_id, l.from_account_id]);
      }
    }
    await client.query(`UPDATE accounting.reclassify_batches SET status = 'undone', undone_at = now(), undone_by_user_id = $2::uuid, undo_reason = $3 WHERE id = $1::uuid`, [input.batch_id, actor.userId, reason]);
    await client.query(
      `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
       VALUES (gen_random_uuid(), now(), 'accounting.reclassify.batch_undone', 'info', $1::jsonb, $2::uuid, 'RECLASSIFY-ENGINE')`,
      [JSON.stringify({ batch_id: input.batch_id, journal_entries_reversed: reversed, reason }), actor.userId],
    );
    return { batch_id: input.batch_id, journal_entries_reversed: reversed };
  });
}

export async function listReclassifyBatches(userId: string, operatingCompanyId: string, limit = 50) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<Record<string, unknown>>(
      `SELECT b.id::text, b.created_at::text, b.reason, b.status, b.lines_requested, b.lines_applied, b.lines_refused, b.amount_cents_moved::bigint AS amount_cents_moved,
              b.to_account_id::text, a.account_number AS to_account_number, a.account_name AS to_account_name,
              b.to_class_id::text, c.class_name AS to_class_name, b.to_entity_uuid::text, b.to_entity_type,
              b.undone_at::text, b.undo_reason, u.email AS created_by_email
         FROM accounting.reclassify_batches b
         LEFT JOIN catalogs.accounts a ON a.id = b.to_account_id
         LEFT JOIN catalogs.classes c ON c.id = b.to_class_id
         LEFT JOIN identity.users u ON u.id = b.created_by_user_id
        WHERE b.operating_company_id = $1::uuid
        ORDER BY b.created_at DESC LIMIT $2`,
      [operatingCompanyId, Math.min(limit, 200)],
    );
    return res.rows.map((r) => ({ ...r, amount_cents_moved: Number(r.amount_cents_moved) }));
  });
}

export async function getReclassifyBatchLines(userId: string, operatingCompanyId: string, batchId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<Record<string, unknown>>(
      `SELECT l.id::text, l.posting_id::text, l.journal_entry_id::text, l.source_transaction_type, l.source_transaction_id, l.source_transaction_line_id,
              l.from_account_id::text, fa.account_number AS from_account_number, fa.account_name AS from_account_name,
              l.to_account_id::text, ta.account_number AS to_account_number, ta.account_name AS to_account_name,
              l.from_class_id::text, fc.class_name AS from_class_name, l.to_class_id::text, tc.class_name AS to_class_name,
              l.from_entity_uuid::text, l.from_entity_type, l.to_entity_uuid::text, l.to_entity_type,
              l.debit_or_credit, l.amount_cents::bigint AS amount_cents, l.result, l.refusal_reason,
              l.reclass_journal_entry_id::text, l.undo_journal_entry_id::text, l.document_updated, l.document_update_note
         FROM accounting.reclassify_batch_lines l
         LEFT JOIN catalogs.accounts fa ON fa.id = l.from_account_id
         LEFT JOIN catalogs.accounts ta ON ta.id = l.to_account_id
         LEFT JOIN catalogs.classes fc ON fc.id = l.from_class_id
         LEFT JOIN catalogs.classes tc ON tc.id = l.to_class_id
        WHERE l.batch_id = $1::uuid AND l.operating_company_id = $2::uuid
        ORDER BY l.created_at, l.id`,
      [batchId, operatingCompanyId],
    );
    return res.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
  });
}
