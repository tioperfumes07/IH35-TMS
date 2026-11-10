/**
 * ACCT-F11141 — POST A SIGNED SETTLEMENT EXACTLY AS SIGNED (ROUND 8.7, owner order 2026-11-09 9:57 PM CT).
 *
 * MEASURED (prod 2026-11-10 03:55Z): the Settlement Creator post books missing loads and adopts free ones, but
 *   - 22 open P-trips (P-0079, P-0112, P-0114..P-0116, P-0123..P-0139) still hold live earnings / escrow lines for the
 *     loads a signed settlement pays, so the Creator refuses those loads (load_already_exists: isSeededLoadFreeForThisSettlement)
 *     or, once adopted, the P-trip would pay them a second time;
 *   - prod #5852..#5856 carry the wrong driver / loads for their number (prod 5853 = P-0117 Carlos 13691, signed 5853 = Hugo
 *     13688 13694 13701) and the Creator cannot replace a settlement under another number.
 *
 * ONE engine call, ONE transaction (the caller's), idempotent on the settlement number:
 *   0. already as signed  — a live settlement with this number, this driver, exactly these loads and this net: nothing posts.
 *   1. supersede          — for every load on the signed document:
 *        a. a live settlement under THIS number that differs, or a POSTED / closed settlement under ANOTHER number holding
 *           the load, is reversed through the Creator's own Edit reverse (voidPriorCreatorSettlementForEdit: expenses,
 *           advances, deductions, then reverseSettlementForVoid — equal-and-opposite JEs); its loads are free again;
 *        b. an OPEN P-trip holding the load: when every load it holds is on this document, the whole trip is voided through
 *           reverseSettlementForVoid; otherwise the load's own lines are voided (the void cascade's line rule), its open
 *           driver bill and unpaid reimbursements are released from the trip, and the trip header is recomputed by
 *           recomputeSettlementHeader — the trip keeps only the loads the document does not pay;
 *        c. the fills a reversed settlement left live on these loads are handed to the post to be re-used (one provider
 *           transaction is one row: Option 1, 5769 repair).
 *   2. post               — ensureDispatchedLoadsForCreator + postSettlementCreatorInClientTx with settlement_no = the signed
 *                           number (the ONE poster and the pay-run close). The Creator itself refuses a net that is not the
 *                           document's TOTAL DUE; this engine also refuses gross / additions / deductions that differ.
 * No GL math here: every dollar is posted or reversed by the existing engines.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { notVoided, statusNotCancelled } from "../accounting/live-document-predicates.sql.js";
import { reverseDeductionForVoid, reverseSettlementForVoid } from "./void-document-callees.service.js";
import { recomputeSettlementHeader } from "./settlement-load-reassignment.service.js";
import { ensureDispatchedLoadsForCreator } from "./settlement-creator-seed-loads.js";
import { postSettlementCreatorInClientTx, voidPriorCreatorSettlementForEdit } from "./settlement-creator.service.js";
import { SettlementCreatorError } from "./settlement-creator-error.js";
import { matchSettlementPdfItem } from "../catalogs/settlement-pdf-item-map.js";
import type {
  SettlementCreatorDraft,
  SettlementCreatorExpenseLine,
  SettlementCreatorExpensePaymentSource,
  SettlementCreatorFuelCard,
  SettlementCreatorFuelLine,
  SettlementCreatorLoadBlock,
  SettlementCreatorPostResult,
} from "./settlement-creator.types.js";

type Q = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

const AUDIT_TAG = "ACCT-F11141";
/** Owner 2026-11-09: "Before October 9 USMCA fueled on Relay and Dreamline" (Dreamline since canceled; WEX after). */
const DREAMLINE_LAST_DAY = "2026-10-08";

// ---------------------------------------------------------------------------------------------------------------------
// The signed AlwaysTrack document, as the Company + Driver settlement PDFs print it (scratchpad parse_settle.py shape).
// ---------------------------------------------------------------------------------------------------------------------
export type SignedStop = { load: string; type: "PICKUP" | "DELIVER" | "EMPTY"; date: string; city: string; state: string; zip?: string; truck: string; trailer: string; driver?: string };
export type SignedCharge = { load: string; item: string; customer: string; miles: number; rate?: number | null; qp?: number | null; amount: number };
export type SignedPay = { load: string; item: string; qty: number; rate: number | null; total: number };
export type SignedFuel = { load: string | null; date: string; vendor: string; location?: string; invoice: string; gallons: number; cpg: number; receipt: number; fees: number; disc: number; actual: number };
export type SignedExpense = { date: string; vendor: string; location?: string; invoice: string; description: string; reimb: string; comp: string; amount: number };
export type SignedDriverLine = { load: string; text?: string; amount: number; date: string | null; desc: string };
export type SignedLoadMeta = {
  /** The load's W.O. / PO (AlwaysTrack load history) — required only for a load this post books. */
  wo?: string | null;
  po?: string | null;
  /** The Faro / QuickBooks invoice number (digits) when Faro purchased the invoice. */
  invoice_number?: string | null;
  factoring?: "faro_usmca" | "faro_transportation" | "direct";
};
export type SignedSettlement = {
  num: number | string;
  start: string;
  end: string;
  stops: SignedStop[];
  charges: SignedCharge[];
  driver_pay: SignedPay[];
  fuel: SignedFuel[];
  expenses: SignedExpense[];
  revenue?: Record<string, { amount: number } | unknown>;
  drv: {
    driver: string;
    salary: number;
    add: SignedDriverLine[];
    reimb: SignedDriverLine[];
    ded: SignedDriverLine[];
    add_total: number;
    reimb_total: number;
    ded_total: number;
    total_due: number;
  };
  loads_meta?: Record<string, SignedLoadMeta>;
  /** How a company expense the document prints with no card was paid (and, when the printed payee is not a vendor of this
   *  company, the vendor it is booked to), keyed `${date}|${amount_cents}`. */
  expense_cards?: Record<string, SettlementCreatorExpensePaymentSource | { card: SettlementCreatorExpensePaymentSource; vendor?: string | null }>;
  /** A stop's coordinates when no stop / location of this company and no geocoder knows the place, keyed `${CITY}|${ST}|${zip5}`. */
  stop_coords?: Record<string, { lat: number; lng: number; source?: string }>;
  /**
   * Expenses on these loads the document does NOT print that a PERSON (the owner / closer) has decided — OWNER RULING 443.288:
   * a machine's proposal blocks the close until a person confirms it. Each named expense (by its number) is confirmed on its
   * current load, or carried to `load_number`, through THE confirm engine. Never filled by a machine.
   */
  confirm_expense_loads?: Array<{ expense_number: string; load_number?: string | null }>;
  /** A fill's card when the received statements cannot say, keyed `${invoice}|${fuel_type}`. */
  fuel_cards?: Record<string, { card: SettlementCreatorFuelCard; relay_transaction_id?: string | null }>;
};

export type PostAsSignedResult =
  | { status: "already_as_signed"; settlement_no: string; settlement_id: string; display_id: string; net_cents: number }
  | {
      status: "posted";
      settlement_no: string;
      settlement_id: string;
      display_id: string;
      net_cents: number;
      gross_cents: number;
      superseded: SupersedeReport;
      fuel_cards: Array<{ line: string; card: string; basis: string }>;
      created_load_numbers: string[];
      result: SettlementCreatorPostResult;
      /** The booked loads' after-commit extras (geofences, geocode backfill): run ONLY after COMMIT, never serialized. */
      after_commit: Array<() => void>;
      stop_stamps: unknown[];
    };

