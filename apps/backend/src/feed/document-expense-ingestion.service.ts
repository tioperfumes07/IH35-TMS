/**
 * ROUND 326 queue item 9 (G-01) — DOCUMENT-EXPENSE INGESTION ENGINE. Reads ONE signed settlement document (the
 * checked-in AlwaysTrack truth JSON, never a re-parsed PDF, never a retyped figure) and creates its EXPENSE lines
 * against the item catalog map (queue item 8). CC-1 builds it; the owner runs it.
 *
 * Why the expenses were missing: seedSettlementDocument is whole-document idempotent — a document that already
 * has a live settlement (made by the Settlement Creator or any other path) returns immediately, so none of its
 * expense lines were ever created. This engine ingests ONLY the expense lines, idempotent per line, onto the
 * document's existing loads:
 *   - dedupeCompanyExpenses: a cost printed once is booked once (byte-identical parser duplicates and driver-
 *     reimbursement echoes are dropped — the same rule the seed uses);
 *   - attributeExpenseLoad: explicit load, else exact fuel vendor+date match, else a single-load document —
 *     never a guess; an unattributed line is reported, not booked;
 *   - seedExpense: idempotent per line (same load + date + amount + memo returns the existing expense), skips a
 *     DEF / reefer line already represented by a card-fuel expense, resolves the item BY ID through the map
 *     (settlement-pdf-item-map) and refuses an unmapped category by name;
 *   - every expense it creates (or finds) carries source_settlement_ref = the document number.
 * Each line runs in its own SAVEPOINT, so one refused line never drops the rest; the result lists every line
 * with its outcome. dry_run plans without writing. Never touches the bank. Expenses are created as drafts
 * exactly like the seed — posting goes through the existing expense posting path.
 */
import { attributeExpenseLoad, dedupeCompanyExpenses, dollarsToCents, seedExpense, type QueryableClient, type TruthCompanyDoc } from "./seed-settlement-document.service.js";
import { matchSettlementPdfItem } from "../catalogs/settlement-pdf-item-map.js";

export type IngestLineOutcome =
  | "created"
  | "already_present"
  | "skipped_card_fuel_duplicate"
  | "planned"
  | "refused_unattributed_load"
  | "refused_load_not_found"
  | "refused_item_not_on_map"
  | "refused";

export type IngestLineResult = {
  date: string;
  vendor: string;
  description: string;
  amount_cents: number;
  load_number: string | null;
  attribution: string | null;
  item_category: string | null;
  outcome: IngestLineOutcome;
  expense_id?: string | null;
  reason?: string;
};

export type DocumentExpenseIngestionResult = {
  document_number: string;
  dry_run: boolean;
  lines_on_document: number;
  lines_after_dedupe: number;
  counts: Partial<Record<IngestLineOutcome, number>>;
  lines: IngestLineResult[];
};

/** Pure: the per-line plan — dedupe, load attribution and item match, no DB. */
export function planDocumentExpenses(operatingCompanyId: string, doc: TruthCompanyDoc) {
  return dedupeCompanyExpenses(doc.expenses).map((e) => {
    const att = attributeExpenseLoad(e, doc);
    const item = matchSettlementPdfItem(operatingCompanyId, { description: e.description, raw: e.raw });
    return {
      line: { date: e.date, vendor: e.vendor, description: e.description, amountCents: dollarsToCents(e.amount), invoice: e.invoice, raw: e.raw, isReimbursementSurvivor: e.isReimbursementSurvivor },
      loadNumber: att?.loadNumber ?? null,
      attribution: att?.method ?? null,
      itemCategory: item?.pdfCategory ?? null,
    };
  });
}

export async function ingestDocumentExpenses(
  client: QueryableClient,
  input: { operatingCompanyId: string; actorUserId: string; doc: TruthCompanyDoc; dryRun?: boolean }
): Promise<DocumentExpenseIngestionResult> {
  const documentNumber = String(input.doc.settlement_no);
  const plan = planDocumentExpenses(input.operatingCompanyId, input.doc);
  const lines: IngestLineResult[] = [];
  for (const p of plan) {
    const base = { date: p.line.date, vendor: p.line.vendor, description: p.line.description, amount_cents: p.line.amountCents, load_number: p.loadNumber, attribution: p.attribution, item_category: p.itemCategory };
    if (!p.loadNumber) { lines.push({ ...base, outcome: "refused_unattributed_load", reason: "no explicit load, no exact fuel vendor+date match, and the document has more than one load" }); continue; }
    if (!p.itemCategory) { lines.push({ ...base, outcome: "refused_item_not_on_map", reason: "category is not on the canonical item map (docs/bus/00-CANONICAL-ITEM-AND-ACCOUNT-MAP.md)" }); continue; }
    const load = (await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 AND voided_at IS NULL LIMIT 1`,
      [input.operatingCompanyId, p.loadNumber]
    )).rows[0];
    if (!load) { lines.push({ ...base, outcome: "refused_load_not_found", reason: `load ${p.loadNumber} does not exist in this company` }); continue; }
    if (input.dryRun) { lines.push({ ...base, outcome: "planned" }); continue; }
    await client.query("SAVEPOINT doc_expense_line");
    try {
      const before = (await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM accounting.expenses WHERE operating_company_id = $1::uuid AND load_id = $2::uuid AND transaction_date = $3::date AND total_amount_cents = $4 AND memo = $5`,
        [input.operatingCompanyId, load.id, p.line.date, p.line.amountCents, p.line.description]
      )).rows[0];
      const expenseId = await seedExpense(client, input.operatingCompanyId, input.actorUserId, load.id, p.loadNumber, p.line);
      if (expenseId) {
        await client.query(
          `UPDATE accounting.expenses SET source_settlement_ref = $3 WHERE id = $1::uuid AND operating_company_id = $2::uuid AND source_settlement_ref IS NULL`,
          [expenseId, input.operatingCompanyId, documentNumber]
        );
      }
      await client.query("RELEASE SAVEPOINT doc_expense_line");
      lines.push({ ...base, expense_id: expenseId, outcome: expenseId == null ? "skipped_card_fuel_duplicate" : Number(before?.n ?? 0) > 0 ? "already_present" : "created" });
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT doc_expense_line");
      lines.push({ ...base, outcome: "refused", reason: (err as Error).message });
    }
  }
  const counts: Partial<Record<IngestLineOutcome, number>> = {};
  for (const l of lines) counts[l.outcome] = (counts[l.outcome] ?? 0) + 1;
  return { document_number: documentNumber, dry_run: Boolean(input.dryRun), lines_on_document: input.doc.expenses.length, lines_after_dedupe: plan.length, counts, lines };
}
