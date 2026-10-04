// ROUND 390 (a)/(b)/(c) — NO ORPHANED GL (Lead, 2026-10-04, AUTH-397-UNWIND root cause).
//
// Measured live: 60 of the 61 double-reversal originals had NO expense record — the document was removed and its
// journal entries were LEFT, still holding the money; the void engine then re-reversed the orphans (ACCT-F397).
// The rule, enforced in three places that share this file's definitions:
//   (a) a document with LIVE postings (not reversed, not a reversal) is never removed — reverse (void) it first;
//   (b) a document is never removed while ANY posting still names it — its journal entries go with it, or it stays;
//   (c) GL whose document is already gone is DETECTED and reported (scripts/verify-no-orphaned-gl.mjs --live).
// The database enforces (b) at COMMIT (migration 202615410100, trg_refuse_document_delete_leaving_gl); the purge
// engine (scripts/ops/2026-10-02-cc1-r326-complete-delete.ts) refuses (a) and (b) in its plan and proves (b) again
// after its deletes, in the same transaction. The pure functions below are what the guard's selftest plants against.

/** Document table -> the journal_entry_postings.source_transaction_type values that name its rows. */
export const DOC_SOURCE = {
  "accounting.expenses": ["expense"],
  "accounting.invoices": ["invoice"],
  "accounting.bills": ["bill"],
  "accounting.bill_payments": ["bill_payment"],
  "accounting.payments": ["payment", "customer_payment"],
  "driver_finance.driver_settlements": ["driver_settlement"],
  "mdata.loads": ["load"],
  "accounting.factoring_advances": ["factoring_advance"],
};

const TYPE_TO_TABLE = Object.fromEntries(Object.entries(DOC_SOURCE).flatMap(([t, types]) => types.map((ty) => [ty, t])));

/** A posting is LIVE when it is neither reversed nor itself a reversal. */
export const isLive = (p) => !p.reversed_by_line_id && !p.reversal_of_line_id;

/**
 * The purge plan's verdict, pure.
 *   plannedDocs:     { [table]: string[] }  documents the plan removes
 *   postings:        every posting naming one of them: { id, source_transaction_type, source_transaction_id,
 *                    reversed_by_line_id, reversal_of_line_id }
 *   plannedLineIds:  Set<string> of posting ids the plan removes
 * Returns problems (empty = the plan leaves no orphan and removes no live GL).
 */
export function orphanPlanProblems(plannedDocs, postings, plannedLineIds) {
  const problems = [];
  const docSet = new Set(Object.entries(plannedDocs).flatMap(([t, ids]) => ids.map((id) => `${t}|${id}`)));
  const byDoc = new Map();
  for (const p of postings) {
    const table = TYPE_TO_TABLE[p.source_transaction_type];
    if (!table) continue;
    const key = `${table}|${p.source_transaction_id}`;
    if (!docSet.has(key)) continue;
    if (!byDoc.has(key)) byDoc.set(key, { left: 0, live: 0 });
    const d = byDoc.get(key);
    if (!plannedLineIds.has(p.id)) d.left += 1;
    if (isLive(p)) d.live += 1;
  }
  for (const [key, d] of byDoc) {
    const [table, id] = key.split("|");
    if (d.live) problems.push(`BLOCKER ${table} ${id}: ${d.live} LIVE posting line(s) — reverse (void) the document first; a document with live GL is never removed`);
    if (d.left) problems.push(`BLOCKER ${table} ${id}: ${d.left} posting line(s) naming it are NOT in the plan — removing it would leave orphaned GL`);
  }
  return problems;
}

/**
 * SQL (one statement, company-scoped): per document table, the posting lines whose named document no longer exists,
 * and — netted over the WHOLE ENTRIES those lines sit in, every source label together — how many accounts do not net to
 * zero. Netting only the lines carrying one label counted one side of a pair: a void relabelled the 1150 reversal leg
 * `invoice` while the original 1150 leg was `load`, and the invoice-only sum reported +$89,469.00 that netted $0.00
 * (AUTH-400, 2026-10-04). An entry, not a label, is what balances.
 */
export function orphanCountSql() {
  return Object.entries(DOC_SOURCE).map(([table, types]) => {
    const where = (a) => `${a}.operating_company_id = $1::uuid
        AND ${a}.source_transaction_type IN (${types.map((t) => `'${t}'`).join(", ")})
        AND NOT EXISTS (SELECT 1 FROM ${table} d WHERE d.id::text = ${a}.source_transaction_id)`;
    return `SELECT '${table}' AS doc_table, a.lines, a.docs, a.live_lines, a.entries,
            (SELECT count(*)::int FROM (
               SELECT q.account_id FROM accounting.journal_entry_postings q
                WHERE q.journal_entry_uuid IN (SELECT o.journal_entry_uuid FROM accounting.journal_entry_postings o WHERE ${where("o")})
                GROUP BY q.account_id
               HAVING sum(CASE WHEN q.debit_or_credit::text = 'debit' THEN q.amount_cents ELSE -q.amount_cents END) <> 0) z) AS nonzero_accounts
       FROM (SELECT count(*)::int AS lines, count(DISTINCT p.source_transaction_id)::int AS docs,
                    count(*) FILTER (WHERE p.reversed_by_line_id IS NULL AND p.reversal_of_line_id IS NULL)::int AS live_lines,
                    count(DISTINCT p.journal_entry_uuid)::int AS entries
               FROM accounting.journal_entry_postings p WHERE ${where("p")}) a`;
  }).join("\nUNION ALL\n");
}
