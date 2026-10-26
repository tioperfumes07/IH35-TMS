/**
 * OWNER LAW 2026-10-02 — a Relay fill is POSTED when its card bank line is matched in Banking and that match carries a
 * journal entry; never the hand-set integrations.relay_fuel_transactions.posted_to_gl staging flag. One expression, read
 * by the relay-fills list (its posted_to_gl column and its unposted filter) and by the Vendors board's Unposted fuel tile,
 * so the tile and the list it drills to cannot disagree. Caller binds company scope.
 */
export function relayFillPostedSql(alias: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error("invalid SQL alias");
  return `EXISTS (SELECT 1 FROM banking.bank_transactions bt
                   WHERE bt.matched_relay_fuel_transaction_id = ${alias}.id AND bt.operating_company_id = ${alias}.operating_company_id
                     AND bt.voided_at IS NULL AND bt.matched_journal_entry_id IS NOT NULL)`;
}
