// Canonical "needs categorization" definition — the SINGLE source shared by the Banking Home
// UNCATEGORIZED KPI and the Transactions "For review" queue so the headline count can never diverge
// from the list it summarizes (BANKING-1).
//
// A bank transaction needs review while its status is either:
//   - 'pending_categorization' — e.g. CSV/statement-imported rows (the current ~2,650 backlog), or
//   - 'uncategorized'          — feed-ingested rows not yet classified.
//
// The Banking Home KPI previously summed views.banking_account_tiles.uncategorized_count, which
// counts ONLY status='uncategorized' → it read 0 while the For-review queue (both statuses) held
// thousands. Both surfaces now derive from this one predicate.

export const PENDING_CATEGORIZATION_STATUSES = ["pending_categorization", "uncategorized"] as const;

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

// SQL boolean predicate for the given `banking.bank_transactions` alias (default `bt`).
export function pendingCategorizationPredicate(alias = "bt"): string {
  return `(${alias}.status = 'pending_categorization' OR ${alias}.status = 'uncategorized')`;
}

// Entity-scoped count of transactions needing categorization, across ALL accounts — the exact
// population the For-review queue lists for the same operating company.
export async function countUncategorizedTransactions(
  client: Queryable,
  operatingCompanyId: string
): Promise<number> {
  const res = await client.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM banking.bank_transactions bt
      WHERE bt.operating_company_id = $1::uuid
        AND ${pendingCategorizationPredicate("bt")}
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}
