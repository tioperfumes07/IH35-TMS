/**
 * LEAD 443.129 E — the ONE correction path for a POSTED expense (the QuickBooks-style edit the owner asked for).
 *
 * A posted expense is a fact on the ledger (journal_entry_postings are WORM: refuse_posting_fact_update). Editing it is
 * therefore never an in-place overwrite. A correction, in ONE transaction:
 *   1. reverses the expense's live journal entry through the ONE journal-entry reverser (reverseJournalEntryNoFlip:
 *      postVoidReversal + the bidirectional reverses_je_id / reversed_by_je_id linkage);
 *   2. applies the change to the expense DOCUMENT (header + lines), keeping the SAME expense_number;
 *   3. re-posts the corrected entry on the SAME source (same source type / id, same accounts, amounts, party, load,
 *      class) as a new posting batch keyed `<original key>:correction:r<N>` through the one posting-line writer — so a
 *      fuel receipt's identity (fuel.fuel_receipt_postings, 443.121 #1) is freed by the reversal and re-registered on the
 *      new batch, and the expense points at the new entry;
 *   4. writes one audit row (expense.posted_corrected) with before / after and the three journal entries.
 *
 * CORRECTABLE FIELDS (the defined set): driver, trailer (a trailer the company owns or leases), memo. These are the
 * document attributes a correction can change without new posting math, so the re-posted entry carries the same money
 * and the same accounts as the original. Every other field (amount, account, item, vendor, date, unit, load) is refused
 * by name: a load move has its own engine (POST /api/v1/expenses/:id/reattribute, pair JE), and a money change is a void
 * and a new document. Refused as well: a void / unposted expense, a bank-matched expense (a correction must not silently
 * unmatch a bank line), and a closed period.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { resolveFillDriverAtTime } from "../fuel/fuel-load-at-time.js";
import { ensureOpenPeriod } from "./posting-engine.service.js";
import { postValidatedPostingLinesInClientTx } from "./posting-engine.service.js";
import { reverseJournalEntryNoFlip } from "./journal-entries.service.js";

type Queryable = {
  query: <R extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }>;
};

export const EXPENSE_CORRECTED_EVENT = "expense.posted_corrected";
export const CORRECTABLE_EXPENSE_FIELDS = ["driver_id", "trailer_id", "memo"] as const;

export type ExpenseCorrectionChanges = {
  driver_id?: string | null;
  trailer_id?: string | null;
  memo?: string | null;
  /** Resolve the driver the way a fuel receipt does (resolveFillDriverAtTime) from the fill this expense was posted from. */
  driver_from_fill?: boolean;
};

export type ExpenseCorrectionResult =
  | {
      outcome: "corrected" | "planned";
      expense_id: string;
      expense_number: string | null;
      before: CorrectableState;
      after: CorrectableState;
      original_journal_entry_id: string;
      reversal_journal_entry_id: string | null;
      new_journal_entry_id: string | null;
      correction_revision: number;
    }
  | { outcome: "unchanged"; expense_id: string; expense_number: string | null; state: CorrectableState }
  | { outcome: "refused"; expense_id: string; reason: string };

type CorrectableState = { driver_id: string | null; trailer_id: string | null; memo: string | null };

export class ExpenseCorrectionRefused extends Error {
  constructor(readonly reason: string) {
    super(`expense_correction_refused: ${reason}`);
    this.name = "ExpenseCorrectionRefused";
  }
}


