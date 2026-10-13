/**
 * Relay DEPOSIT classifier — storage + classification ONLY (Part B). NO GL/booking (that is the
 * deferred financial follow-up, HOLD-FOR-JORGE). See docs/trackers/RELAY-DEPOSIT-FUNDING-RECON-2026-07-12.md.
 *
 * A Relay "deposit" (CSV `type=deposit`) is money the company put INTO the Relay wallet to fund fuel
 * purchases — it is NOT fuel pumped and must never be summed with fuel (type=code) or with the bank's
 * payments to Relay. Each deposit's funding card is identified by the last-4 in its Note
 * ("9104. Card deposit."). We classify each deposit against an OWNER-EDITABLE company-card set:
 *   - card in the set  → 'company'      (reconcile to a bank/card outflow — design only)
 *   - card not in set  → 'unclassified' (owner-review queue; NEVER auto-labeled "personal" — an
 *                                        unconnected company card would also be absent from the feed)
 *   - canceled status  → 'canceled'     (pre-auth, not money, excluded from spend)
 *
 * Nothing here posts. posted_to_gl stays false. Booking company deposits as company cash and external
 * deposits as Loan-from-Owner (liability) / Capital-Contribution (equity) is deferred until the owner
 * names each unclassified card and approves the accounting treatment.
 *
 * @packageDocumentation
 */
import type { DbClient } from "./db-client.type.js";
import { upsertRelayWalletDepositFeedRow } from "./relay-wallet-bank-feed.service.js";

export type RelayDepositIngestSource = "daily_pull" | "webhook" | "csv_import";

export type RelayDepositInput = {
  deposit_id: string;
  relay_created_at: string;
  status: string; // 'settled' | 'canceled' | ...
  total_amount: string | number | null; // dollars (string from CSV/API) or already-number
  note: string | null;
  raw: unknown;
};

export type RelayDepositClassification = "company" | "party" | "intercompany" | "unclassified" | "canceled";

/** LEAD 443.133 B: card -> its class from the owner's card map (integrations.relay_company_cards.funding_kind). */
export type CompanyCardClasses = Map<string, "company" | "party" | "intercompany">;

export type RelayDepositResult = {
  relay_deposit_id: string;
  deposit_id: string;
  funding_card_last4: string | null;
  classification: RelayDepositClassification;
};

/** Parse the funding card's last-4 from a deposit Note. Relay writes e.g. "9104. Card deposit." — the
 *  leading 4-digit group is the card. Returns null if no 4-digit group is present. */
export function parseFundingCardLast4(note: string | null | undefined): string | null {
  if (!note) return null;
  const m = String(note).match(/\b(\d{4})\b/);
  return m ? m[1] : null;
}

function toCents(value: string | number | null | undefined, field: string): number {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    throw new Error(`relay_deposit: missing required money field ${field}`);
  }
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, "").trim());
  if (!Number.isFinite(n)) {
    throw new Error(`relay_deposit: unparsable money field ${field}=${JSON.stringify(value)}`);
  }
  return Math.round(n * 100);
}

/** Load the owner-editable card map for one operating company (active cards only). LEAD 443.133 B: the map's
 *  funding_kind decides the class — party / intercompany cards are named as such, a company account card (or a legacy
 *  row with no funding kind) is 'company'. */
export async function loadCompanyCardSet(client: DbClient, operatingCompanyId: string): Promise<CompanyCardClasses> {
  const res = await client.query<{ card_last4: string; funding_kind: string | null }>(
    `SELECT card_last4, funding_kind FROM integrations.relay_company_cards
     WHERE operating_company_id = $1::uuid AND is_active AND voided_at IS NULL`,
    [operatingCompanyId]
  );
  return new Map(
    res.rows.map((r) => [r.card_last4, r.funding_kind === "party" ? "party" : r.funding_kind === "intercompany" ? "intercompany" : "company"] as const)
  );
}

/** Classify one deposit given its status, funding card, and the company-card set. Canceled pre-auths
 *  are 'canceled' (not money) regardless of card. */
export function classifyDeposit(
  status: string,
  fundingCardLast4: string | null,
  companyCards: CompanyCardClasses | Set<string>
): RelayDepositClassification {
  const st = (status ?? "").trim().toLowerCase();
  if (st === "canceled" || st === "cancelled" || st === "voided") return "canceled";
  if (!fundingCardLast4) return "unclassified";
  if (companyCards instanceof Map) return companyCards.get(fundingCardLast4) ?? "unclassified";
  return companyCards.has(fundingCardLast4) ? "company" : "unclassified";
}

/**
 * Upsert one Relay deposit for one operating company, with a freshly-computed classification. Must run
 * inside a transaction that has already scoped `app.operating_company_id` (or a lucia-bypass connection
 * the caller scopes). Idempotent on (operating_company_id, deposit_id). NEVER posts.
 */
export async function upsertRelayDeposit(
  client: DbClient,
  operatingCompanyId: string,
  deposit: RelayDepositInput,
  companyCards: CompanyCardClasses | Set<string>,
  ingestSource: RelayDepositIngestSource
): Promise<RelayDepositResult> {
  const fundingCardLast4 = parseFundingCardLast4(deposit.note);
  const classification = classifyDeposit(deposit.status, fundingCardLast4, companyCards);
  const totalAmountCents = toCents(deposit.total_amount, "total_amount");

  const columns = [
    "operating_company_id",
    "deposit_id",
    "relay_created_at",
    "status",
    "total_amount_cents",
    "funding_card_last4",
    "note_raw",
    "classification",
    "raw_payload",
    "ingest_source",
  ] as const;

  const values: unknown[] = [
    operatingCompanyId,
    deposit.deposit_id,
    deposit.relay_created_at,
    (deposit.status ?? "").trim().toLowerCase(),
    totalAmountCents,
    fundingCardLast4,
    deposit.note ?? null,
    classification,
    JSON.stringify(deposit.raw ?? {}),
    ingestSource,
  ];

  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const updateSet = columns
    .filter((c) => c !== "operating_company_id" && c !== "deposit_id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .concat(["updated_at = now()"])
    .join(", ");

  const res = await client.query<{ id: string }>(
    `
      INSERT INTO integrations.relay_deposits (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT (operating_company_id, deposit_id)
      DO UPDATE SET ${updateSet}
      RETURNING id::text AS id
    `,
    values
  );
  const relayDepositId = res.rows[0]?.id;
  if (!relayDepositId) {
    throw new Error(`relay_deposit: upsert did not return an id for deposit_id=${deposit.deposit_id}`);
  }

  // Banking → Relay Fuel Wallet Received column (is_credit). Visibility only — no GL.
  await upsertRelayWalletDepositFeedRow(client, {
    operating_company_id: operatingCompanyId,
    deposit_id: deposit.deposit_id,
    relay_created_at: deposit.relay_created_at,
    amount_cents: totalAmountCents,
    note: deposit.note ?? null,
    classification,
    funding_card_last4: fundingCardLast4,
  });

  return { relay_deposit_id: relayDepositId, deposit_id: deposit.deposit_id, funding_card_last4: fundingCardLast4, classification };
}
