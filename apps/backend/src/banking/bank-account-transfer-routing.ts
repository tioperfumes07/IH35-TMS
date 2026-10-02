/**
 * ROUND 326 queue item 13 (G-07) — THE CARD-PAYMENT SIDE. 2510 Dreamline Diesel Card Payable accrues every fuel fill
 * (Cr 2510) and had no payment side: paying the card statement from the operating bank was categorized like an
 * expense (Dr 2510 / Cr bank on the operating side only) or left uncategorized, and the card's own "payment received"
 * line could post a second time. Owner ruling 2026-10-02: fuel cards ARE bank accounts in Banking; a line posts only
 * when matched or categorized there, one engine.
 *
 * A bank line categorized to an account that is ANOTHER active bank account's ledger account (2510 is the Dreamline
 * card's) is a transfer between the two bank accounts, not an expense. This resolves that target so the categorize
 * route hands the line to the existing transfer engine (markBankFeedLineAsTransfer -> createTransfer ->
 * postSourceTransaction('transfer'): Dr card 2510 / Cr operating bank), pairing the card's own counterpart line when
 * exactly one candidate exists so both feeds clear against ONE transfer and ONE journal entry. No new GL math.
 */
type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type BankAccountTransferTarget = {
  destinationBankAccountId: string;
  transferKind: "in" | "out";
  pairedTransactionId: string | null;
};

/** Days either side of the line's date a card's counterpart line may sit (statement posting lag). */
export const CARD_PAYMENT_PAIR_WINDOW_DAYS = 5;

export async function resolveBankAccountTransferTarget(
  client: Q,
  operatingCompanyId: string,
  bankTransactionId: string,
  glAccountId: string
): Promise<BankAccountTransferTarget | null> {
  const line = (await client.query<{ bank_account_id: string; amount_cents: string; is_credit: boolean | null; transaction_date: string }>(
    `SELECT bank_account_id::text, amount_cents::text, is_credit, transaction_date::text
       FROM banking.bank_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [bankTransactionId, operatingCompanyId]
  )).rows[0];
  if (!line) return null;
  const dest = (await client.query<{ id: string }>(
    `SELECT id::text FROM banking.bank_accounts
      WHERE operating_company_id = $1::uuid AND ledger_account_id = $2::uuid AND id <> $3::uuid
        AND is_active AND deactivated_at IS NULL
      ORDER BY created_at LIMIT 1`,
    [operatingCompanyId, glAccountId, line.bank_account_id]
  )).rows[0];
  if (!dest) return null;
  const moneyIn = line.is_credit === true;
  const absCents = Math.abs(Number(line.amount_cents));
  const pair = (await client.query<{ id: string }>(
    `SELECT id::text FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid AND bank_account_id = $2::uuid
        AND abs(amount_cents) = $3 AND is_credit IS DISTINCT FROM $4
        AND matched_transfer_id IS NULL
        AND transaction_date BETWEEN $5::date - $6::int AND $5::date + $6::int
      LIMIT 2`,
    [operatingCompanyId, dest.id, absCents, moneyIn, line.transaction_date.slice(0, 10), CARD_PAYMENT_PAIR_WINDOW_DAYS]
  )).rows;
  return { destinationBankAccountId: dest.id, transferKind: moneyIn ? "in" : "out", pairedTransactionId: pair.length === 1 ? pair[0].id : null };
}
