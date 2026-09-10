/** Allocate inside the caller's transaction; the database serializes the company/year counter. */
export async function allocateSettlementDisplayId(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
  operatingCompanyId: string,
  periodDate: string,
): Promise<string> {
  const result = await client.query(
    `SELECT driver_finance.next_settlement_display_id($1::uuid, $2::date) AS next_id`,
    [operatingCompanyId, periodDate],
  );
  const id = (result.rows[0] as { next_id?: unknown } | undefined)?.next_id;
  if (typeof id !== "string" || !/^S-\d{4}-\d{4}$/.test(id)) {
    throw new Error("Settlement number allocation failed: expected S-YYYY-NNNN");
  }
  return id;
}