export type SupersedeReport = {
  reversed_settlements: Array<{ settlement_id: string; display_id: string; settlement_no: string | null; reason: string }>;
  voided_trips: Array<{ settlement_id: string; display_id: string }>;
  trimmed_trips: Array<{ settlement_id: string; display_id: string; load_numbers: string[]; lines_voided: number }>;
  reassigned_loads: Array<{ load_number: string; from_driver_id: string | null }>;
  reused_fill_ids: string[];
  /** Expenses of the fills the document prints, their load confirmed (moved when the document prints another load). */
  confirmed_fill_expenses?: Array<{ expense_id: string; load_number: string; moved: boolean }>;
  /** Expenses the document does not print, confirmed by the person the payload names them for (confirm_expense_loads). */
  person_confirmed_expenses?: string[];
};

const rows1 = (r: unknown[]) => r.length;
const cents = (dollars: number | null | undefined): number => Math.round(Number(dollars ?? 0) * 100);
const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);

// ---------------------------------------------------------------------------------------------------------------------
// Pure: the signed document's own control totals (refused before anything is read or written when they do not foot).
// ---------------------------------------------------------------------------------------------------------------------
export function signedDocumentFootingErrors(s: SignedSettlement): string[] {
  const out: string[] = [];
  const miles = s.driver_pay.filter((p) => /Miles$/i.test(p.item)).reduce((n, p) => n + cents(p.total), 0);
  if (miles !== cents(s.drv.salary)) out.push(`driver pay lines ${miles / 100} ≠ salary ${s.drv.salary}`);
  const sum = (xs: SignedDriverLine[]) => xs.reduce((n, x) => n + cents(x.amount), 0);
  if (sum(s.drv.add) !== cents(s.drv.add_total)) out.push(`additional pay lines ≠ ${s.drv.add_total}`);
  if (sum(s.drv.reimb) !== cents(s.drv.reimb_total)) out.push(`reimbursement lines ≠ ${s.drv.reimb_total}`);
  if (sum(s.drv.ded) !== cents(s.drv.ded_total)) out.push(`deduction lines ≠ ${s.drv.ded_total}`);
  const due = cents(s.drv.salary) + cents(s.drv.add_total) + cents(s.drv.reimb_total) + cents(s.drv.ded_total);
  if (due !== cents(s.drv.total_due)) out.push(`salary + additions + reimbursements + deductions ${due / 100} ≠ TOTAL DUE ${s.drv.total_due}`);
  const loads = new Set(s.charges.map((c) => c.load));
  if (!loads.size) out.push("the document names no load");
  return out;
}

/** Pure: the signed document's load set and its driver net, in cents (what "already as signed" compares). */
export function signedIdentity(s: SignedSettlement): { settlement_no: string; load_numbers: string[]; net_cents: number } {
  return {
    settlement_no: String(s.num).trim(),
    load_numbers: [...new Set(s.charges.map((c) => c.load.trim()))].sort(),
    net_cents: cents(s.drv.total_due),
  };
}

const ADDITIONAL_PAY_ITEMS: Array<[RegExp, string, "layover" | "other"]> = [
  [/Enlonada|Desenlonada|Tarp/i, "Driver Pay-Tarp-Enlonada/Desenlonada", "other"],
  [/Extra Delivery|Drop/i, "Driver Pay-Extra Delivery/Drop", "other"],
  [/Extra Pick/i, "Driver Pay-Extra Pick Up", "other"],
  [/Layover|Estancia/i, "Driver Pay-Layover-Estancia", "layover"],
  [/Bonus/i, "Driver Pay-Bonus", "other"],
];

