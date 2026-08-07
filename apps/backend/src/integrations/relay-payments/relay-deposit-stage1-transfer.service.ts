/**
 * CONN-3 STAGE 1 — materialise a Relay wallet funding as a TRANSFER, so the existing poster books it.
 *
 * THE DESIGN CHOICE, AND WHY IT IS NOT A NEW POSTER
 * Stage 1 of CONN-3 is "fund the wallet": money leaves a company bank/card account and lands in the
 * prepaid Relay wallet. Both sides are balance-sheet accounts, nothing hits P&L. That is precisely and
 * exactly a transfer — and `banking.transfers` + `postSourceTransaction('transfer')` already implement
 * it: the engine debits the destination's ledger account and credits the source's, resolving both
 * through `banking.bank_accounts.ledger_account_id`.
 *
 * So this service writes NO GL math. It creates the transfer row the engine already understands and
 * hands off. A bespoke relay_deposit poster would have meant a second implementation of double entry
 * for a movement the system can already express — the thing the standards forbid, and for good reason:
 * the transfer path already carries the period lock, the idempotency key, the reversal machinery and
 * the TRANSFER_GL_POSTING_ENABLED kill switch, and a new poster would have to re-earn all four.
 *
 * WHAT IT REFUSES TO DO
 *  * NO BACKFILL. Only a deposit passed in by a caller is materialised. The 104 historical company
 *    deposits ($432,958.24) are imported history; posting them now would book cash movements the TMS
 *    never witnessed, against a period QuickBooks already owns. Going-forward only.
 *  * Company-classified deposits only. 'unclassified' means the funding card is not yet identified as
 *    the company's, and an unidentified card may be an owner loan or a capital contribution — a
 *    treatment only the owner can name. 'canceled' pre-auths are not money at all.
 *  * A card with no funding account is refused, not guessed. Card 5007 is deliberately unmapped
 *    because its bank account still bridges to the wrong GL; inventing a credit side there would put
 *    wallet fundings into the factoring reserve, which is the defect this programme just fixed.
 *  * Idempotent per deposit: the transfer's reference_number carries the Relay deposit id, so a second
 *    run finds the existing row instead of double-funding the wallet.
 */
import { appendCrudAudit } from "../../audit/crud-audit.js";
import type { DbClient } from "./db-client.type.js";

/** Marks the transfer as a Relay wallet funding and makes the deposit id the idempotency key. */
export const RELAY_DEPOSIT_TRANSFER_REF_PREFIX = "relay_deposit:";

export type Stage1TransferResult =
  | {
      created: false;
      reason:
        | "not_company_classified"
        | "not_settled"
        | "card_unmapped"
        | "no_wallet_account"
        | "zero_amount"
        | "already_materialised";
      detail?: string;
      transfer_id?: string;
    }
  | { created: true; transfer_id: string; amount_cents: number };

/**
 * Materialise ONE Relay deposit as a banking.transfers row (funding account → Relay wallet).
 * Does not post: the caller decides whether to hand the transfer to postSourceTransaction('transfer'),
 * which applies TRANSFER_GL_POSTING_ENABLED per entity.
 */
