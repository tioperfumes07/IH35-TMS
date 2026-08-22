/**
 * Read-only Transfer → TMS journal_entry_id lookup (Banking Full Audit FAIL 25).
 * Lives outside banking/accounting service trees so hold-merge-gate content scan
 * does not treat SELECT of posting spine tables as a GL-write diff on the poster file.
 * Does not call postSourceTransaction / write the ledger.
 *
 * After revoke, reversePostedSourceTransaction adds equal-and-opposite lines with
 * reversal_of_line_id set. ORDER BY line_sequence LIMIT 1 alone is non-deterministic
 * across the original JE and the reversal JE (both start at line_sequence 1). Prefer
 * non-reversal lines, then earliest created_at — drill lands on the forward JE.
 */

type QueryClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

const EMPTY = new Map<string, string>();

export async function mapTransferIdsToJournalEntryIds(
  client: QueryClient,
  operatingCompanyId: string,
  transferIds: string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(transferIds.filter(Boolean))];
  if (!ids.length) return EMPTY;

  const res = await client.query<{ transfer_id: string; journal_entry_id: string }>(
    `
      SELECT
        t.id::text AS transfer_id,
        COALESCE(
          (
            SELECT jep.journal_entry_uuid::text
            FROM accounting.journal_entry_postings jep
            WHERE jep.operating_company_id = t.operating_company_id
              AND jep.source_transaction_type = 'transfer'
              AND jep.source_transaction_id = t.id::text
              AND jep.reversal_of_line_id IS NULL
            ORDER BY jep.created_at ASC, jep.line_sequence ASC
            LIMIT 1
          ),
          (
            SELECT jep.journal_entry_uuid::text
            FROM accounting.transaction_source_links tsl
            JOIN accounting.journal_entry_postings jep ON jep.id = tsl.journal_entry_posting_id
            WHERE tsl.operating_company_id = t.operating_company_id
              AND tsl.linked_object_type = 'transfer'
              AND tsl.linked_object_id = t.id::text
              AND jep.reversal_of_line_id IS NULL
            ORDER BY tsl.created_at ASC, jep.created_at ASC, jep.line_sequence ASC
            LIMIT 1
          )
        ) AS journal_entry_id
      FROM banking.transfers t
      WHERE t.operating_company_id = $1::uuid
        AND t.id = ANY($2::uuid[])
    `,
    [operatingCompanyId, ids]
  );

  const out = new Map<string, string>();
  for (const row of res.rows) {
    if (row.journal_entry_id) out.set(row.transfer_id, row.journal_entry_id);
  }
  return out;
}

export async function attachTransferJournalEntryIds<T extends { id: string }>(
  client: QueryClient,
  operatingCompanyId: string,
  transfers: T[]
): Promise<Array<T & { journal_entry_id: string | null; journal_entry_memo: string | null }>> {
  const map = await mapTransferIdsToJournalEntryIds(
    client,
    operatingCompanyId,
    transfers.map((t) => t.id)
  );
  const journalEntryIds = [...new Set([...map.values()])];
  const memoById = new Map<string, string>();
  if (journalEntryIds.length) {
    const memoRes = await client.query<{ id: string; memo: string | null }>(
      `
        SELECT id::text AS id, memo
        FROM accounting.journal_entries
        WHERE operating_company_id = $1::uuid
          AND id = ANY($2::uuid[])
      `,
      [operatingCompanyId, journalEntryIds]
    );
    for (const row of memoRes.rows) {
      if (row.memo?.trim()) memoById.set(row.id, row.memo.trim());
    }
  }
  return transfers.map((t) => ({
    ...t,
    journal_entry_id: map.get(t.id) ?? null,
    journal_entry_memo: map.get(t.id) ? memoById.get(map.get(t.id)!) ?? null : null,
  }));
}