async function itemIdByName(client: Q, co: string, name: string): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.items WHERE operating_company_id = $1::uuid AND lower(trim(item_name)) = lower(trim($2)) LIMIT 1`,
    [co, name],
  );
  return r.rows[0]?.id ?? null;
}

/** The catalog item a printed EXPENSES category posts to: the canonical PDF map (by id), else the item of that exact name. */
async function expenseItemId(client: Q, co: string, category: string): Promise<string | null> {
  const hit = matchSettlementPdfItem(co, { description: category })
    ?? matchSettlementPdfItem(co, { description: category.split(/[/]/)[0]!.trim() });
  if (hit) return hit.itemId;
  return itemIdByName(client, co, category);
}

/** The company's vendor of exactly the printed name, else none (the printed name stays on the line's description). */
async function vendorByName(client: Q, co: string, name: string | null | undefined): Promise<string | null> {
  if (!name?.trim()) return null;
  const r = await client.query<{ vendor_name: string }>(
    `SELECT vendor_name FROM mdata.vendors WHERE operating_company_id = $1::uuid AND lower(trim(vendor_name)) = lower(trim($2))
        AND COALESCE(is_sample_data, false) IS NOT TRUE LIMIT 1`,
    [co, name],
  );
  return r.rows[0]?.vendor_name ?? null;
}

/**
 * The fill a statement already RECEIVED for one printed fuel line: the truck's fill of that product (the FUEL section prints
 * reefer fuel as fuel too), day +-1, at the printed amount as charged or gross, or at the printed gallons (+-0.01 — a
 * Relay fill is recorded at Relay's discounted charge, never the pump price). Exactly one, else none (never a guess).
 */
export type ReceivedFill = {
  fill_id: string; card: string; fuel_type: string; gallons: number | null; relay_txn: string | null; load_id: string | null;
  expense_id: string | null; confirmation: string | null; on_settlement: boolean; source: string;
};
export async function findReceivedFill(
  client: Q, co: string,
  line: { fuel_types: string[]; date: string; amount_cents: number; gallons: number | null; unit_id: string | null },
): Promise<ReceivedFill | null> {
  const rows = (await client.query<ReceivedFill>(
    `SELECT f.id::text AS fill_id, lower(ct.code) AS card, f.fuel_type::text AS fuel_type, f.gallons::float8 AS gallons,
            r.transaction_id AS relay_txn, f.load_id::text AS load_id, f.source::text AS source,
            e.id::text AS expense_id, e.load_confirmation::text AS confirmation,
            COALESCE(e.settlement_no IS NOT NULL OR e.source_settlement_ref IS NOT NULL, false) AS on_settlement
       FROM fuel.fuel_transactions f
       JOIN catalogs.fuel_card_types ct ON ct.id = f.fuel_card_id AND ct.operating_company_id = f.operating_company_id
       LEFT JOIN integrations.relay_fuel_transactions r ON r.id = f.relay_fuel_transaction_id
       LEFT JOIN LATERAL (SELECT x.* FROM accounting.expenses x
                           WHERE x.source_fuel_transaction_id = f.id AND x.operating_company_id = f.operating_company_id
                             AND ${notVoided("x")} AND x.parent_expense_id IS NULL ORDER BY x.created_at LIMIT 1) e ON true
      WHERE f.operating_company_id = $1::uuid AND ${notVoided("f")} AND f.fuel_type::text = ANY($2::text[])
        AND (f.source <> 'manual' OR r.transaction_id IS NOT NULL)
        AND ($6::uuid IS NULL OR f.unit_id = $6::uuid)
        AND (COALESCE(f.purchased_at, f.transaction_at) AT TIME ZONE 'America/Chicago')::date BETWEEN $3::date - 1 AND $3::date + 1
        AND ($4::bigint IN (round(f.total_cost * 100)::bigint, round(COALESCE(f.gross_cost, -1) * 100)::bigint)
             OR ($5::numeric IS NOT NULL AND f.gallons IS NOT NULL AND abs(f.gallons - $5::numeric) <= 0.01))
      ORDER BY array_position($2::text[], f.fuel_type::text),
               abs((COALESCE(f.purchased_at, f.transaction_at) AT TIME ZONE 'America/Chicago')::date - $3::date)
      LIMIT 3`,
    [co, line.fuel_types, line.date, line.amount_cents, line.gallons, line.unit_id],
  )).rows;
  if (!rows.length) return null;
  const best = rows.filter((r) => r.fuel_type === rows[0]!.fuel_type);
  return best.length === 1 ? best[0]! : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Resolution: the signed document -> the Settlement Creator draft. Read-only; every unresolved line refused by name.
// ---------------------------------------------------------------------------------------------------------------------
export async function signedToCreatorDraft(
  client: Q,
  co: string,
  s: SignedSettlement,
): Promise<{ draft: SettlementCreatorDraft; refusals: string[]; fuel_cards: Array<{ line: string; card: string; basis: string }> }> {
  const refusals: string[] = [...signedDocumentFootingErrors(s)];
  const no = String(s.num).trim();
  const loadNumbers = [...new Set(s.charges.map((c) => c.load.trim()))];
  const existing = (await client.query<{ id: string; load_number: string; driver_id: string | null; unit_id: string | null; po: string | null; wo: string | null }>(
    `SELECT DISTINCT ON (load_number) id::text, load_number, assigned_primary_driver_id::text AS driver_id, assigned_unit_id::text AS unit_id,
            customer_po_number AS po, customer_wo_number AS wo
       FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = ANY($2::text[]) AND soft_deleted_at IS NULL
        AND COALESCE(is_sample_data, false) IS NOT TRUE
      ORDER BY load_number, created_at DESC`,
    [co, loadNumbers],
  )).rows;
  const byNumber = new Map(existing.map((r) => [r.load_number, r]));

  // Driver: the company's non-inactive driver whose every name token is on the document; the loads' own driver wins a tie.
  const want = new Set(norm(s.drv.driver));
  const drivers = (await client.query<{ id: string; first_name: string; last_name: string; status: string | null }>(
    `SELECT id::text, first_name, last_name, status FROM mdata.drivers
      WHERE operating_company_id = $1::uuid AND COALESCE(is_sample_data, false) IS NOT TRUE AND status::text IS DISTINCT FROM 'Inactive'`,
    [co],
  )).rows.filter((d) => { const t = norm(`${d.first_name} ${d.last_name}`); return t.length >= 2 && t.every((x) => want.has(x)); });
  const loadDrivers = new Set(existing.map((e) => e.driver_id).filter(Boolean) as string[]);
  const preferred = drivers.filter((d) => loadDrivers.has(d.id));
  const driverPick = preferred.length === 1 ? preferred[0] : drivers.length === 1 ? drivers[0] : null;
  if (!driverPick) refusals.push(`Driver "${s.drv.driver}": ${drivers.length} active drivers of this company match the name — exactly one must.`);
  const driverId = driverPick?.id ?? "";

  // Unit: the truck the document prints, as this company's loads carry it.
  const truck = s.stops[0]?.truck ?? "";
  const unit = (await client.query<{ id: string }>(
    `SELECT u.id::text FROM mdata.units u
      WHERE u.unit_number = $2 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
        AND COALESCE(u.is_sample_data, false) IS NOT TRUE
      ORDER BY (SELECT count(*) FROM mdata.loads l WHERE l.assigned_unit_id = u.id AND l.operating_company_id = $1::uuid) DESC LIMIT 1`,
    [co, truck],
  )).rows[0];
  if (!unit) refusals.push(`Truck ${truck}: not a unit of this fleet.`);

  const stopCoord = async (st: { city: string; state: string; zip?: string }): Promise<{ lat: number; lng: number } | null> => {
    const zip = (st.zip ?? "").slice(0, 5);
    // 1. a geocoded stop of this company at the same place; 2. a geocoded location of this company; 3. the document
    // payload's stop_coords; 4. the geocoder (Google locality on the server).
    const r = await client.query<{ lat: number; lng: number }>(
      `SELECT lat, lng FROM (
         SELECT st.latitude::float8 AS lat, st.longitude::float8 AS lng, (left(COALESCE(st.postal_code, ''), 5) = $4) AS z, st.created_at AS at, 1 AS src
           FROM mdata.load_stops st JOIN mdata.loads l ON l.id = st.load_id AND l.operating_company_id = $1::uuid
          WHERE upper(trim(st.city)) = upper(trim($2)) AND upper(trim(st.state)) = upper(trim($3))
            AND ($4 = '' OR st.postal_code IS NULL OR left(st.postal_code, 5) = $4) AND st.latitude IS NOT NULL AND st.longitude IS NOT NULL
         UNION ALL
         SELECT lo.latitude::float8, lo.longitude::float8, (left(COALESCE(lo.postal_code, ''), 5) = $4), lo.created_at, 2
           FROM mdata.locations lo
          WHERE lo.operating_company_id = $1::uuid AND lo.deactivated_at IS NULL AND upper(trim(lo.city)) = upper(trim($2))
            AND upper(trim(lo.state)) = upper(trim($3)) AND ($4 = '' OR lo.postal_code IS NULL OR left(lo.postal_code, 5) = $4)
            AND lo.latitude IS NOT NULL AND lo.longitude IS NOT NULL) x
        ORDER BY src, z DESC, at DESC LIMIT 1`,
      [co, st.city, st.state, zip],
    );
    if (r.rows[0]) return r.rows[0];
    const given = s.stop_coords?.[`${st.city.trim().toUpperCase()}|${st.state.trim().toUpperCase()}|${zip}`];
    if (given && Number.isFinite(given.lat) && Number.isFinite(given.lng)) return { lat: given.lat, lng: given.lng };
    const { geocodeAddressWithEvidence } = await import("../telematics/stop-geocode-fallback.service.js");
    const g = await geocodeAddressWithEvidence({ address_line1: null, city: st.city, state: st.state, postal_code: zip || null, country: "US" });
    return g.ok ? { lat: g.latitude, lng: g.longitude } : null;
  };

  const loads: SettlementCreatorLoadBlock[] = [];
  const firstLoad = loadNumbers[0];
  for (const ln of loadNumbers) {
    const charge = s.charges.filter((c) => c.load.trim() === ln);
    const pay = s.driver_pay.filter((p) => p.load.trim() === ln);
    const stops = s.stops.filter((st) => st.load.trim() === ln && st.type !== "EMPTY");
    const meta = s.loads_meta?.[ln] ?? {};
    const ex = byNumber.get(ln);
    const loaded = pay.filter((p) => /^Loaded Miles$/i.test(p.item));
    const empty = pay.filter((p) => /^Empty Miles$/i.test(p.item));
    const loadedMiles = loaded.reduce((n, p) => n + Number(p.qty), 0);
    const emptyMiles = empty.reduce((n, p) => n + Number(p.qty), 0);
    const picks = pay.filter((p) => /Picks$/i.test(p.item)).reduce((n, p) => n + Number(p.qty), 0);
    const drops = pay.filter((p) => /Drops$/i.test(p.item)).reduce((n, p) => n + Number(p.qty), 0);
    const pickups = stops.filter((x) => x.type === "PICKUP");
    const deliveries = stops.filter((x) => x.type === "DELIVER");
    if (!pickups.length || !deliveries.length) { refusals.push(`Load ${ln}: the document prints no pickup or no delivery.`); continue; }
    const coords: Array<{ lat: number; lng: number } | null> = [];
    if (ex) {
      // Adopted load: its own geocoded stops (first pickup, last delivery) — never re-geocoded from a city name.
      const dbStops = (await client.query<{ stop_type: string; lat: number | null; lng: number | null }>(
        `SELECT stop_type::text, latitude::float8 AS lat, longitude::float8 AS lng FROM mdata.load_stops WHERE load_id = $1::uuid ORDER BY sequence_number`,
        [ex.id],
      )).rows;
      const p = dbStops.find((x) => x.stop_type === "pickup");
      const d = [...dbStops].reverse().find((x) => x.stop_type === "delivery");
      for (const st of stops) coords.push(st.type === "PICKUP" ? (p?.lat != null ? { lat: p.lat, lng: p.lng! } : null) : (d?.lat != null ? { lat: d.lat, lng: d.lng! } : null));
    } else {
      for (const st of stops) coords.push(await stopCoord(st));
    }
    stops.forEach((st, i) => { if (!coords[i]) refusals.push(`Load ${ln}: stop ${st.city}, ${st.state} ${st.zip ?? ""} has no coordinates (no stop or location of this company, no geocoder answer) — name them in stop_coords.`); });
    const wo = (ex?.wo ?? meta.wo ?? null)?.toString().trim() || null;
    const po = (ex?.po ?? meta.po ?? null)?.toString().trim() || null;
    if (!ex && !wo && !po) refusals.push(`Load ${ln}: the W.O. / PO is required to book it (AlwaysTrack load history W.O.).`);
    const lastDelivery = deliveries[deliveries.length - 1]!;
    const multi = stops.length > 2;
    const block: SettlementCreatorLoadBlock = {
      load_number: ln,
      customer_name: charge[0]?.customer ?? null,
      customer_po_number: po,
      customer_wo_number: wo,
      trailer_equipment_number: stops[0]?.trailer ?? null,
      pickup_date: pickups[0]!.date,
      pickup_city: pickups[0]!.city,
      pickup_state: pickups[0]!.state,
      pickup_zip: pickups[0]!.zip || null,
      pickup_lat: coords[stops.indexOf(pickups[0]!)]?.lat ?? null,
      pickup_lng: coords[stops.indexOf(pickups[0]!)]?.lng ?? null,
      delivery_date: lastDelivery.date,
      delivery_city: lastDelivery.city,
      delivery_state: lastDelivery.state,
      delivery_zip: lastDelivery.zip || null,
      delivery_lat: coords[stops.indexOf(lastDelivery)]?.lat ?? null,
      delivery_lng: coords[stops.indexOf(lastDelivery)]?.lng ?? null,
      stops: multi
        ? stops.map((st, i) => ({ stop_type: st.type === "PICKUP" ? "pickup" as const : "delivery" as const, date: st.date, city: st.city, state: st.state, zip: st.zip || null, lat: coords[i]?.lat ?? null, lng: coords[i]?.lng ?? null }))
        : null,
      line_haul_miles: charge.reduce((n, c) => n + Number(c.miles ?? 0), 0) || null,
      loaded_miles: charge.reduce((n, c) => n + Number(c.miles ?? 0), 0) || null,
      line_haul_amount_cents: charge.reduce((n, c) => n + cents(c.amount), 0),
      miles_shortest: loadedMiles > 0 ? Math.round(loadedMiles * 10) / 10 : null,
      line_haul_rate_cents: loaded[0]?.rate != null ? cents(loaded[0].rate) : null,
      empty_miles: emptyMiles > 0 ? Math.round(emptyMiles * 10) / 10 : null,
      empty_rate_cents: empty[0]?.rate != null ? cents(empty[0].rate) : null,
      picks: picks || null,
      drops: drops || null,
      factoring: meta.factoring ?? "direct",
      invoice_number: meta.invoice_number ?? null,
      not_yet_delivered: false,
      // One signed settlement is one tour: its first load opens it, the others join it (seed-loads resolveTourIdForSb).
      trip_type: ln === firstLoad ? "NB" : (lastDelivery.state.toUpperCase() === "TX" ? "SB" : "TR"),
      join_outbound_load_number: ln === firstLoad ? null : firstLoad,
    };
    if (block.miles_shortest != null && block.loaded_miles != null && block.miles_shortest > block.loaded_miles) {
      block.loaded_miles = block.miles_shortest; // practical never below the pay miles (loads_miles_shortest_not_over_practical)
    }
    loads.push(block);
  }

  // Fuel: every diesel fill, plus the DEF / reefer-fuel lines the EXPENSES section prints on a fuel ticket (posted as their
  // product's fill, as 5845..5852 were). The card is the statement that RECEIVED the purchase; a purchase on no statement
  // is the other card of its day (owner: Relay + Dreamline before 2026-10-09, Relay + WEX after).
  const fuelCards: Array<{ line: string; card: string; basis: string }> = [];
  const fuel: SettlementCreatorFuelLine[] = [];
  const ticketLoad = new Map(s.fuel.map((f) => [f.invoice, f.load]));
  const productLines: Array<{ fuel_type: "diesel" | "def" | "reefer_diesel"; types: string[]; date: string; invoice: string; amount: number; gallons: number | null; cpg: number | null; load: string | null; vendor: string; location?: string }> = [
    ...s.fuel.map((f) => ({ fuel_type: "diesel" as const, types: ["diesel", "reefer_diesel"], date: f.date, invoice: f.invoice, amount: f.actual, gallons: f.gallons, cpg: f.cpg, load: f.load, vendor: f.vendor, location: f.location })),
    ...s.expenses
      .filter((e) => !e.reimb && (/^Fuel-DEF/i.test(e.description) || /^Fuel-Reefer/i.test(e.description)))
      .map((e) => ({ fuel_type: /^Fuel-DEF/i.test(e.description) ? "def" as const : "reefer_diesel" as const, types: [/^Fuel-DEF/i.test(e.description) ? "def" : "reefer_diesel"], date: e.date, invoice: e.invoice, amount: e.amount, gallons: null, cpg: null, load: ticketLoad.get(e.invoice) ?? null, vendor: e.vendor.replace(/[^A-Za-z ]/g, "").trim() || "LOVES", location: e.location })),
  ];
  // A product line off any fuel ticket of the FUEL section carries no load: the load whose dates cover it, else the NEXT load of
  // this settlement (owner 2026-10-22: "diesel bought when the truck has no load goes to that truck's NEXT load ... never to a
  // load that was already completed"), else the settlement's last load.
  const spans = loads.map((l) => ({ n: l.load_number, from: l.pickup_date ?? "", to: l.delivery_date ?? l.pickup_date ?? "" }));
  const attributed = new Set<(typeof productLines)[number]>();
  for (const f of productLines) {
    if (f.load) continue;
    attributed.add(f);
    f.load = spans.find((x) => x.from <= f.date && f.date <= x.to)?.n
      ?? [...spans].filter((x) => x.from > f.date).sort((a, b) => (a.from < b.from ? -1 : 1))[0]?.n
      ?? spans[spans.length - 1]?.n ?? null;
  }
  for (const f of productLines) {
    const label = `${f.types.join('/')} ${f.date} ticket ${f.invoice} $${f.amount.toFixed(2)}`;
    const amount = cents(f.amount);
    const override = s.fuel_cards?.[`${f.invoice}|${f.fuel_type}`];
    let card: SettlementCreatorFuelCard;
    let relayTxn: string | null = null;
    let basis: string;
    let gallons = f.gallons;
    // A received statement row (findReceivedFill: the truck's fill of that product, day +-1, amount or gallons).
    const received = await findReceivedFill(client, co, { fuel_types: f.types, date: f.date, amount_cents: amount, gallons: f.gallons, unit_id: unit?.id ?? null });
    let fuelType = f.fuel_type;
    const relay = received ? null : (await client.query<{ txn: string }>(
      `SELECT transaction_id AS txn FROM integrations.relay_fuel_transactions
        WHERE operating_company_id = $1::uuid AND ${notVoided()} AND is_active
          AND (relay_created_at AT TIME ZONE 'America/Chicago')::date BETWEEN $2::date - 1 AND $2::date + 1
          AND $3::bigint IN (total_amount_paid_cents, total_retail_price_cents)
        ORDER BY abs((relay_created_at AT TIME ZONE 'America/Chicago')::date - $2::date) LIMIT 2`,
      [co, f.date, amount],
    )).rows;
    if (override) {
      card = override.card; relayTxn = override.relay_transaction_id ?? null; basis = "document payload";
    } else if (received) {
      card = received.card as SettlementCreatorFuelCard; relayTxn = received.relay_txn; basis = `${received.card.toUpperCase()} statement row ${received.fill_id}`;
      gallons = gallons ?? received.gallons;
      fuelType = received.fuel_type as typeof fuelType;
      // A line the document prints off any ticket follows the signed load its received fill already sits on.
      const onSigned = received.load_id ? existing.find((x) => x.id === received.load_id)?.load_number : undefined;
      if (attributed.has(f) && onSigned && loadNumbers.includes(onSigned)) f.load = onSigned;
    } else if (relay && relay.length === 1) {
      card = "relay"; relayTxn = relay[0]!.txn; basis = "Relay transaction";
    } else {
      card = f.date <= DREAMLINE_LAST_DAY ? "dreamline" : "wex";
      basis = `on no Relay statement -> ${card.toUpperCase()} (owner: Relay + ${card === "dreamline" ? "Dreamline before 2026-10-09" : "WEX after 2026-10-08"})`;
    }
    if (card === "relay" && !relayTxn) refusals.push(`Fuel ${label}: Relay fill without its Relay transaction.`);
    fuelCards.push({ line: label, card, basis });
    fuel.push({
      date: f.date,
      vendor_name: f.vendor,
      location: f.location ?? null,
      invoice: f.invoice || null,
      gallons: gallons ?? (null as unknown as number),
      cpg_cents: f.cpg != null ? Math.round(Number(f.cpg) * 100 * 1000) / 1000 : (null as unknown as number),
      receipt_cents: amount,
      fees_cents: 0,
      discount_cents: 0,
      card,
      relay_transaction_id: relayTxn,
      fuel_type: fuelType,
      load_number: f.load,
    });
  }

  // One provider ticket is one purchase per product: two printed lines of the same ticket and product that no statement
  // received apart (5870: ticket 99728189 printed twice, 196.24 + 195.70) are that one purchase.
  for (let i = 0; i < fuel.length; i++) {
    for (let j = fuel.length - 1; j > i; j--) {
      const a = fuel[i]!, b = fuel[j]!;
      if (a.invoice && a.invoice === b.invoice && a.fuel_type === b.fuel_type && a.card === b.card && !a.relay_transaction_id && !b.relay_transaction_id
          && fuelCards[i]!.basis.startsWith("on no Relay") && fuelCards[j]!.basis.startsWith("on no Relay")) {
        a.receipt_cents = Number(a.receipt_cents ?? 0) + Number(b.receipt_cents ?? 0);
        a.gallons = a.gallons != null && b.gallons != null ? Math.round((Number(a.gallons) + Number(b.gallons)) * 1000) / 1000 : a.gallons;
        fuelCards[i]!.line += ` + ${fuelCards[j]!.line} (one ticket)`;
        fuel.splice(j, 1); fuelCards.splice(j, 1);
      }
    }
  }

  // Expenses: a Drv line is the driver's reimbursement (paid back on this settlement, never a card); any other non-fuel
  // company expense is the company's, paid by the card of its fuel ticket or the payload's named source.
  const expenses: SettlementCreatorExpenseLine[] = [];
  const reimbLines = [...s.drv.reimb];
  const reimbursements: SettlementCreatorDraft["reimbursements"] = [];
  let companyExpensesCents = 0;
  for (const e of s.expenses) {
    if (!e.reimb && (/^Fuel-DEF/i.test(e.description) || /^Fuel-Reefer/i.test(e.description))) continue;
    const amount = cents(e.amount);
    if (e.reimb) {
      const i = reimbLines.findIndex((r) => cents(r.amount) === amount);
      const r = i >= 0 ? reimbLines.splice(i, 1)[0]! : null;
      const itemId = await expenseItemId(client, co, e.description);
      if (!itemId) refusals.push(`Reimbursed expense "${e.description}" ${e.date}: no catalog item maps the printed category.`);
      expenses.push({
        date: e.date, item_name: e.description, description: [e.description, e.vendor].filter(Boolean).join(" — "), amount_cents: amount,
        load_number: r?.load ?? null, is_company_expense: false, is_reimbursable: true, item_id: itemId,
        vendor_name: await vendorByName(client, co, e.vendor), vendor_document_number: e.invoice || null,
      });
      continue;
    }
    const ticket = fuel.find((x) => x.invoice && x.invoice === e.invoice);
    const named = s.expense_cards?.[`${e.date}|${amount}`];
    const namedCard = typeof named === "string" ? named : named?.card ?? null;
    const namedVendor = typeof named === "object" && named ? named.vendor ?? null : null;
    const card = namedCard ?? (ticket ? (ticket.card as SettlementCreatorExpensePaymentSource) : null);
    if (!card) refusals.push(`Company expense "${e.description}" ${e.date} $${e.amount.toFixed(2)} ${e.vendor}: name how it was paid (expense_cards["${e.date}|${amount}"] = owed | wex | relay; a Relay-paid line needs its Relay transaction — the Relay wallet is consumed only by a Relay fill).`);
    companyExpensesCents += amount;
    const itemId = await expenseItemId(client, co, e.description);
    if (!itemId) refusals.push(`Company expense "${e.description}" ${e.date}: no catalog item maps the printed category.`);
    // The payee: the printed vendor when it is a vendor of this company, else the vendor the payload names; a line on a fuel
    // ticket is that ticket's station.
    const vendorName = (await vendorByName(client, co, e.vendor))
      ?? (namedVendor ? await vendorByName(client, co, namedVendor) : null)
      ?? (ticket ? await vendorByName(client, co, ticket.vendor_name) : null);
    if (!vendorName) refusals.push(`Company expense "${e.description}" ${e.date}: vendor "${e.vendor}" is not a vendor of this company — map it in Vendors.`);
    expenses.push({
      date: e.date, item_name: e.description, description: [e.description, e.vendor].filter(Boolean).join(" — "), amount_cents: amount,
      load_number: ticket?.load_number ?? null, is_company_expense: true, is_reimbursable: false, item_id: itemId,
      card, vendor_name: vendorName, vendor_document_number: e.invoice || null,
    });
  }
  for (const e of expenses) {
    if (e.load_number) continue;
    e.load_number = spans.find((x) => x.from <= e.date && e.date <= x.to)?.n
      ?? [...spans].filter((x) => x.from > e.date).sort((a, b) => (a.from < b.from ? -1 : 1))[0]?.n
      ?? spans[spans.length - 1]?.n ?? null;
  }
  for (const r of reimbLines) reimbursements.push({ description: r.desc, amount_cents: cents(r.amount), load_number: r.load });

  const additional_pay: NonNullable<SettlementCreatorDraft["additional_pay"]> = [];
  for (const a of s.drv.add) {
    const hit = ADDITIONAL_PAY_ITEMS.find(([re]) => re.test(a.desc));
    const itemId = hit ? await itemIdByName(client, co, hit[1]) : null;
    if (!itemId) refusals.push(`Additional pay "${a.desc}": no Driver Pay item maps it.`);
    additional_pay.push({ description: a.desc, amount_cents: cents(a.amount), load_number: a.load, pay_kind: hit?.[2] ?? "other", item_id: itemId });
  }
  const deductions: SettlementCreatorDraft["deductions"] = [];
  const escrow: SettlementCreatorDraft["escrow"] = [];
  const advances: SettlementCreatorDraft["advances"] = [];
  for (const d of s.drv.ded) {
    const amount = -cents(d.amount);
    if (/Escrow/i.test(d.desc)) escrow.push({ description: "Driver-Escrow For Claims", amount_cents: amount, load_number: d.load });
    else if (/CASH ADVANCE/i.test(d.desc)) advances.push({ description: d.desc, amount_cents: amount, load_number: d.load, date: d.date });
    else {
      const name = /Admin fee/i.test(d.desc) ? "Driver Deduction-Admin Fee-Company Vehicle Fuel" : d.desc.split(" - ")[0]!.trim();
      const itemId = await itemIdByName(client, co, name);
      if (!itemId) refusals.push(`Deduction "${d.desc}": no Driver Deduction item maps it.`);
      deductions.push({ description: d.desc.split(" - ")[0]!.trim(), amount_cents: amount, load_number: d.load, item_id: itemId });
    }
  }

  // The company document's own totals: FUEL + COMPANY EXPENSES (which prints the Drv rows too) less the Drv rows (paid back
  // to the driver, never a company card) must equal the fuel lines + company expenses this draft sends — penny-exact.
  const printed = (k: string) => -cents((s.revenue?.[k] as { amount?: number } | undefined)?.amount ?? 0);
  const drvCents = s.expenses.filter((e) => e.reimb).reduce((n, e) => n + cents(e.amount), 0);
  const companyControlCents = printed("Fuel") + printed("Company Expenses") - drvCents;
  const sentCents = fuel.reduce((n, f) => n + Number(f.receipt_cents ?? 0), 0) + companyExpensesCents;
  if (s.revenue && sentCents !== companyControlCents) {
    refusals.push(`Company totals: fuel + company expenses sent ${sentCents / 100} ≠ printed FUEL + COMPANY EXPENSES less Drv ${companyControlCents / 100}.`);
  }

  const draft: SettlementCreatorDraft = {
    operating_company_id: co,
    settlement_no: no,
    driver_id: driverId,
    unit_id: unit?.id ?? null,
    trailer_equipment_number: s.stops[0]?.trailer ?? null,
    period_start: s.start,
    period_end: s.end,
    loads,
    customer_charges_cents: s.charges.reduce((n, c) => n + cents(c.amount), 0),
    fuel_purchases: fuel,
    confirmed_zero_fuel_purchases: fuel.length === 0,
    expenses,
    deductions,
    reimbursements,
    additional_pay,
    escrow,
    advances,
    pdf_driver_net_cents: cents(s.drv.total_due),
    pdf_company_expenses_cents: sentCents,
    pdf_company_net_revenue_cents: (s.revenue?.["Net Revenue"] as { amount?: number } | undefined)?.amount != null
      ? cents((s.revenue!["Net Revenue"] as { amount: number }).amount) : null,
    source_printed_date: s.end,
    seed_dispatched_loads: true,
    // The supersede step below has already reversed whatever held this number or these loads: the post adopts the loads.
    edit_void_repost: true,
  };
  return { draft, refusals, fuel_cards: fuelCards };
}

// ---------------------------------------------------------------------------------------------------------------------
// 0. Idempotency: the live settlement under this number already IS the signed document.
// ---------------------------------------------------------------------------------------------------------------------
export async function findAlreadyAsSigned(
  client: Q, co: string, s: SignedSettlement, driverId: string,
): Promise<{ settlement_id: string; display_id: string; net_cents: number } | null> {
  const id = signedIdentity(s);
  const live = (await client.query<{ id: string; display_id: string; driver_id: string; net_cents: string; loads: string[] | null }>(
    `SELECT s.id::text, s.display_id, s.driver_id::text, round(s.net_pay * 100)::text AS net_cents,
            (SELECT array_agg(DISTINCT l.load_number ORDER BY l.load_number) FROM driver_finance.settlement_lines sl
               JOIN mdata.loads l ON l.id = sl.load_id AND l.operating_company_id = s.operating_company_id WHERE sl.settlement_id = s.id AND ${notVoided("sl")}) AS loads
       FROM driver_finance.driver_settlements s
      WHERE s.operating_company_id = $1::uuid AND s.source_document_ref = $2 AND ${notVoided("s")} AND ${statusNotCancelled("s")}`,
    [co, id.settlement_no],
  )).rows;
  const hit = live.find((r) => r.driver_id === driverId && Number(r.net_cents) === id.net_cents
    && JSON.stringify([...(r.loads ?? [])].sort()) === JSON.stringify(id.load_numbers));
  return hit && live.length === 1 ? { settlement_id: hit.id, display_id: hit.display_id, net_cents: Number(hit.net_cents) } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Supersede: whatever the app holds for these loads / this number gives way to the signed document.
// ---------------------------------------------------------------------------------------------------------------------
export async function supersedeForSignedSettlement(
  client: Q, actorUserId: string, co: string, draft: SettlementCreatorDraft,
): Promise<SupersedeReport> {
  const report: SupersedeReport = { reversed_settlements: [], voided_trips: [], trimmed_trips: [], reassigned_loads: [], reused_fill_ids: [] };
  const no = draft.settlement_no.trim();
  const signedLoads = draft.loads.map((l) => l.load_number.trim());
  const reason = `Signed settlement ${no} posted as signed (ACCT-F11141): supersedes what the app held`;
  const reversedIds = new Set<string>();

  const reverse = async (row: { id: string; display_id: string; ref: string | null }, why: string) => {
    if (reversedIds.has(row.id)) return;
    reversedIds.add(row.id);
    const creatorPosted = (await client.query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM audit.audit_events WHERE event_class = 'driver_finance.settlement_creator.posted' AND payload->>'resource_id' = $1) AS ok`,
      [row.id],
    )).rows[0]?.ok === true;
    if (creatorPosted) {
      // A Creator post: the Creator's own Edit reverse (its expenses, advances, deductions, then the settlement).
      await voidPriorCreatorSettlementForEdit(client as never, actorUserId, co, row.id, row.ref ?? row.display_id);
    } else {
      // Any other post (pay-run close of a P-trip): its deductions through the deduction engine (a restored-to-pending
      // deduction would be withheld a second time), then the settlement engine reverse (equal-and-opposite JEs).
      const deds = (await client.query<{ id: string }>(
        `SELECT id::text FROM driver_finance.driver_settlement_deductions
          WHERE operating_company_id = $1::uuid AND applied_to_settlement_id = $2::uuid AND ${notVoided()}`,
        [co, row.id],
      )).rows;
      for (const d of deds) {
        await reverseDeductionForVoid(client as never, { operatingCompanyId: co, deductionId: d.id, reason: why, actor: { userId: actorUserId } });
      }
      await reverseSettlementForVoid(client as never, { operatingCompanyId: co, settlementId: row.id, reason: why, actor: { userId: actorUserId } });
    }
    report.reversed_settlements.push({ settlement_id: row.id, display_id: row.display_id, settlement_no: row.ref, reason: why });
  };

  // a. this number, held by a settlement that is not the signed one
  const sameNo = (await client.query<{ id: string; display_id: string; ref: string | null }>(
    `SELECT id::text, display_id, source_document_ref AS ref FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND source_document_ref = $2 AND ${notVoided()} AND ${statusNotCancelled()}`,
    [co, no],
  )).rows;
  for (const r of sameNo) await reverse(r, `number ${no} differs from the signed document`);

  // b. every live settlement holding a signed load
  const holders = (await client.query<{ id: string; display_id: string; ref: string | null; status: string; posted: boolean; load_numbers: string[]; all_loads: string[] }>(
    `SELECT s.id::text, s.display_id, s.source_document_ref AS ref, s.status::text,
            (s.posted_at IS NOT NULL OR EXISTS (SELECT 1 FROM driver_finance.payrun_gl_runs g WHERE g.settlement_id = s.id AND g.status = 'posted')) AS posted,
            array_agg(DISTINCT l.load_number) FILTER (WHERE l.load_number = ANY($2::text[])) AS load_numbers,
            (SELECT array_agg(DISTINCT l2.load_number) FROM driver_finance.settlement_lines sl2 JOIN mdata.loads l2 ON l2.id = sl2.load_id AND l2.operating_company_id = s.operating_company_id
              WHERE sl2.settlement_id = s.id AND ${notVoided("sl2")} AND sl2.is_active) AS all_loads
       FROM driver_finance.driver_settlements s
       JOIN driver_finance.settlement_lines sl ON sl.settlement_id = s.id AND ${notVoided("sl")} AND sl.is_active
       JOIN mdata.loads l ON l.id = sl.load_id AND l.operating_company_id = s.operating_company_id
      WHERE s.operating_company_id = $1::uuid AND ${notVoided("s")} AND ${statusNotCancelled("s")} AND l.load_number = ANY($2::text[])
      GROUP BY s.id`,
    [co, signedLoads],
  )).rows;
  for (const h of holders) {
    if (reversedIds.has(h.id)) continue;
    const isOpenTrip = h.status === "open" && !h.posted && !h.ref;
    if (!isOpenTrip) {
      await reverse({ id: h.id, display_id: h.display_id, ref: h.ref }, `holds signed load(s) ${h.load_numbers.join(", ")} under ${h.ref ? `number ${h.ref}` : h.display_id}`);
      continue;
    }
    const others = (h.all_loads ?? []).filter((n) => !signedLoads.includes(n));
    if (others.length === 0) {
      await reverseSettlementForVoid(client as never, { operatingCompanyId: co, settlementId: h.id, reason, actor: { userId: actorUserId } });
      reversedIds.add(h.id);
      report.voided_trips.push({ settlement_id: h.id, display_id: h.display_id });
      continue;
    }
    // The trip keeps the loads the document does not pay; the signed loads' lines, bills and reimbursements leave it
    // (the void cascade's own rules, scoped to these loads).
    const lineIds = (await client.query<{ id: string }>(
      `UPDATE driver_finance.settlement_lines sl
          SET is_active = false, voided_at = COALESCE(sl.voided_at, now()), void_reason = COALESCE(sl.void_reason, $3),
              voided_by_user_id = COALESCE(sl.voided_by_user_id, $4::uuid), updated_at = now()
        WHERE sl.settlement_id = $1::uuid AND ${notVoided("sl")}
          AND sl.load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = $2::uuid AND load_number = ANY($5::text[]))
        RETURNING sl.id::text`,
      [h.id, co, reason, actorUserId, h.load_numbers],
    )).rows;
    await client.query(
      `UPDATE driver_finance.driver_bills b SET settled_in_settlement_id = NULL, updated_at = now()
        WHERE b.operating_company_id = $1::uuid AND b.settled_in_settlement_id = $2::uuid AND b.status = 'open'
          AND b.load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = ANY($3::text[]))`,
      [co, h.id, h.load_numbers],
    );
    await client.query(
      `UPDATE driver_finance.driver_reimbursements r SET applied_to_settlement_id = NULL, settlement_line_id = NULL,
              status = CASE WHEN r.status = 'settled' THEN 'pending' ELSE r.status END, updated_at = now()
        WHERE r.operating_company_id = $1::uuid AND r.applied_to_settlement_id = $2::uuid AND ${notVoided("r")} AND r.status <> 'paid'
          AND r.load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = ANY($3::text[]))`,
      [co, h.id, h.load_numbers],
    );
    await client.query(
      `UPDATE mdata.loads SET presettlement_link_id = NULL, updated_at = now()
        WHERE operating_company_id = $1::uuid AND presettlement_link_id = $2::uuid AND load_number = ANY($3::text[])`,
      [co, h.id, h.load_numbers],
    );
    await client.query(
      `UPDATE driver_finance.driver_settlements SET first_load_id = NULL, last_load_id = NULL, updated_at = now()
        WHERE id = $1::uuid AND (first_load_id IN (SELECT id FROM mdata.loads WHERE load_number = ANY($2::text[]) AND operating_company_id = $3::uuid)
           OR last_load_id IN (SELECT id FROM mdata.loads WHERE load_number = ANY($2::text[]) AND operating_company_id = $3::uuid))`,
      [h.id, h.load_numbers, co],
    );
    await recomputeSettlementHeader(client as never, h.id, co);
    report.trimmed_trips.push({ settlement_id: h.id, display_id: h.display_id, load_numbers: h.load_numbers, lines_voided: lineIds.length });
  }

  // A load still pointing at a dead / other trip is free for this post (the Creator relinks it).
  await client.query(
    `UPDATE mdata.loads l SET presettlement_link_id = NULL, updated_at = now()
      WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) AND l.presettlement_link_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM driver_finance.driver_settlements s WHERE s.id = l.presettlement_link_id AND s.operating_company_id = l.operating_company_id AND NOT (${notVoided("s")} AND ${statusNotCancelled("s")}))`,
    [co, signedLoads],
  );

  // The document's driver drives its loads (the Creator's own reassign rule, run before adoption checks the driver).
  const moved = (await client.query<{ load_number: string; from_driver_id: string | null }>(
    `UPDATE mdata.loads l SET assigned_primary_driver_id = $3::uuid, assigned_unit_id = COALESCE($4::uuid, l.assigned_unit_id), updated_at = now()
       FROM (SELECT id, assigned_primary_driver_id AS from_driver_id FROM mdata.loads
              WHERE operating_company_id = $1::uuid AND load_number = ANY($2::text[]) AND soft_deleted_at IS NULL
                AND assigned_primary_driver_id IS DISTINCT FROM $3::uuid) prior
      WHERE l.id = prior.id
      RETURNING l.load_number, prior.from_driver_id::text AS from_driver_id`,
    [co, signedLoads, draft.driver_id, draft.unit_id ?? null],
  )).rows;
  report.reassigned_loads.push(...moved);

  // c. fills a reversed settlement left live on these loads (no live expense document): re-used by the post.
  report.reused_fill_ids = (await client.query<{ id: string }>(
    `SELECT f.id::text FROM fuel.fuel_transactions f
       JOIN mdata.loads l ON l.id = f.load_id AND l.operating_company_id = f.operating_company_id
      WHERE f.operating_company_id = $1::uuid AND ${notVoided("f")} AND l.load_number = ANY($2::text[])
        -- a Relay fill's rows are adopted by the Creator's Relay path (by the fill), never re-posted as a card fill
        AND f.relay_fuel_transaction_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.source_fuel_transaction_id = f.id AND ${notVoided("e")})`,
    [co, signedLoads],
  )).rows.map((r) => r.id);

  await appendCrudAudit(client as never, actorUserId, "driver_finance.settlement_creator.signed_supersede", {
    resource_type: "driver_finance.driver_settlements", operating_company_id: co, settlement_no: no,
    load_numbers: signedLoads, ...report,
  }, "warning", AUDIT_TAG);
  return report;
}

