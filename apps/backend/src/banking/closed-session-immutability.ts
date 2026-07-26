/**
 * BANK-DOM-02 — closed reconciliation sessions are immutable (QBO/NetSuite reconcile lock).
 * Shared with ACCT-DOM-03 under the system-wide "no writes to a closed period/session" invariant.
 *
 * Server-side fail-loud gate. DB trigger in 202609060000_* is defense-in-depth after Neon-apply.
 */

export class ReconciledSessionLockedError extends Error {
  readonly code = "reconciled_session_locked" as const;
  constructor(message = "Transaction belongs to a closed reconciliation session and cannot be mutated") {
    super(message);
    this.name = "ReconciledSessionLockedError";
  }
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, vals?: unknown[]) => Promise<{ rows: R[] }>;
};

/**
 * Refuse mutations when the bank txn sits inside a status='reconciled' session
 * (explicit reconciliation_session_id OR date-window membership on the same account).
 */
export async function assertBankTxnNotInReconciledSession(
  client: Queryable,
  txnId: string,
  operatingCompanyId: string
): Promise<void> {
  const res = await client.query<{ locked: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM banking.bank_transactions bt
        WHERE bt.id = $1::uuid
          AND bt.operating_company_id = $2::uuid
          AND (
            EXISTS (
              SELECT 1
              FROM banking.reconciliation_sessions rs
              WHERE rs.id = bt.reconciliation_session_id
                AND rs.operating_company_id = bt.operating_company_id
                AND rs.status = 'reconciled'
            )
            OR EXISTS (
              SELECT 1
              FROM banking.reconciliation_sessions rs
              WHERE rs.bank_account_id = bt.bank_account_id
                AND rs.operating_company_id = bt.operating_company_id
                AND rs.status = 'reconciled'
                AND bt.transaction_date BETWEEN rs.period_start AND rs.period_end
            )
          )
      ) AS locked
    `,
    [txnId, operatingCompanyId]
  );
  if (res.rows[0]?.locked) {
    throw new ReconciledSessionLockedError();
  }
}

export async function assertBankTxnsNotInReconciledSession(
  client: Queryable,
  txnIds: string[],
  operatingCompanyId: string
): Promise<void> {
  if (txnIds.length === 0) return;
  const res = await client.query<{ id: string }>(
    `
      SELECT bt.id
      FROM banking.bank_transactions bt
      WHERE bt.operating_company_id = $1::uuid
        AND bt.id = ANY($2::uuid[])
        AND (
          EXISTS (
            SELECT 1
            FROM banking.reconciliation_sessions rs
            WHERE rs.id = bt.reconciliation_session_id
              AND rs.operating_company_id = bt.operating_company_id
              AND rs.status = 'reconciled'
          )
          OR EXISTS (
            SELECT 1
            FROM banking.reconciliation_sessions rs
            WHERE rs.bank_account_id = bt.bank_account_id
              AND rs.operating_company_id = bt.operating_company_id
              AND rs.status = 'reconciled'
              AND bt.transaction_date BETWEEN rs.period_start AND rs.period_end
          )
        )
      LIMIT 1
    `,
    [operatingCompanyId, txnIds]
  );
  if (res.rows[0]) {
    throw new ReconciledSessionLockedError(
      `Transaction ${res.rows[0].id} belongs to a closed reconciliation session and cannot be mutated`
    );
  }
}
