/** Fuel credit-signal / rail-preference leaf — extracted to break the fuel posting import cycle. */
import { USMCA_COMPANY_ID } from "../../org/company-ids.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>; };

export type CompanyDirectCredit = "cash" | "dreamline_card_payable" | "relay_fuel_wallet";

export type FuelTxnGlPostCandidate = {
  operating_company_id: string;
  /** Prefer the authenticated ingest actor; cron/backfill may omit → system actor. */
  actor_user_id?: string | null;
  fuel_transaction_id: string;
  /** Canonical fuel.fuel_transactions.fuel_type (diesel|def|gas|reefer_diesel|other). */
  fuel_type: string;
  transaction_at: string;
  /** Integer cents — never invent; caller must pass the real paid amount. */
  amount_cents: number;
  driver_id?: string | null;
  location_state?: string | null;
  gallons?: number | null;
  /** Relay cash_advance → driver_advance path when a driver is matched. */
  cash_advance?: boolean;
  /** The Relay staging row this fill came from (rail selection only — posted is derived, never stored; 202615410940). */
  relay_fuel_transaction_id?: string | null;
  /**
   * FUEL-08 — real payment method drives the company_direct credit side.
   * Prefer explicit fuel_card_id / has_fuel_card / company_direct_credit from the caller;
   * never hardcode "cash" for fleet-card / Relay rows.
   */
  fuel_card_id?: string | null;
  /** True when a fleet/fuel card number was present on the import/ingest row. */
  has_fuel_card?: boolean;
  /** Explicit override — when set, wins over inferred signals. */
  company_direct_credit?: CompanyDirectCredit;
};


/**
 * R-30.1-A (A/P control contamination fix, 2026-09-22) — SUPERSEDES the old FUEL-08 behavior of
 * this function, which collapsed EVERY card-settled fuel purchase into a blanket `ap` preference.
 * `resolveCompanyDirectCreditAccount("ap")` resolves the generic A/P control role/subtype (GL
 * 2000) — a control account backed by the accounting.bills subledger. Fuel-card purchases carry
 * no bill; crediting 2000 for them left 2000 at -108,938.77 against a $0.00 live bills subledger
 * (351 live fuel_event credits: 76 Relay + 275 Dreamline) while GL 2510 Dreamline Diesel Card
 * Payable sat at 0 postings. ap_control must NEVER credit a fuel_event. Ever.
 *
 * The card-settled credit now resolves PER RAIL, identified from the fuel transaction's own
 * fuel_card_id (stamped against catalogs.fuel_card_types by the Dreamline/Relay ingestion) —
 * never guessed:
 *   DREAMLINE (billed in arrears) -> "dreamline_card_payable" (GL 2510)
 *   RELAY (prefunded)             -> "relay_fuel_wallet"      (GL 1295)
 *
 * R-153.7 (owner-stated fact, 2026-09-25, NOT a guess): "USMCA buys fuel on two providers only:
 * Relay and Dreamline. USMCA runs its fuel on the IH 35 Transportation Relay account... So:
 * Dreamline-confirmed rows -> 2510; every other real USMCA fuel row -> Relay 1295. No card
 * statement is needed to pick the rail." This REPLACES the prior "no evidence -> cash" fallback,
 * but ONLY for USMCA -- no other entity has this owner statement on record, so every other
 * company keeps the pre-153.7 fail-closed/cash behavior unchanged (never widen an entity-specific
 * owner fact into a global default).
 */
/**
 * ACCT-F403 (Lead ruling Option 1, 2026-10-04) — a settlement-derived fuel row on the RELAY rail posts no fuel. Relay is a
 * prepaid wallet (1295): the cost is the Relay fill, at what Relay charged, posted when its wallet line is matched in Banking
 * (postFuelFillOnBankMatch kind 'relay_fuel'). The AlwaysTrack settlement line is driver-facing; it LINKS to that fill
 * (fuel.fuel_transactions.relay_fuel_transaction_id). Every fuel-row posting path resolves its rail here, so this is the door.
 */
export class RelayFillLinksNotPostsError extends Error {
  readonly code = "relay_fill_links_not_posts";
  constructor(public readonly fuelTransactionId: string) {
    super(
      `relay_fill_links_not_posts: fuel transaction ${fuelTransactionId} is on the Relay rail — it links to its Relay fill and posts ` +
        `no fuel; the fill posts at Relay's charge when its wallet line is matched in Banking (ACCT-F403)`
    );
  }
}