export async function materialiseRelayDepositAsTransfer(
  client: DbClient,
  operatingCompanyId: string,
  depositId: string,
  actorUserId: string
): Promise<Stage1TransferResult> {
  const depRes = await client.query<{
    id: string;
    deposit_id: string;
    status: string;
    classification: string;
    total_amount_cents: string;
    funding_card_last4: string | null;
    relay_created_at: string;
  }>(
    `
      SELECT id::text, deposit_id, status, classification,
             total_amount_cents::text, funding_card_last4, relay_created_at::text
      FROM integrations.relay_deposits
      WHERE operating_company_id = $1::uuid
        AND deposit_id = $2
        AND is_active
        AND voided_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, depositId]
  );
  const dep = depRes.rows[0];
  if (!dep) return { created: false, reason: "not_settled", detail: "deposit not found or voided" };
  if (dep.status !== "settled") {
    // A canceled pre-auth never moved money; booking it would invent cash.
    return { created: false, reason: "not_settled", detail: `status=${dep.status}` };
  }
  if (dep.classification !== "company") {
    // 'unclassified' may be an owner loan or capital contribution — an owner ruling, never a default.
    return { created: false, reason: "not_company_classified", detail: `classification=${dep.classification}` };
  }
  const amountCents = Math.abs(Number(dep.total_amount_cents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) return { created: false, reason: "zero_amount" };

  const reference = `${RELAY_DEPOSIT_TRANSFER_REF_PREFIX}${dep.deposit_id}`;

  // Idempotency: the Relay deposit id is the reference. A second run must not fund the wallet twice.
  const existing = await client.query<{ id: string }>(
    `SELECT id::text FROM banking.transfers
      WHERE operating_company_id = $1::uuid AND reference_number = $2 LIMIT 1`,
    [operatingCompanyId, reference]
  );
  if (existing.rows[0]) {
    return { created: false, reason: "already_materialised", transfer_id: existing.rows[0].id };
  }

  // Credit side: the account the CARD draws on. Unmapped => refuse. Guessing here is how Amex-funded
  // wallet loads ended up in Faro Factoring Reserves.
  const cardRes = await client.query<{ funding_bank_account_id: string | null }>(
    `SELECT funding_bank_account_id::text AS funding_bank_account_id
       FROM integrations.relay_company_cards
      WHERE operating_company_id = $1::uuid AND card_last4 = $2 AND is_active AND voided_at IS NULL
      LIMIT 1`,
    [operatingCompanyId, dep.funding_card_last4 ?? ""]
  );
  const fundingBankAccountId = cardRes.rows[0]?.funding_bank_account_id ?? null;
  if (!fundingBankAccountId) {
    return { created: false, reason: "card_unmapped", detail: `card ${dep.funding_card_last4 ?? "(none)"} has no funding account` };
  }

  // Debit side: this entity's own Relay wallet bank account (CONN-3 Part B/C seeded one per entity).
  const walletRes = await client.query<{ id: string }>(
    `SELECT ba.id::text AS id
       FROM banking.bank_accounts ba
       JOIN catalogs.accounts ca ON ca.id = ba.ledger_account_id
                                 AND ca.operating_company_id = $1::uuid
      WHERE ba.operating_company_id = $1::uuid
        AND ba.is_active = true
        AND ca.system_purpose = 'relay_fuel_wallet'
      LIMIT 1`,
    [operatingCompanyId]
  );
  const walletBankAccountId = walletRes.rows[0]?.id ?? null;
  if (!walletBankAccountId) return { created: false, reason: "no_wallet_account" };

  const ins = await client.query<{ id: string }>(
    `
      INSERT INTO banking.transfers
        (operating_company_id, transfer_type, from_account_id, from_account_kind,
         to_account_id, to_account_kind, amount_cents, transfer_date, memo, reference_number,
         created_by_user_id)
      VALUES ($1::uuid, 'bank_to_bank', $2::uuid, 'bank', $3::uuid, 'bank', $4::bigint,
              $5::timestamptz::date, $6, $7, $8::uuid)
      RETURNING id::text AS id
    `,
    [
      operatingCompanyId,
      fundingBankAccountId,
      walletBankAccountId,
      amountCents,
      dep.relay_created_at,
      `Relay wallet funding — deposit ${dep.deposit_id} (card ${dep.funding_card_last4 ?? "?"})`,
      reference,
      actorUserId,
    ]
  );
  const transferId = ins.rows[0]?.id;
  if (!transferId) return { created: false, reason: "zero_amount", detail: "insert returned no id" };

  await appendCrudAudit(
    client,
    actorUserId,
    "integrations.relay_deposit.materialised_as_transfer",
    {
      operating_company_id: operatingCompanyId,
      relay_deposit_id: dep.id,
      deposit_id: dep.deposit_id,
      transfer_id: transferId,
      amount_cents: amountCents,
      from_bank_account_id: fundingBankAccountId,
      to_bank_account_id: walletBankAccountId,
    },
    "info",
    "CONN3-STAGE1"
  );

  return { created: true, transfer_id: transferId, amount_cents: amountCents };
}