// ---------------------------------------------------------------------------------------------------------------------
// 1b. The fills the signed document prints: their expenses' loads are confirmed by the closer posting it (OWNER RULING
//     443.288 — "the dispatcher or closer must confirm them"), on the load the document prints them on, through THE
//     confirm / change engine (confirmExpenseLoadsInClientTx: a receipt on another load is carried by the receipt carry).
//     Runs after the loads are booked, before the close. A proposed expense the document does NOT print stays proposed and
//     the close refuses it by name.
// ---------------------------------------------------------------------------------------------------------------------
export async function confirmSignedFillLoads(
  client: Q, actorUserId: string, co: string, draft: SettlementCreatorDraft,
): Promise<Array<{ expense_id: string; load_number: string; moved: boolean }>> {
  const items: Array<{ expenseId: string; loadId: string; load_number: string; moved: boolean }> = [];
  const seen = new Set<string>();
  const signedLoadIds = new Map((await client.query<{ id: string; load_number: string }>(
    `SELECT id::text, load_number FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = ANY($2::text[]) AND soft_deleted_at IS NULL`,
    [co, draft.loads.map((l) => l.load_number.trim())],
  )).rows.map((r) => [r.id, r.load_number]));
  for (const f of draft.fuel_purchases ?? []) {
    const ln = f.load_number?.trim() || null;
    const printedLoadId = ln ? [...signedLoadIds].find(([, n]) => n === ln)?.[0] ?? null : null;
    if (ln && !printedLoadId) continue;
    const r = await findReceivedFill(client, co, {
      fuel_types: [f.fuel_type ?? "diesel"], date: f.date, amount_cents: Math.round(Number(f.receipt_cents ?? 0)),
      gallons: f.gallons ?? null, unit_id: draft.unit_id ?? null,
    });
    // none, or ambiguous: the Creator's own adoption rule decides (and refuses by name)
    if (!r || !r.expense_id) continue;
    // A line the document prints with no load (a DEF line off any fuel ticket) is confirmed on the signed load it sits on.
    const target = printedLoadId ?? (r.load_id && signedLoadIds.has(r.load_id) ? r.load_id : null);
    if (!target) continue;
    const load = { id: target };
    const lnum = signedLoadIds.get(target)!;
    if (r.on_settlement || seen.has(r.expense_id)) continue;
    // Only a machine's proposal is confirmed (or carried to the printed load); a person-confirmed load is never moved
    // (OWNER RULING 443.288) — the Creator refuses that fill by name instead.
    if (r.confirmation !== "proposed") continue;
    seen.add(r.expense_id);
    items.push({ expenseId: r.expense_id, loadId: load.id, load_number: lnum, moved: r.load_id !== load.id });
  }
  if (!items.length) return [];
  const { confirmExpenseLoadsInClientTx } = await import("../accounting/expense-load-confirmation.service.js");
  await confirmExpenseLoadsInClientTx(client as never, {
    operatingCompanyId: co, actorUserId,
    items: items.map((i) => ({ expenseId: i.expenseId, loadId: i.loadId })),
    reason: `Signed settlement ${draft.settlement_no} prints these fills on its loads — confirmed by the closer posting it (OWNER RULING 443.288)`,
  });
  return items.map((i) => ({ expense_id: i.expenseId, load_number: i.load_number, moved: i.moved }));
}

