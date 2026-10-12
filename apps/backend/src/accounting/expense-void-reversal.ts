/**
 * ACCT-F4431310 — ONE reversal for voiding an expense DOCUMENT, whatever posted it.
 *
 * Before this, all four expense void paths (POST /api/v1/expenses/:id/void, the bulk void, the shared void door
 * voidDocument('expense'), the governance executor) reversed only postings whose source_transaction_type is 'expense'
 * and swallowed SOURCE_NOT_FOUND. A fuel receipt document (443.116 / 443.121: posted on receipt under source
 * 'fuel_event', the expense document adopting that entry through the receipt identity fuel.fuel_receipt_postings) has NO
 * 'expense' postings — so the void flipped the document to void and LEFT ITS JOURNAL ENTRY LIVE.
 *
 * Now the void decides POSITIVELY what is live for the document, never by catching an error:
 *   1. its own live 'expense' lines (not themselves a reversal, not yet reversed) -> the caller's expense reverser;
 *   2. the fuel_event entry its receipt identity points at (findPostedFuelReceipt(..., 'expense', id)) and the fuel_event
 *      lines of the entry the document is stamped with (expenses.journal_entry_id) -> postVoidReversal('fuel_event',
 *      <fill id>), the canonical fuel reverser (void.service.ts ROUND 125/126). Reversing that entry releases the receipt
 *      identity (fuel.fuel_receipt_postings release trigger), so the fill may post again if it is ever re-received.
 * Nothing live -> null (an unposted document is a status change). Any reversal error is RAISED — a void that cannot
 * reverse its money refuses, and the document stays live.
 */
import { reversePostedSourceTransactionInClientTx } from "./posting-engine.service.js";
import { postVoidReversal } from "./void.service.js";
import { findPostedFuelReceipt } from "./fuel-posting/poster.service.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type ExpenseDocumentLivePostings = {
  /** The document's own 'expense' lines are live. */
  expense_source_live: boolean;
  /** Fuel fills (source 'fuel_event') whose live entry this document carries. */
  fuel_event_sources: string[];
};

/** What is LIVE in the ledger for an expense document — decided by reading, never by catching an error. */
export async function resolveExpenseDocumentLivePostings(
  client: Queryable,
  operatingCompanyId: string,
  expenseId: string
): Promise<ExpenseDocumentLivePostings> {
  const own = await client.query<{ live: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM accounting.journal_entry_postings p
        WHERE p.operating_company_id = $1::uuid
          AND p.source_transaction_type = 'expense' AND p.source_transaction_id = $2::text
          AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL) AS live`,
    [operatingCompanyId, expenseId]
  );
  const fuel = new Set<string>();
  const receipt = await findPostedFuelReceipt(client as never, operatingCompanyId, "expense", expenseId);
  const jeIds = [receipt?.journal_entry_id ?? null];
  const stamped = await client.query<{ je: string | null }>(
    `SELECT journal_entry_id::text AS je FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [expenseId, operatingCompanyId]
  );
  jeIds.push(stamped.rows[0]?.je ?? null);
  const live = jeIds.filter((x): x is string => !!x);
  if (live.length) {
    const src = await client.query<{ id: string }>(
      `SELECT DISTINCT p.source_transaction_id AS id FROM accounting.journal_entry_postings p
        WHERE p.operating_company_id = $1::uuid AND p.journal_entry_uuid = ANY($2::uuid[])
          AND p.source_transaction_type = 'fuel_event'
          AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL`,
      [operatingCompanyId, live]
    );
    for (const r of src.rows) if (r.id) fuel.add(r.id);
  }
  return { expense_source_live: own.rows[0]?.live === true, fuel_event_sources: [...fuel] };
}

export type ExpenseDocumentReversal = { reversal_journal_entry_id: string | null; reversed: { source_type: string; source_id: string; journal_entry_id: string | null }[] };

/**
 * Reverse everything live for an expense document, in the caller's transaction. `expenseReverser` keeps each caller's
 * existing engine for the document's OWN lines ('source' = reversePostedSourceTransactionInClientTx, 'void' =
 * postVoidReversal); fuel_event entries always go through postVoidReversal. Errors propagate — never swallowed.
 */
export async function reverseExpenseDocumentInClientTx(
  client: Queryable,
  input: {
    operatingCompanyId: string;
    expenseId: string;
    actorUserId: string;
    currentBusinessDate: string;
    memo: string;
    expenseReverser: "source" | "void";
  }
): Promise<ExpenseDocumentReversal> {
  const live = await resolveExpenseDocumentLivePostings(client as never, input.operatingCompanyId, input.expenseId);
  const date = await client.query<{ d: string | null }>(
    `SELECT transaction_date::text AS d FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.expenseId, input.operatingCompanyId]
  );
  const originalDate = (date.rows[0]?.d ?? input.currentBusinessDate).slice(0, 10);
  const reversed: ExpenseDocumentReversal["reversed"] = [];
  if (live.expense_source_live) {
    if (input.expenseReverser === "source") {
      const rev = await reversePostedSourceTransactionInClientTx(
        client as never,
        { operating_company_id: input.operatingCompanyId, source_transaction_type: "expense", source_transaction_id: input.expenseId },
        { userId: input.actorUserId },
        input.currentBusinessDate
      );
      reversed.push({ source_type: "expense", source_id: input.expenseId, journal_entry_id: rev.journal_entry_id ?? null });
    } else {
      const rev = await postVoidReversal(
        client as never,
        { operatingCompanyId: input.operatingCompanyId, entityType: "expense", entityId: input.expenseId, originalDate, memo: input.memo, currentDate: input.currentBusinessDate },
        { userId: input.actorUserId }
      );
      reversed.push({ source_type: "expense", source_id: input.expenseId, journal_entry_id: rev.reversal_journal_entry_id });
    }
  }
  for (const fillId of live.fuel_event_sources) {
    const rev = await postVoidReversal(
      client as never,
      { operatingCompanyId: input.operatingCompanyId, entityType: "fuel_event", entityId: fillId, originalDate, memo: input.memo, currentDate: input.currentBusinessDate },
      { userId: input.actorUserId }
    );
    if (!rev.reversal_journal_entry_id) {
      throw new Error(`expense_void_fuel_reversal_missing: fuel_event ${fillId} for expense ${input.expenseId} was live but produced no reversal`);
    }
    reversed.push({ source_type: "fuel_event", source_id: fillId, journal_entry_id: rev.reversal_journal_entry_id });
  }
  return { reversal_journal_entry_id: reversed[0]?.journal_entry_id ?? null, reversed };
}
