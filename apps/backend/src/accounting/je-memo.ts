/**
 * R-197 (Lead, 2026-09-25) — the journal-entry memo is the one human-readable line on a register row.
 * verify-je-memo-is-human-readable fails a posted memo over 200 characters or one that carries only a UUID.
 * Two reversal writers produced exactly those: postVoidReversal (callers pass "Reversal of journal entry
 * <uuid>: <full void reason>", measured up to 360 chars) and the posting engine's source reversal
 * ("Reversal of <uuid>", nothing a person can read). The full reason is never lost — it stays on the voided
 * document's void_reason and in the audit trail; the memo is the label.
 */
export const JE_MEMO_MAX_CHARS = 200;

/** Bound a memo to the register's 200-character label, marking the cut with an ellipsis. */
export function boundJeMemo(memo: string): string {
  const s = String(memo ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= JE_MEMO_MAX_CHARS) return s;
  return `${s.slice(0, JE_MEMO_MAX_CHARS - 1).trimEnd()}…`;
}

type Q = { query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[] }> };

/** The document's own human number (expense_number, bill_number, invoice display_id), or null. */
export async function sourceDocumentLabel(client: Q, operatingCompanyId: string, sourceType: string, sourceId: string): Promise<string | null> {
  const sql: Record<string, string> = {
    expense: `SELECT 'expense ' || expense_number AS l FROM accounting.expenses WHERE id::text = $2 AND operating_company_id = $1::uuid AND expense_number IS NOT NULL`,
    bill: `SELECT 'bill ' || bill_number AS l FROM accounting.bills WHERE id::text = $2 AND operating_company_id = $1::uuid AND bill_number IS NOT NULL`,
    invoice: `SELECT 'invoice ' || display_id AS l FROM accounting.invoices WHERE id::text = $2 AND operating_company_id = $1::uuid AND display_id IS NOT NULL`,
  };
  const q = sql[sourceType];
  if (!q) return null;
  // No try/catch: inside a transaction a failed statement aborts it, so a swallowed error would poison the
  // reversal silently. These three tables and columns exist on every environment.
  const r = await client.query<{ l: string | null }>(q, [operatingCompanyId, sourceId]);
  return r.rows[0]?.l ?? null;
}