// ---------------------------------------------------------------------------------------------------------------------
// The engine call.
// ---------------------------------------------------------------------------------------------------------------------
export async function postSignedSettlementAsSigned(
  client: Q,
  actor: { uuid: string; role: string },
  input: { operating_company_id: string; signed: SignedSettlement },
): Promise<PostAsSignedResult> {
  const co = input.operating_company_id;
  const s = input.signed;
  const { draft, refusals, fuel_cards } = await signedToCreatorDraft(client, co, s);
  if (draft.driver_id) {
    const done = await findAlreadyAsSigned(client, co, s, draft.driver_id);
    if (done) return { status: "already_as_signed", settlement_no: draft.settlement_no, ...done };
  }
  if (refusals.length) {
    throw new SettlementCreatorError("signed_document_unresolved", `Signed settlement ${draft.settlement_no}: ${refusals.join(" · ")}`);
  }
  const superseded = await supersedeForSignedSettlement(client, actor.uuid, co, draft);
  const seeded = await ensureDispatchedLoadsForCreator(client as never, actor, draft);
  superseded.confirmed_fill_expenses = await confirmSignedFillLoads(client, actor.uuid, co, draft);
  if (s.confirm_expense_loads?.length) {
    const items: Array<{ expenseId: string; loadId: string | null }> = [];
    for (const c of s.confirm_expense_loads) {
      const row = (await client.query<{ id: string; load_id: string | null }>(
        `SELECT e.id::text, COALESCE((SELECT l.id::text FROM mdata.loads l WHERE l.operating_company_id = e.operating_company_id
                                        AND l.load_number = $3 AND l.soft_deleted_at IS NULL LIMIT 1), e.load_id::text) AS load_id
           FROM accounting.expenses e WHERE e.operating_company_id = $1::uuid AND e.expense_number = $2 AND ${notVoided("e")}`,
        [co, c.expense_number, c.load_number ?? null],
      )).rows;
      if (rows1(row) !== 1) throw new SettlementCreatorError("confirm_expense_unknown", `Signed settlement ${draft.settlement_no}: expense ${c.expense_number} is not exactly one live expense of this company.`);
      items.push({ expenseId: row[0]!.id, loadId: row[0]!.load_id });
    }
    const { confirmExpenseLoadsInClientTx } = await import("../accounting/expense-load-confirmation.service.js");
    await confirmExpenseLoadsInClientTx(client as never, {
      operatingCompanyId: co, actorUserId: actor.uuid, items,
      reason: `Signed settlement ${draft.settlement_no}: the owner confirmed these expenses' loads (OWNER RULING 443.288)`,
    });
    superseded.person_confirmed_expenses = s.confirm_expense_loads.map((c) => c.expense_number);
  }
  const result = await postSettlementCreatorInClientTx(client as never, actor.uuid, draft, { reuseFuelIds: superseded.reused_fill_ids });
  const totals = result.close_totals ?? null;
  const signedNet = cents(s.drv.total_due);
  const signedGross = cents(s.drv.salary) + cents(s.drv.add_total);
  const signedDeductions = -cents(s.drv.ded_total);
  const got = totals
    ? { net: totals.net_cents, gross: totals.gross_cents + totals.detention_pay_cents, reimb: totals.reimbursements_cents,
        ded: totals.deductions_cents + totals.escrow_cents + totals.advances_cents + totals.chargebacks_cents }
    : null;
  if (!got || got.net !== signedNet || got.gross !== signedGross || got.reimb !== cents(s.drv.reimb_total) || got.ded !== signedDeductions) {
    throw new SettlementCreatorError(
      "not_as_signed",
      `Signed settlement ${draft.settlement_no}: posted ${got ? `net ${got.net / 100} gross ${got.gross / 100} reimbursements ${got.reimb / 100} deductions ${got.ded / 100}` : "no close totals"}` +
        ` ≠ signed net ${signedNet / 100} gross ${signedGross / 100} reimbursements ${s.drv.reimb_total} deductions ${signedDeductions / 100}. Nothing posted.`,
    );
  }
  await appendCrudAudit(client as never, actor.uuid, "driver_finance.settlement_creator.posted_as_signed", {
    resource_type: "driver_finance.driver_settlements", resource_id: result.settlement_id, operating_company_id: co,
    settlement_no: draft.settlement_no, net_cents: got.net, gross_cents: got.gross, superseded, fuel_cards,
    created_load_numbers: seeded.created_load_numbers,
  }, "info", AUDIT_TAG);
  return {
    status: "posted", settlement_no: draft.settlement_no, settlement_id: result.settlement_id, display_id: result.display_id,
    net_cents: got.net, gross_cents: got.gross, superseded, fuel_cards, created_load_numbers: seeded.created_load_numbers, result,
    after_commit: seeded.afterCommit, stop_stamps: seeded.stop_stamps,
  };
}
