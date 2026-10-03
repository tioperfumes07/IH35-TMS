/**
 * ROUND 363-CC3-B / LAW 363.9 — a send-back KEEPS the accepted match and records the release beside it.
 *
 * Every path that returns a bank line to For review (unmatch, the bank-line state machine's undo, a document void, a
 * transfer revoke, the governed purge reset) calls releaseBankLineMatches() BEFORE it clears the line's matched_*
 * pointers, in the same transaction. The database function banking.release_bank_line_matches() turns each match the line
 * carries into a 'released' banking.reconciliation_matches row — the accepted fact (matched_at / matched_by) untouched,
 * the release (who, when, why, how) beside it — so the line goes back to For review and what it was matched to, load
 * included, stays readable. The deferred trigger trg_send_back_keeps_the_match refuses a COMMIT that cleared a pointer
 * with no released row (migration 202615330930).
 *
 * attachReleaseReversal() names the reversal a send-back produced on the released rows and links the reversal's
 * postings to the bank line (transaction_source_links, role 'released_from_bank_line'), so the reversal reaches the
 * bank line from the ledger side.
 */
type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export type BankLineReleaseKind = "unmatch" | "undo" | "void" | "transfer_revoke" | "purge_reset";

export async function releaseBankLineMatches(
  client: Queryable,
  input: { bankTransactionId: string; kind: BankLineReleaseKind; reason: string; actorUserId: string | null }
): Promise<number> {
  const r = await client.query(
    `SELECT banking.release_bank_line_matches($1::uuid, $2::text, $3::text, $4::uuid) AS n`,
    [input.bankTransactionId, input.kind, input.reason, input.actorUserId]
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Release every line a WHERE clause selects (same placeholders as the caller's own reset statement). */
export async function releaseBankLineMatchesWhere(
  client: Queryable,
  whereSql: string,
  params: unknown[],
  input: { kind: BankLineReleaseKind; reason: string; actorUserId: string | null }
): Promise<number> {
  const k = params.length + 1;
  const r = await client.query(
    `SELECT coalesce(sum(banking.release_bank_line_matches(id, $${k}::text, $${k + 1}::text, $${k + 2}::uuid)), 0)::int AS n
       FROM banking.bank_transactions
      WHERE ${whereSql}`,
    [...params, input.kind, input.reason, input.actorUserId]
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** The released matches of this line, in this transaction — what a send-back just let go of. */
export async function releasedInThisTransaction(
  client: Queryable,
  bankTransactionId: string
): Promise<Array<{ kind: string; id: string }>> {
  const r = await client.query(
    `SELECT ledger_entry_kind AS kind, ledger_entry_id::text AS id
       FROM banking.reconciliation_matches
      WHERE bank_transaction_id = $1::uuid AND match_state = 'released' AND released_at = now()
      ORDER BY ledger_entry_kind, ledger_entry_id`,
    [bankTransactionId]
  );
  return r.rows as Array<{ kind: string; id: string }>;
}

/** For each original JE a send-back reversed, attach its reversal to the bank line (both directions). */
export async function attachReleaseReversals(
  client: Queryable,
  bankTransactionId: string,
  originalJournalEntryIds: string[]
): Promise<void> {
  if (!originalJournalEntryIds.length) return;
  const r = await client.query(
    `SELECT reversed_by_je_id::text AS id FROM accounting.journal_entries
      WHERE id = ANY($1::uuid[]) AND reversed_by_je_id IS NOT NULL`,
    [originalJournalEntryIds]
  );
  for (const row of r.rows as Array<{ id: string }>) {
    await client.query(`SELECT banking.attach_release_reversal($1::uuid, $2::uuid)`, [bankTransactionId, row.id]);
  }
}