export function resolveCompanyDirectCreditPreference(
  candidate: FuelTxnGlPostCandidate,
  txnSignals?: { fuel_card_id?: string | null; fuel_card_code?: string | null; notes?: string | null; source?: string | null } | null
): CompanyDirectCredit {
  if (candidate.company_direct_credit === "relay_fuel_wallet") throw new RelayFillLinksNotPostsError(candidate.fuel_transaction_id);
  if (candidate.company_direct_credit) return candidate.company_direct_credit;

  const code = (txnSignals?.fuel_card_code ?? "").toUpperCase();
  if (code === "DREAMLINE") return "dreamline_card_payable";
  // ACCT-F403: every Relay-rail answer below is a fill that posts from its wallet line, never from this fuel row.
  if (code === "RELAY") throw new RelayFillLinksNotPostsError(candidate.fuel_transaction_id);
  // Legacy Relay-bridge rows created before fuel_card_id was stamped to the RELAY catalog row.
  if (candidate.relay_fuel_transaction_id) throw new RelayFillLinksNotPostsError(candidate.fuel_transaction_id);

  // R-153.7: for USMCA only, no-evidence rows are owner-stated Relay -- checked BEFORE the cardSignaled throw below, since
  // an owner FACT supersedes the "cannot identify" refusal. Relay -> the row links, it does not post (ACCT-F403).
  if (candidate.operating_company_id === USMCA_COMPANY_ID) throw new RelayFillLinksNotPostsError(candidate.fuel_transaction_id);

  const notes = (txnSignals?.notes ?? "").toLowerCase();
  const cardSignaled =
    Boolean(candidate.fuel_card_id || candidate.has_fuel_card || txnSignals?.fuel_card_id) ||
    notes.includes("card=") ||
    notes.includes("relay_bridge=1") ||
    notes.includes("relay_txn=");
  if (cardSignaled) {
    throw new Error(
      `fuel_event ${candidate.fuel_transaction_id}: a card is signaled (fuel_card_id=${
        txnSignals?.fuel_card_id ?? candidate.fuel_card_id ?? "null"
      }) but its rail could not be identified from a known catalogs.fuel_card_types row. ` +
        `Refusing to credit ap_control per R-30.1-A. Stamp fuel_card_id to DREAMLINE or RELAY, or pass an explicit company_direct_credit.`
    );
  }
  // No card signal at all (e.g. an older import row with neither a stamped fuel_card_id nor a
  // card-shaped note) — no evidence of a card/payable rail, so this is true cash, never a guess
  // at "ap" the way the pre-fix `source === 'import'` branch used to. (USMCA never reaches here —
  // handled above.)
  return "cash";
}

/** R-153.6: exported so fuel-expense-document.service.ts resolves the rail from the SAME query
 *  shape (fuel_card_id + catalogs.fuel_card_types.code) this poster already uses. */
export async function loadFuelTxnCreditSignals(
  client: DbClient,
  operatingCompanyId: string,
  fuelTransactionId: string
): Promise<{
  fuel_card_id: string | null;
  fuel_card_code: string | null;
  notes: string | null;
  source: string | null;
  unit_id: string | null;
  trailer_id: string | null;
  /** E14.2 — human JE memo parts (load # / unit / vendor / driver). Never invent. */
  load_number: string | null;
  unit_number: string | null;
  vendor_name: string | null;
  driver_name: string | null;
}> {
  const res = await client.query<{
    fuel_card_id: string | null;
    fuel_card_code: string | null;
    notes: string | null;
    source: string | null;
    unit_id: string | null;
    trailer_id: string | null;
    load_number: string | null;
    unit_number: string | null;
    vendor_name: string | null;
    driver_name: string | null;
  }>(
    `
      SELECT ft.fuel_card_id::text AS fuel_card_id,
             ct.code::text AS fuel_card_code,
             ft.notes,
             ft.source::text AS source,
             ft.unit_id::text AS unit_id,
             ft.trailer_id::text AS trailer_id,
             l.load_number::text AS load_number,
             u.unit_number::text AS unit_number,
             v.vendor_name::text AS vendor_name,
             NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS driver_name
        FROM fuel.fuel_transactions ft
        LEFT JOIN catalogs.fuel_card_types ct ON ct.id = ft.fuel_card_id
        LEFT JOIN mdata.loads l ON l.id = ft.load_id AND l.operating_company_id = ft.operating_company_id
        LEFT JOIN mdata.units u ON u.id = ft.unit_id AND (u.owner_company_id = $2::uuid OR u.currently_leased_to_company_id = $2::uuid)
        LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id AND v.operating_company_id = ft.operating_company_id
        LEFT JOIN mdata.drivers d ON d.id = ft.driver_id AND d.operating_company_id = ft.operating_company_id
       WHERE ft.id = $1::uuid
         AND ft.operating_company_id = $2::uuid
       LIMIT 1
    `,
    [fuelTransactionId, operatingCompanyId]
  );
  const row = res.rows[0];
  return {
    fuel_card_id: row?.fuel_card_id ?? null,
    fuel_card_code: row?.fuel_card_code ?? null,
    notes: row?.notes ?? null,
    source: row?.source ?? null,
    unit_id: row?.unit_id ?? null,
    trailer_id: row?.trailer_id ?? null,
    load_number: row?.load_number ?? null,
    unit_number: row?.unit_number ?? null,
    vendor_name: row?.vendor_name ?? null,
    driver_name: row?.driver_name ?? null,
  };
}
