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
 *   0210, 6248         Jorge personal cards              -> PARTY (443.58 / 443.64): the party paid Relay — Dr 1295 + Dr 5005 /
 *                                                           Cr "Due to / from Jorge" (2410-00-001), with the paid-direct
 *                                                           document from the loan engine (createPaidDirectVendorAdvance)
 *   9855               Tio Perfumes 2                    -> PARTY: Cr "Due to / from Tio Perfumes 2" (2410-00-003), same way
 *   5007               Amex Scentsx                      -> "Amex Credit Card Payable" (2500-00-001) (Lead ruling 2026-10-11)
 *   anything else      card owner not named              -> HELD, listed for the owner
 *
 * The deposit row keeps Relay's own row as raw_payload (amount / fee / total). The poster refuses unless amount + fee = total
 * = the stored total_amount_cents. Idempotent: one journal entry per deposit (source_transaction_type 'relay_deposit').
 */
import type { DbClient } from "./db-client.type.js";
import { createPaidDirectVendorAdvance } from "../../accounting/related-party-loan-posting/create-entry.service.js";

export type DepositFunding =
  | { kind: "account"; account_number: string | null; system_purpose: string | null; label: string }
  | { kind: "held"; reason: "loan_engine_paid_direct" | "card_owner_not_named"; label: string }
  /** 443.58 / 443.64: a related party's card paid Relay — paid-direct document through the loan engine + credit to the party's
   *  "Due to / from <party>" account (CC-1 443.59: one running account per party, debit or credit balance). */
  | { kind: "party"; party_account_number: string; party_vendor_name: string; relationship: "owner" | "related_company"; label: string };

