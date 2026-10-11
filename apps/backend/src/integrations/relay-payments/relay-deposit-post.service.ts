/**
 * ROUND 443.29 b (owner 2026-10-10 7:15 PM CT; Lead order) — a SETTLED Relay wallet deposit POSTS:
 *   Dr Relay Fuel Wallet (1295)   the deposit amount
 *   Dr Fuel Card Fees (5005)      Relay's 3.25% deposit fee, as Relay reports it (owner 7:19 PM CT: "that is the correct account")
 *   Cr the funding account        the amount charged to the card (= amount + fee, to the cent)
 * A CANCELED deposit posts nothing. A card whose owner is not named, or whose writer is not this engine, is HELD and listed —
 * never guessed. Lifts the classifier header's HOLD-FOR-JORGE "nothing here posts" per the owner order above.
 *
 * FUNDING MAP (owner, verbatim in ~/IH35-LEAD-CHANNEL/2026-10-10-LEAD-TO-SEATS.md, 7:26 / 7:28 / 7:30 PM CT):
 *   0680               USMCA Bank of America debit card  -> the USMCA Bank of America operating account (1000)
 *   9708, 1354, 4823   Transportation Wells Fargo cards  -> "Inter-company - IH35 Transportation" (8000); nothing is written
 *                                                           to a Transportation book
 *   0210, 6248         Jorge personal                    -> HELD: a related-party loan advance "paid directly to a vendor";
 *   9855               Tio Perfumes 2                       the loan engine (Cursor 443.22-2e) is the one writer, and its
 *                                                           paid-direct writer is not callable as a service yet
 *   5007               Amex Scentsx                      -> "Amex Credit Card Payable" (2500-00-001) (Lead ruling 2026-10-11)
 *   anything else      card owner not named              -> HELD, listed for the owner
 *
 * The deposit row keeps Relay's own row as raw_payload (amount / fee / total). The poster refuses unless amount + fee = total
 * = the stored total_amount_cents. Idempotent: one journal entry per deposit (source_transaction_type 'relay_deposit').
 */
import type { DbClient } from "./db-client.type.js";

export type DepositFunding =
  | { kind: "account"; account_number: string | null; system_purpose: string | null; label: string }
  | { kind: "held"; reason: "loan_engine_paid_direct" | "card_owner_not_named"; label: string };

/** Owner's funding-card map. One place; the guard reads it. */
export const RELAY_DEPOSIT_FUNDING: Readonly<Record<string, DepositFunding>> = Object.freeze({
  "0680": { kind: "account", account_number: "1000", system_purpose: null, label: "USMCA Bank of America debit" },
  "9708": { kind: "account", account_number: null, system_purpose: "intercompany_ih35", label: "Laura — Transportation Wells Fargo debit" },
  "1354": { kind: "account", account_number: null, system_purpose: "intercompany_ih35", label: "Laura — Transportation Wells Fargo debit" },
  "4823": { kind: "account", account_number: null, system_purpose: "intercompany_ih35", label: "Laura — Transportation Wells Fargo debit" },
  "0210": { kind: "held", reason: "loan_engine_paid_direct", label: "Jorge personal card" },
  "6248": { kind: "held", reason: "loan_engine_paid_direct", label: "Jorge personal Bank of America debit" },
  "9855": { kind: "held", reason: "loan_engine_paid_direct", label: "Tio Perfumes 2" },
  // Lead ruling 2026-10-11 (after 443.29 b): 5007 credits "Amex Credit Card Payable" (2500-00-001), not the loan engine.
  "5007": { kind: "account", account_number: "2500-00-001", system_purpose: null, label: "Amex Scentsx (Amex Credit Card Payable)" },
});

export function fundingForCard(last4: string | null): DepositFunding {
  return (last4 && RELAY_DEPOSIT_FUNDING[last4]) || { kind: "held", reason: "card_owner_not_named", label: last4 ? `card ${last4}` : "no card in note" };
}

