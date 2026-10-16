/**
 * OWNER-ORDER 2026-10-02 §3.1 / CC-2 OUTBOX handoff — bank-match Faro reserve posters.
 *
 * CC-2 built postFaroReserveEntryOnClient. Cursor's one match engine
 * (postPendingFaroReserveRowOnAccept + runPaymentAcceptFollowUps +
 * runFactoringAdvanceAcceptFollowUps — 1:1 acceptMatchWithResolveDifference and
 * acceptExactMultiDocumentMatch) is the only caller that posts those rows inside the match
 * transaction. Import creates the bank line; match posts the JE.
 *
 *   reserve row (incl. rsv_deposit) → postFaroReserveEntryOnClient on ITS OWN accepted line (both accept paths)
 *   payment match                   → its own line only (LEAD 443.168 H, owner Law B: the Rsv Deposit side-post is gone)
 *   repurchase (no Faro entry)    → postFactoringChargebackEvent via runFactoringAdvanceAcceptFollowUps
 */
import {
  FaroReserveError,
  postFaroReserveEntryOnClient,
} from "../../factoring/faro-reserve-entries.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export async function loadActorRole(client: DbClient, userId: string): Promise<string> {
  const r = await client.query<{ role: string }>(
    `SELECT role::text AS role FROM identity.users WHERE id = $1::uuid AND deactivated_at IS NULL LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.role ?? "Owner";
}

/** True when the bank account is Faro Escrow (1230) or Faro Cash Reserve (1235) by CoA role. */
export async function isFaroReserveBankAccount(
  client: DbClient,
  operatingCompanyId: string,
  bankAccountId: string
): Promise<boolean> {
  const r = await client.query<{ is_reserve: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
          FROM banking.bank_accounts ba
          JOIN accounting.chart_of_accounts_roles r
            ON r.account_id = ba.ledger_account_id
           AND r.operating_company_id = ba.operating_company_id
           AND r.is_active
         WHERE ba.id = $1::uuid
           AND ba.operating_company_id = $2::uuid
           AND r.role IN ('factor_reserve_held', 'factor_cash_reserve_held')
      ) AS is_reserve
    `,
    [bankAccountId, operatingCompanyId]
  );
  return Boolean(r.rows[0]?.is_reserve);
}

export type FaroReserveBankEntry = {
  id: string;
  entry_kind: string;
  journal_entry_id: string | null;
  bank_transaction_id: string | null;
};

/** The Faro report row that owns this bank line, if any. */
export async function loadFaroReserveEntryForBankTxn(
  client: DbClient,
  operatingCompanyId: string,
  bankTransactionId: string
): Promise<FaroReserveBankEntry | null> {
  const r = await client.query<FaroReserveBankEntry>(
    `SELECT id::text, entry_kind, journal_entry_id::text, bank_transaction_id::text
       FROM accounting.faro_reserve_entries
      WHERE operating_company_id = $1::uuid
        AND bank_transaction_id = $2::uuid
      LIMIT 1`,
    [operatingCompanyId, bankTransactionId]
  );
  return r.rows[0] ?? null;
}

/**
 * Post one Faro reserve bank line through CC-2's poster (same open match client).
 * Returns the JE id and whether the poster already stamped review_state='matched'.
 */
export async function postFaroReserveRowOnBankMatch(
  client: DbClient,
  input: {
    operating_company_id: string;
    entry_id: string;
    actor_user_id: string;
  }
): Promise<{ journal_entry_id: string; poster_cleared_bank: true }> {
  const actor_role = await loadActorRole(client, input.actor_user_id);
  let result: Awaited<ReturnType<typeof postFaroReserveEntryOnClient>>;
  try {
    result = await postFaroReserveEntryOnClient(client, {
      operating_company_id: input.operating_company_id,
      entry_id: input.entry_id,
      actor_user_id: input.actor_user_id,
      actor_role,
    });
  } catch (err) {
    if (err instanceof FaroReserveError) {
      throw new Error(`faro_reserve_match_refused:${err.code}`);
    }
    throw err;
  }
  if ("status" in result) {
    throw new Error(
      `faro_schedule_fee_interest_awaiting_approval:${result.interest_run_id}:${result.interest_due_cents}`
    );
  }
  return { journal_entry_id: result.journal_entry_id, poster_cleared_bank: true };
}