/** The driver a fuel receipt document should carry, resolved from the fill it was posted from (443.126 rule). */
async function driverFromFill(client: Queryable, operatingCompanyId: string, journalEntryId: string, unitId: string | null, loadId: string | null) {
  const src = (await client.query<{ st: string; sid: string }>(
    `SELECT DISTINCT source_transaction_type AS st, source_transaction_id::text AS sid
       FROM accounting.journal_entry_postings
      WHERE journal_entry_uuid = $1::uuid AND operating_company_id = $2::uuid AND reversal_of_line_id IS NULL`,
    [journalEntryId, operatingCompanyId]
  )).rows;
  const fuel = src.find((s) => s.st === "fuel_event");
  if (!fuel) return null;
  const relay = (await client.query<{ matched_driver_id: string | null; matched_unit_id: string | null; at: string }>(
    `SELECT matched_driver_id::text, matched_unit_id::text, relay_created_at::text AS at
       FROM integrations.relay_fuel_transactions WHERE id::text = $1 AND operating_company_id = $2::uuid LIMIT 1`,
    [fuel.sid, operatingCompanyId]
  )).rows[0];
  const card = relay
    ? null
    : (await client.query<{ driver_id: string | null; unit_id: string | null; at: string }>(
        `SELECT driver_id::text, unit_id::text, COALESCE(transaction_at, created_at)::text AS at
           FROM fuel.fuel_transactions WHERE id::text = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [fuel.sid, operatingCompanyId]
      )).rows[0];
  const at = relay?.at ?? card?.at;
  if (!at) return null;
  const resolved = await resolveFillDriverAtTime(client as never, {
    operatingCompanyId,
    matchedDriverId: relay?.matched_driver_id ?? card?.driver_id ?? null,
    unitId: relay?.matched_unit_id ?? card?.unit_id ?? unitId,
    at,
    loadId,
  });
  return resolved?.driver_id ?? null;
}

export async function correctPostedExpense(
  client: Queryable,
  input: {
    operatingCompanyId: string;
    expenseId: string;
    changes: ExpenseCorrectionChanges & Record<string, unknown>;
    actorUserId: string;
    reason: string;
    dryRun?: boolean;
  }
): Promise<ExpenseCorrectionResult> {
  const co = input.operatingCompanyId;
  const refuse = (reason: string): ExpenseCorrectionResult => ({ outcome: "refused", expense_id: input.expenseId, reason });
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 3) return refuse("reason_required");

  const unsupported = Object.keys(input.changes).filter(
    (k) => !(CORRECTABLE_EXPENSE_FIELDS as readonly string[]).includes(k) && k !== "driver_from_fill" && input.changes[k] !== undefined
  );
  if (unsupported.length) return refuse(`correction_field_not_supported: ${unsupported.join(", ")}`);

  const exp = (await client.query<{
    id: string;
    expense_number: string | null;
    status: string;
    posting_status: string;
    journal_entry_id: string | null;
    driver_uuid: string | null;
    trailer_id: string | null;
    memo: string | null;
    unit_id: string | null;
    load_id: string | null;
    transaction_date: string;
    voided_at: string | null;
  }>(
    `SELECT id::text, expense_number, status, posting_status, journal_entry_id::text, driver_uuid::text, trailer_id::text, memo,
            unit_id::text, load_id::text, transaction_date::text, voided_at::text
       FROM accounting.expenses
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      FOR UPDATE`,
    [input.expenseId, co]
  )).rows[0];
  if (!exp) return refuse("expense_not_found");
  if (exp.voided_at || exp.status === "void" || exp.posting_status !== "posted" || !exp.journal_entry_id) {
    return refuse(`expense_not_posted: status=${exp.status} posting_status=${exp.posting_status}`);
  }

  const before: CorrectableState = { driver_id: exp.driver_uuid, trailer_id: exp.trailer_id, memo: exp.memo };
  const after: CorrectableState = { ...before };

  let driverId = input.changes.driver_id;
  if (input.changes.driver_from_fill) {
    const resolved = await driverFromFill(client, co, exp.journal_entry_id, exp.unit_id, exp.load_id);
    if (!resolved) return refuse("driver_not_resolvable_from_fill");
    driverId = resolved;
  }
  if (driverId !== undefined) {
    if (driverId !== null) {
      const ok = await client.query(`SELECT 1 FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`, [driverId, co]);
      if (!ok.rows.length) return refuse("driver_not_in_company");
    }
    after.driver_id = driverId;
  }
  if (input.changes.trailer_id !== undefined) {
    const t = input.changes.trailer_id;
    if (t !== null) {
      const ok = await client.query(
        `SELECT 1 FROM mdata.equipment
          WHERE id = $1::uuid AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid) LIMIT 1`,
        [t, co]
      );
      if (!ok.rows.length) return refuse("trailer_not_in_company_fleet");
    }
    after.trailer_id = t;
  }
  if (input.changes.memo !== undefined) after.memo = input.changes.memo === null ? null : String(input.changes.memo).slice(0, 2000);

  if (after.driver_id === before.driver_id && after.trailer_id === before.trailer_id && after.memo === before.memo) {
    return { outcome: "unchanged", expense_id: exp.id, expense_number: exp.expense_number, state: before };
  }

  const matched = await client.query(
    `SELECT 1 FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL
        AND (matched_journal_entry_id = $2::uuid OR matched_expense_id = $3::uuid) LIMIT 1`,
    [co, exp.journal_entry_id, exp.id]
  );
  if (matched.rows.length) return refuse("expense_bank_matched: unmatch the bank line first, then correct");

  try {
    await ensureOpenPeriod(client as never, co, exp.transaction_date);
  } catch {
    return refuse(`period_closed: ${exp.transaction_date}`);
  }

  const lines = (await client.query<{
    id: string;
    line_sequence: number;
    account_id: string;
    debit_or_credit: "debit" | "credit";
    amount_cents: string;
    description: string | null;
    source_transaction_type: string;
    source_transaction_id: string;
    source_transaction_line_id: string | null;
    posting_batch_id: string | null;
    class_id: string | null;
    entity_uuid: string | null;
    entity_type: string | null;
    location_id: string | null;
    load_id: string | null;
    settlement_id: string | null;
    link_type: string | null;
    link_id: string | null;
    link_role: string | null;
  }>(
    `SELECT p.id::text, p.line_sequence, p.account_id::text, p.debit_or_credit, p.amount_cents::text, p.description,
            p.source_transaction_type, p.source_transaction_id::text, p.source_transaction_line_id::text, p.posting_batch_id::text,
            p.class_id::text, p.entity_uuid::text, p.entity_type, p.location_id::text, p.load_id::text, p.settlement_id::text,
            l.linked_object_type AS link_type, l.linked_object_id::text AS link_id, l.relationship_role AS link_role
       FROM accounting.journal_entry_postings p
       LEFT JOIN LATERAL (
         SELECT linked_object_type, linked_object_id, relationship_role FROM accounting.transaction_source_links t
          WHERE t.journal_entry_posting_id = p.id AND t.operating_company_id = p.operating_company_id
          ORDER BY t.created_at LIMIT 1) l ON true
      WHERE p.journal_entry_uuid = $1::uuid AND p.operating_company_id = $2::uuid AND p.reversal_of_line_id IS NULL
      ORDER BY p.line_sequence`,
    [exp.journal_entry_id, co]
  )).rows;
  if (!lines.length) return refuse("original_entry_has_no_lines");
  const net = lines.reduce((t, l) => t + (l.debit_or_credit === "debit" ? 1 : -1) * Number(l.amount_cents), 0);
  if (net !== 0) return refuse("original_entry_not_balanced");
  const batchIds = [...new Set(lines.map((l) => l.posting_batch_id).filter(Boolean))] as string[];
  if (batchIds.length !== 1) return refuse(`original_entry_batch_not_single: ${batchIds.length}`);
  const batch = (await client.query<{ source_transaction_type: string; source_transaction_id: string; idempotency_key: string; posting_template_id: string | null; source_template_code: string | null }>(
    `SELECT source_transaction_type, source_transaction_id::text, idempotency_key, posting_template_id::text, source_template_code
       FROM accounting.posting_batches WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [batchIds[0], co]
  )).rows[0];
  if (!batch) return refuse("original_batch_not_found");
  const baseKey = batch.idempotency_key.replace(/:correction:r\d+$/, "");
  const prior = (await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM accounting.posting_batches
      WHERE operating_company_id = $1::uuid AND idempotency_key LIKE $2`,
    [co, `${baseKey}:correction:r%`]
  )).rows[0];
  const revision = Number(prior?.n ?? 0) + 1;

  if (input.dryRun) {
    return {
      outcome: "planned",
      expense_id: exp.id,
      expense_number: exp.expense_number,
      before,
      after,
      original_journal_entry_id: exp.journal_entry_id,
      reversal_journal_entry_id: null,
      new_journal_entry_id: null,
      correction_revision: revision,
    };
  }

  const original = (await client.query<{ entry_date: string; memo: string | null }>(
    `SELECT entry_date::text, memo FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [exp.journal_entry_id, co]
  )).rows[0]!;
  const correctionMemo = `Correction of expense ${exp.expense_number ?? exp.id}: ${reason}`.slice(0, 500);

  // 1. Reverse the live entry through the canonical reverser.
  const reversed = await reverseJournalEntryNoFlip(client as never, {
    operatingCompanyId: co,
    journalEntryId: exp.journal_entry_id,
    reason: correctionMemo,
    actorUserId: input.actorUserId,
    // The company business day (America/Chicago), never the host UTC day — after ~19:00 Chicago the UTC day is tomorrow.
    currentBusinessDate: companyBusinessDate(),
  });
  const reversal = reversed.reversal;
  if (reversal.closed_period_reversal) throw new ExpenseCorrectionRefused(`period_closed: ${original.entry_date}`);

  // 2. The document change, same expense_number.
  await client.query(
    `UPDATE accounting.expenses
        SET driver_uuid = $3::uuid, trailer_id = $4::uuid, memo = $5, updated_at = now(), updated_by_user_id = $6::uuid
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [exp.id, co, after.driver_id, after.trailer_id, after.memo, input.actorUserId]
  );
  if (after.driver_id !== before.driver_id) {
    await client.query(`UPDATE accounting.expense_lines SET driver_id = $3::uuid WHERE expense_id = $1::uuid AND operating_company_id = $2::uuid`, [exp.id, co, after.driver_id]);
  }
  if (after.trailer_id !== before.trailer_id) {
    await client.query(`UPDATE accounting.expense_lines SET trailer_id = $3::uuid WHERE expense_id = $1::uuid AND operating_company_id = $2::uuid`, [exp.id, co, after.trailer_id]);
  }

  // 3. Re-post the corrected entry on the same source, same money, through the one posting-line writer.
  const newKey = `${baseKey}:correction:r${revision}`;
  const newBatch = (await client.query<{ id: string }>(
    `INSERT INTO accounting.posting_batches (operating_company_id, batch_status, source_transaction_type, source_transaction_id,
                                             idempotency_key, created_by_user_id, posting_template_id, source_template_code, created_at, updated_at)
     VALUES ($1::uuid, 'in_progress', $2, $3, $4, $5::uuid, $6::uuid, $7, now(), now())
     RETURNING id::text`,
    [co, batch.source_transaction_type, batch.source_transaction_id, newKey, input.actorUserId, batch.posting_template_id, batch.source_template_code]
  )).rows[0]!;
  const newJe = (await client.query<{ id: string }>(
    `INSERT INTO accounting.journal_entries (operating_company_id, entry_date, memo, status, source, journal_entry_type_id,
                                             created_by_user_id, qbo_sync_pending, is_sample_data, created_at, updated_at)
     SELECT operating_company_id, entry_date, $3, 'posted', source, journal_entry_type_id, $4::uuid, true, is_sample_data, now(), now()
       FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid
     RETURNING id::text`,
    [exp.journal_entry_id, co, `${original.memo ?? ""} (corrected: ${reason})`.slice(0, 500), input.actorUserId]
  )).rows[0]!;
  const postingLines: Parameters<typeof postValidatedPostingLinesInClientTx>[1] = [];
  let seq = 1;
  for (const l of lines) {
    postingLines.push({
      operating_company_id: co,
      journal_entry_uuid: newJe.id,
      line_sequence: seq++,
      account_id: l.account_id,
      debit_or_credit: l.debit_or_credit,
      amount_cents: Number(l.amount_cents),
      description: l.description,
      source_transaction_type: l.source_transaction_type,
      source_transaction_id: l.source_transaction_id,
      source_transaction_line_id: l.source_transaction_line_id,
      posting_batch_id: newBatch.id,
      idempotency_key: newKey,
      class_id: l.class_id,
      entity_uuid: l.entity_uuid,
      entity_type: l.entity_type,
      location_id: l.location_id,
      load_id: l.load_id,
      settlement_id: l.settlement_id,
      ...(l.link_role ? { relationship_role: l.link_role } : {}),
      ...(l.link_type && l.link_id ? { spine_link: { linked_object_type: l.link_type, linked_object_id: l.link_id } } : {}),
    });
  }
  await postValidatedPostingLinesInClientTx(client as never, postingLines);
  await client.query(`UPDATE accounting.posting_batches SET batch_status = 'posted', updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [newBatch.id, co]);
  await client.query(`UPDATE accounting.expenses SET journal_entry_id = $3::uuid, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [exp.id, co, newJe.id]);

  // 4. One audit row.
  await appendCrudAudit(
    client as never,
    input.actorUserId,
    EXPENSE_CORRECTED_EVENT,
    {
      operating_company_id: co,
      expense_id: exp.id,
      expense_number: exp.expense_number,
      reason,
      before,
      after,
      original_journal_entry_id: exp.journal_entry_id,
      reversal_journal_entry_id: reversal.reversal_journal_entry_id,
      new_journal_entry_id: newJe.id,
      correction_revision: revision,
    },
    "info",
    "LEAD-443.129"
  );

  return {
    outcome: "corrected",
    expense_id: exp.id,
    expense_number: exp.expense_number,
    before,
    after,
    original_journal_entry_id: exp.journal_entry_id,
    reversal_journal_entry_id: reversal.reversal_journal_entry_id,
    new_journal_entry_id: newJe.id,
    correction_revision: revision,
  };
}
