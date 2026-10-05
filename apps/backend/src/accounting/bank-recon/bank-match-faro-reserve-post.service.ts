/**
 * OWNER-ORDER 2026-10-02 §3.1 / CC-2 OUTBOX handoff — bank-match Faro reserve posters.
 *
 * CC-2 built postFaroReserveEntryOnClient + faroReserveDepositsOn. Cursor's one match engine
 * (postPendingFaroReserveRowOnAccept + runPaymentAcceptFollowUps +
 * runFactoringAdvanceAcceptFollowUps — 1:1 acceptMatchWithResolveDifference and
 * acceptExactMultiDocumentMatch) is the only caller that posts those rows inside the match
 * transaction. Import creates the bank line; match posts the JE.
 *
 *   reserve row (not rsv_deposit) → postFaroReserveEntryOnClient (both accept paths)
 *   payment match                 → faroReserveDepositsOn + DR 1235 / CR due-from-affiliate per deposit
 *   repurchase (no Faro entry)    → postFactoringChargebackEvent via runFactoringAdvanceAcceptFollowUps
 */
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";
import { createJournalEntryOnClient } from "../journal-entries.service.js";
import { writeFactoringSpineLinks } from "../../factoring/factoring-spine-links.js";
import {
  FaroReserveError,
  faroReserveDepositsOn,
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

/**
 * Payment match Rsv Deposit legs — Faro held these back from the payment wire
 * (Payments − Deposits = net wired). DR 1235 / CR due-from-affiliate (USMCA side only).
 * Stamps each Faro entry + its register bank line to the JE.
 */
export async function postFaroRsvDepositsOnPaymentMatch(
  client: DbClient,
  input: {
    operating_company_id: string;
    payment_date: string;
    actor_user_id: string;
    matched_payment_id: string;
  }
): Promise<{ posted_entry_ids: string[]; journal_entry_ids: string[] }> {
  const deposits = await faroReserveDepositsOn(client, input.operating_company_id, input.payment_date);
  const pending = deposits.filter((d) => !d.journal_entry_id);
  if (!pending.length) return { posted_entry_ids: [], journal_entry_ids: [] };

  const actor_role = await loadActorRole(client, input.actor_user_id);
  const cash = await resolveRoleAccount(client as never, input.operating_company_id, "factor_cash_reserve_held");
  const dueFrom = await resolveRoleAccount(
    client as never,
    input.operating_company_id,
    "intercompany_receivable_ih35_transportation"
  );

  const posted_entry_ids: string[] = [];
  const journal_entry_ids: string[] = [];

  for (const d of pending) {
    const amount = Math.abs(Number(d.amount_cents));
    if (amount <= 0) continue;
    const memo = `Faro Rsv Deposit on payment match — ${d.note || d.id}`;
    const stamp = {
      source_transaction_type: "faro_reserve_entry" as const,
      source_transaction_id: d.id,
    };
    const je = await createJournalEntryOnClient(
      client as never,
      {
        operating_company_id: input.operating_company_id,
        entry_date: input.payment_date,
        memo,
        source: "auto",
        postings: [
          {
            account_id: cash,
            debit_or_credit: "debit",
            amount_cents: amount,
            description: memo,
            ...stamp,
          },
          {
            account_id: dueFrom,
            debit_or_credit: "credit",
            amount_cents: amount,
            description: memo,
            ...stamp,
          },
        ],
      },
      { userId: input.actor_user_id, role: actor_role }
    );
    await writeFactoringSpineLinks(client, input.operating_company_id, je.id, "faro_rsv_deposit");
    await client.query(
      `UPDATE accounting.faro_reserve_entries
          SET journal_entry_id = $1::uuid, posted_at = now(), posted_by_user_id = $3::uuid
        WHERE id = $2::uuid AND journal_entry_id IS NULL`,
      [je.id, d.id, input.actor_user_id]
    );
    await client.query(
      `UPDATE banking.bank_transactions bt
          SET matched_journal_entry_id = COALESCE(matched_journal_entry_id, $1::uuid),
              matched_payment_id = COALESCE(matched_payment_id, $4::uuid),
              review_state = CASE WHEN review_state = 'matched' THEN review_state ELSE 'matched' END,
              resolution_kind = COALESCE(bt.resolution_kind, 'added'), -- ROUND 360: this JE was created for the line
              reviewed_at = COALESCE(reviewed_at, now()),
              updated_at = now()
         FROM accounting.faro_reserve_entries e
        WHERE e.id = $2::uuid
          AND e.bank_transaction_id = bt.id
          AND bt.operating_company_id = $3::uuid`,
      [je.id, d.id, input.operating_company_id, input.matched_payment_id]
    );
    posted_entry_ids.push(d.id);
    journal_entry_ids.push(je.id);
  }
  return { posted_entry_ids, journal_entry_ids };
}