const cents = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).replace(/[$,]/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export type DepositPostOutcome =
  | { outcome: "posted"; deposit_id: string; journal_entry_id: string; amount_cents: number; fee_cents: number; charged_cents: number; funding: string }
  | { outcome: "already_posted"; deposit_id: string; journal_entry_id: string }
  | { outcome: "held"; deposit_id: string; reason: string; card: string | null; charged_cents: number; label: string; bank_transaction_id?: string }
  | { outcome: "not_settled"; deposit_id: string; status: string }
  | { outcome: "refused"; deposit_id: string; reason: string };

type JeCreator = (
  client: DbClient,
  input: Record<string, unknown>,
  actor: { userId: string; role: string }
) => Promise<{ id: string }>;

export async function postRelayDeposit(
  client: DbClient,
  args: { operatingCompanyId: string; relayDepositId: string; actorUserId: string; actorRole: string },
  deps: { createJournalEntryOnClient: JeCreator }
): Promise<DepositPostOutcome> {
  const d = (
    await client.query<{ id: string; deposit_id: string; status: string; total_amount_cents: string; funding_card_last4: string | null; raw_payload: Record<string, unknown> | null; entry_date: string; voided_at: string | null }>(
      `SELECT id::text, deposit_id, status, total_amount_cents::text, funding_card_last4, raw_payload,
              (relay_created_at AT TIME ZONE 'America/Chicago')::date::text AS entry_date, voided_at::text
         FROM integrations.relay_deposits
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [args.relayDepositId, args.operatingCompanyId]
    )
  ).rows[0];
  if (!d) return { outcome: "refused", deposit_id: args.relayDepositId, reason: "deposit_not_found" };
  if (d.voided_at) return { outcome: "refused", deposit_id: d.deposit_id, reason: "deposit_voided" };
  if (String(d.status).toLowerCase() !== "settled") return { outcome: "not_settled", deposit_id: d.deposit_id, status: d.status };

  const existing = (
    await client.query<{ id: string }>(
      `SELECT DISTINCT journal_entry_uuid::text AS id FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND source_transaction_type = 'relay_deposit' AND source_transaction_id = $2
          AND reversed_by_line_id IS NULL AND reversal_of_line_id IS NULL LIMIT 1`,
      [args.operatingCompanyId, d.id]
    )
  ).rows[0];
  if (existing) return { outcome: "already_posted", deposit_id: d.deposit_id, journal_entry_id: existing.id };

  const raw = d.raw_payload ?? {};
  const amount = cents(raw.amount);
  const fee = cents(raw.fee);
  const total = cents(raw.total);
  const stored = Math.round(Number(d.total_amount_cents));
  if (amount == null || fee == null || total == null) return { outcome: "refused", deposit_id: d.deposit_id, reason: "relay_amount_fee_or_total_missing" };
  if (amount <= 0 || fee < 0 || amount + fee !== total || total !== stored)
    return { outcome: "refused", deposit_id: d.deposit_id, reason: `amount ${amount} + fee ${fee} != charged ${total} (stored ${stored})` };

  const funding = fundingForCard(d.funding_card_last4);
  if (funding.kind === "held")
    return { outcome: "held", deposit_id: d.deposit_id, reason: funding.reason, card: d.funding_card_last4, charged_cents: total, label: funding.label };

  const acct = async (where: string, value: string) =>
    (
      await client.query<{ id: string; account_number: string }>(
        `SELECT id::text, account_number FROM catalogs.accounts
          WHERE operating_company_id = $1::uuid AND ${where} = $2 AND deactivated_at IS NULL LIMIT 2`,
        [args.operatingCompanyId, value]
      )
    ).rows;
  const wallet = await acct("system_purpose", "relay_fuel_wallet");
  const feeAcct = await acct("account_number", "5005");
  const fund = funding.account_number ? await acct("account_number", funding.account_number) : await acct("system_purpose", funding.system_purpose!);
  if (wallet.length !== 1) return { outcome: "refused", deposit_id: d.deposit_id, reason: "relay_fuel_wallet_account_not_exactly_one" };
  if (feeAcct.length !== 1) return { outcome: "refused", deposit_id: d.deposit_id, reason: "fuel_card_fees_5005_not_exactly_one" };
  if (fund.length !== 1) return { outcome: "refused", deposit_id: d.deposit_id, reason: `funding_account_not_exactly_one (${funding.label})` };

  // Lead AUTH-405 (no double count): the card charge for this deposit may already be on the funding account's own bank feed.
  // A charge line (same amount, deposit date +/- 3 days) that ALREADY has its own journal entry means the money is booked —
  // the owner's categorization is never rewritten, so the deposit is HELD and listed instead of posting a second time.
  const bookedLine = (
    await client.query<{ id: string }>(
      `SELECT t.id::text
         FROM banking.bank_transactions t
         JOIN banking.bank_accounts ba ON ba.id = t.bank_account_id
        WHERE ba.ledger_account_id = $1::uuid
          AND t.operating_company_id = $2::uuid
          AND t.amount_cents = -($3::bigint)
          AND t.transaction_date BETWEEN $4::date - 3 AND $4::date + 3
          AND (t.categorized_at IS NOT NULL OR t.matched_journal_entry_id IS NOT NULL
               OR EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                           WHERE p.operating_company_id = t.operating_company_id
                             AND p.source_transaction_id = t.id::text AND p.reversed_by_line_id IS NULL))
        ORDER BY abs(t.transaction_date - $4::date), t.id
        LIMIT 1`,
      [fund[0]!.id, args.operatingCompanyId, total, d.entry_date]
    )
  ).rows[0];
  if (bookedLine)
    return {
      outcome: "held",
      deposit_id: d.deposit_id,
      reason: "bank_line_already_categorized",
      card: d.funding_card_last4,
      charged_cents: total,
      label: funding.label,
      bank_transaction_id: bookedLine.id,
    };

  // Lead ruling 443.40: the wallet (1295) and Relay's fee (5005) legs name the vendor Relay; the funding leg keeps its own rule.
  const relay = (
    await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.vendors
        WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND vendor_name ~* '^relay( |$)' LIMIT 2`,
      [args.operatingCompanyId]
    )
  ).rows;
  if (relay.length !== 1) return { outcome: "refused", deposit_id: d.deposit_id, reason: "relay_vendor_not_exactly_one" };
  const relayEntity = { entity_uuid: relay[0]!.id, entity_type: "vendor" };
  const src = { source_transaction_type: "relay_deposit", source_transaction_id: d.id };
  const card = d.funding_card_last4 ?? "?";
  const postings = [
    { account_id: wallet[0]!.id, debit_or_credit: "debit", amount_cents: amount, description: `Relay deposit ${d.deposit_id} — wallet funded`, ...src, ...relayEntity },
    ...(fee > 0 ? [{ account_id: feeAcct[0]!.id, debit_or_credit: "debit", amount_cents: fee, description: `Relay deposit ${d.deposit_id} — 3.25% deposit fee`, ...src, ...relayEntity }] : []),
    { account_id: fund[0]!.id, debit_or_credit: "credit", amount_cents: total, description: `Relay deposit ${d.deposit_id} — charged to card ${card} (${funding.label})`, ...src },
  ];
  const je = await deps.createJournalEntryOnClient(
    client,
    {
      operating_company_id: args.operatingCompanyId,
      entry_date: d.entry_date,
      memo: `Relay wallet deposit ${d.deposit_id}: $${(amount / 100).toFixed(2)} + fee $${(fee / 100).toFixed(2)} charged to card ${card} (${funding.label})`,
      source: "auto",
      ...src,
      postings,
    },
    { userId: args.actorUserId, role: args.actorRole }
  );
  return { outcome: "posted", deposit_id: d.deposit_id, journal_entry_id: je.id, amount_cents: amount, fee_cents: fee, charged_cents: total, funding: funding.label };
}

/** Every settled deposit of one company, posted or held — the report the owner reads. */
export async function postSettledRelayDepositsForCompany(
  client: DbClient,
  args: { operatingCompanyId: string; actorUserId: string; actorRole: string },
  deps: { createJournalEntryOnClient: JeCreator }
): Promise<DepositPostOutcome[]> {
  const ids = (
    await client.query<{ id: string }>(
      `SELECT id::text FROM integrations.relay_deposits
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND lower(status) = 'settled'
        ORDER BY relay_created_at, deposit_id`,
      [args.operatingCompanyId]
    )
  ).rows;
  const out: DepositPostOutcome[] = [];
  for (const { id } of ids) out.push(await postRelayDeposit(client, { ...args, relayDepositId: id }, deps));
  return out;
}