/** Owner's funding-card map. One place; the guard reads it. */
export const RELAY_DEPOSIT_FUNDING: Readonly<Record<string, DepositFunding>> = Object.freeze({
  "0680": { kind: "account", account_number: "1000", system_purpose: null, label: "USMCA Bank of America debit" },
  "9708": { kind: "account", account_number: null, system_purpose: "intercompany_ih35", label: "Laura — Transportation Wells Fargo debit" },
  "1354": { kind: "account", account_number: null, system_purpose: "intercompany_ih35", label: "Laura — Transportation Wells Fargo debit" },
  "4823": { kind: "account", account_number: null, system_purpose: "intercompany_ih35", label: "Laura — Transportation Wells Fargo debit" },
  // Lead 443.58 / 443.59 / 443.64: a party card credits that party's "Due to / from" account (CC-1 #26377 contract).
  "0210": { kind: "party", party_account_number: "2410-00-001", party_vendor_name: "Jorge Pablo Guadalupe Muñoz Gonzalez", relationship: "owner", label: "Jorge personal card" },
  // Lead 443.64 (3a): 6248 -> Jorge and 9855 -> Tio Perfumes 2, through the same party contract.
  "6248": { kind: "party", party_account_number: "2410-00-001", party_vendor_name: "Jorge Pablo Guadalupe Muñoz Gonzalez", relationship: "owner", label: "Jorge personal Bank of America debit" },
  "9855": { kind: "party", party_account_number: "2410-00-003", party_vendor_name: "Tio Perfumes 2 LLC", relationship: "related_company", label: "Tio Perfumes 2" },
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
  | { outcome: "posted"; deposit_id: string; journal_entry_id: string; amount_cents: number; fee_cents: number; charged_cents: number; funding: string; loan_entry_id?: string; loan_display_id?: string }
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
  const fund =
    funding.kind === "party" ? await acct("account_number", funding.party_account_number)
    : funding.account_number ? await acct("account_number", funding.account_number) : await acct("system_purpose", funding.system_purpose!);
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

  // 443.58: a LOAN card — the loan DOCUMENT first, through the loan engine's paid-direct writer (lender = the card owner,
  // amount = what was charged, date = the deposit date, target = this deposit), then the credit leg names the lender.
  let loan: { id: string; display_id: string } | null = null;
  let fundEntity: { entity_uuid?: string; entity_type?: string } = {};
  if (funding.kind === "party") {
    const lender = (
      await client.query<{ id: string }>(
        `SELECT id::text FROM mdata.vendors WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND vendor_name = $2 LIMIT 2`,
        [args.operatingCompanyId, funding.party_vendor_name]
      )
    ).rows;
    if (lender.length !== 1) return { outcome: "refused", deposit_id: d.deposit_id, reason: `party_vendor_not_exactly_one (${funding.party_vendor_name})` };
    fundEntity = { entity_uuid: lender[0]!.id, entity_type: "vendor" };
    const prior = (
      await client.query<{ id: string; display_id: string; je_id: string | null }>(
        `SELECT id::text, display_id, je_id::text FROM accounting.related_party_loan_entries
          WHERE operating_company_id = $1::uuid AND target_type = 'paid_direct_vendor' AND target_id = $2::uuid
            AND deleted_at IS NULL AND reversed_at IS NULL LIMIT 1`,
        [args.operatingCompanyId, d.id]
      )
    ).rows[0];
    if (prior?.je_id) return { outcome: "already_posted", deposit_id: d.deposit_id, journal_entry_id: prior.je_id };
    if (prior) loan = prior;
    else {
      const made = await createPaidDirectVendorAdvance(
        client as never,
        {
          operating_company_id: args.operatingCompanyId,
          account_id: fund[0]!.id,
          funding_account_id: wallet[0]!.id,
          principal_cents: total,
          entry_date: d.entry_date,
          counterparty_name: funding.party_vendor_name,
          relationship: funding.relationship,
          counterparty_kind: "vendor",
          counterparty_id: lender[0]!.id,
          target_id: d.id,
          funding_source_note: `Relay wallet deposit ${d.deposit_id} paid directly to Relay with card ${card} (${funding.label}): $${(amount / 100).toFixed(2)} + fee $${(fee / 100).toFixed(2)}`,
        },
        args.actorUserId
      );
      if ("error" in made) return { outcome: "refused", deposit_id: d.deposit_id, reason: `loan_engine_${made.error}` };
      loan = { id: made.id, display_id: made.display_id };
    }
  }

  const postings = [
    { account_id: wallet[0]!.id, debit_or_credit: "debit", amount_cents: amount, description: `Relay deposit ${d.entry_date} — wallet funded`, ...src, ...relayEntity },
    ...(fee > 0 ? [{ account_id: feeAcct[0]!.id, debit_or_credit: "debit", amount_cents: fee, description: `Relay deposit ${d.entry_date} — 3.25% deposit fee`, ...src, ...relayEntity }] : []),
    {
      account_id: fund[0]!.id,
      debit_or_credit: "credit",
      amount_cents: total,
      description: loan
        ? `Relay deposit ${d.entry_date} — Due to / from party, ${loan.display_id} (${funding.label} ${card})`
        : `Relay deposit ${d.entry_date} — charged to card ${card} (${funding.label})`,
      ...src,
      ...fundEntity,
    },
  ];
  const je = await deps.createJournalEntryOnClient(
    client,
    {
      operating_company_id: args.operatingCompanyId,
      entry_date: d.entry_date,
      memo: `Relay wallet deposit ${d.entry_date}: $${(amount / 100).toFixed(2)} + fee $${(fee / 100).toFixed(2)} charged to card ${card} (${funding.label})${loan ? ` — Due to / from party, ${loan.display_id}` : ""}`,
      source: "auto",
      ...src,
      postings,
    },
    { userId: args.actorUserId, role: args.actorRole }
  );
  // Linked both ways: deposit -> JE by source_transaction_id; loan -> deposit by target_id; loan -> JE by je_id.
  if (loan) {
    await client.query(
      `UPDATE accounting.related_party_loan_entries SET je_id = $2::uuid, updated_at = now(), updated_by_user_id = $3::uuid
        WHERE id = $1::uuid AND je_id IS NULL`,
      [loan.id, je.id, args.actorUserId]
    );
  }
  return {
    outcome: "posted", deposit_id: d.deposit_id, journal_entry_id: je.id, amount_cents: amount, fee_cents: fee, charged_cents: total, funding: funding.label,
    ...(loan ? { loan_entry_id: loan.id, loan_display_id: loan.display_id } : {}),
  };
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
