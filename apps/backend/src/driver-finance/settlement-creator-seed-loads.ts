import { randomUUID } from "node:crypto";
import { looksLikeStreet } from "../telematics/stops-geocode-backfill.service.js";
/**
 * R-186.1 — seed not-yet-delivered loads through bookLoad (app path), never ops SQL.
 * Automatic Owner override for medical/HOS/CDL with the owner-mandated reason.
 */
import { bookLoadOnClient, type BookLoadInput } from "../dispatch/book-load.service.js";
import type { SettlementCreatorDraft, SettlementCreatorLoadBlock } from "./settlement-creator.types.js";
import { isAuthorizedZeroRevenueLoad } from "./settlement-creator-zero-revenue.js";
import { milesTimesRateCents } from "./deadhead-rule.js";
import { creatorLoadMiles } from "./settlement-creator-empty-pay.js";
import { signedRateOverride } from "./settlement-creator-signed-rate.js";
import { deliverLoadThroughDispatch, localDayStartIso, stampStopsFromTracking, type StopStamp } from "./settlement-creator-deliver.js";
import { CREATOR_TRAILER_REQUIRED_MESSAGE, creatorLoadTrailerEquipmentId, creatorTrailerChoice } from "./creator-trailer-choice.js";

export const SETTLEMENT_CREATOR_QUAL_OVERRIDE_REASON =
  "entered from the AlwaysTrack settlement / load history (Settlement Creator)";

// Lead 443.53 #7 (owner): weekly salary = LOCAL driver. Loads booked before the rename keep "Salaried (owner ruling)…";
// every reader (isSalariedZeroRateOverride, feed gate, close, A/P chain) matches both prefixes.
export const SALARIED_OVERRIDE_REASON = "Local driver — weekly salary (owner ruling): salary on the settlement, no per-load driver pay";

/** LEAD 443.192 — shared by the preview (creatorPreflightRefusals) and the post, so both name the same fix. */
export const CREATOR_SHORT_MILES_REQUIRED_MESSAGE =
  "the signed settlement's SHORT (pay) miles are required — type them in Short mi (pay). Per-mile drivers are always paid " +
  "short miles, never practical (owner law 443.192).";
export const CREATOR_PRACTICAL_SEPARATE_MESSAGE =
  "practical miles are required to book the load (E_MILES_PRACTICAL_REQUIRED) — a separate figure in Loaded mi (co) " +
  "(or Historical / Google), never a copy of the short pay miles (owner law 443.192).";

export class SettlementCreatorSeedError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SettlementCreatorSeedError";
    this.code = code;
  }
}

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

/**
 * 443.110 G3 — the customer a Creator load is booked against is the one the document NAMES (or the one picked by id),
 * never a guess. The former fallback booked an unmatched name against the company's OLDEST active customer, so a typo
 * silently put the freight — and its A/R — on the wrong customer. Unmatched -> customer_unmatched naming the document's
 * customer; the preview lists it (creatorPreflightRefusals) so the owner picks or creates the customer first.
 */
export async function findCreatorCustomer(
  client: DbClient,
  opco: string,
  load: Pick<SettlementCreatorLoadBlock, "load_number" | "customer_id" | "customer_name">,
): Promise<{ id: string } | { code: "customer_unmatched" | "customer_required"; message: string }> {
  if (load.customer_id) {
    const byId = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.customers
        WHERE id = $2::uuid AND operating_company_id = $1::uuid AND deactivated_at IS NULL
          AND COALESCE(is_sample_data, false) IS NOT TRUE`,
      [opco, load.customer_id],
    );
    if (byId.rows[0]) return { id: byId.rows[0].id };
    return { code: "customer_unmatched", message: `Load ${load.load_number}: customer ${load.customer_id} is not an active customer of this company.` };
  }
  const name = load.customer_name?.trim();
  if (!name) {
    return { code: "customer_required", message: `Load ${load.load_number}: the document's customer is required — pick or create it.` };
  }
  const byName = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.customers
      WHERE operating_company_id = $1::uuid
        AND lower(trim(customer_name)) = lower(trim($2))
        AND COALESCE(is_sample_data, false) IS NOT TRUE
        AND deactivated_at IS NULL
      LIMIT 1`,
    [opco, name],
  );
  if (byName.rows[0]) return { id: byName.rows[0].id };
  return {
    code: "customer_unmatched",
    message: `Load ${load.load_number}: customer "${name}" on the document is not a customer of this company — pick the customer or create it first.`,
  };
}

async function resolveCustomerId(
  client: DbClient,
  opco: string,
  load: SettlementCreatorLoadBlock,
): Promise<string> {
  const found = await findCreatorCustomer(client, opco, load);
  if ("id" in found) return found.id;
  throw new SettlementCreatorSeedError(found.code, found.message);
}

async function resolveTourIdForSb(
  client: DbClient,
  opco: string,
  outboundLoadNumber: string | null | undefined,
): Promise<string | null> {
  if (!outboundLoadNumber?.trim()) return null;
  const res = await client.query<{ tour_id: string | null }>(
    `SELECT tour_id::text
       FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND load_number = $2
        AND soft_deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [opco, outboundLoadNumber.trim()],
  );
  return res.rows[0]?.tour_id ?? null;
}

/**
 * SETL-F438 — A STOP CARRIES THE STATE THE TRUCK ACTUALLY WENT TO.
 *
 * This function used to write `state: "TX"` as a CONSTANT on BOTH stops and default the delivery
 * city to the literal "Pending". Every load the Settlement Creator seeded therefore landed in
 * mdata.load_stops as TX -> TX no matter where the load ran, and that constant is read downstream
 * by IFTA, lane profitability and the invoice ship-to. A wrong value written confidently is worse
 * than a missing one, so the state is now REQUIRED input and there is no default to fall back to.
 *
 * Nothing is guessed and nothing is defaulted: a load whose origin or destination the operator has
 * not entered is refused by name, and the operator supplies it.
 */
/** A house-numbered value is a street; anything else in the entry file's address field is a facility name. */
function streetOrFacility(raw: string | null | undefined): { address_line1?: string; facility_name?: string } {
  const v = raw?.trim();
  if (!v) return {};
  return looksLikeStreet(v) ? { address_line1: v } : { facility_name: v };
}

const coord = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : undefined);

/**
 * CC-3 2026-10-11 (CC-2 finding: 10 multi-stop loads were booked as pickup + delivery only, so their legs, miles and lane
 * were wrong): when the draft lists its stops, every one is booked in that order. The first must be a pickup and the last
 * a delivery; every stop needs its real city and state (SETL-F438 — never defaulted).
 */
function buildOrderedStops(load: SettlementCreatorLoadBlock, stops: NonNullable<SettlementCreatorLoadBlock["stops"]>): BookLoadInput["stops"] {
  if (stops[0].stop_type !== "pickup" || stops[stops.length - 1].stop_type !== "delivery") {
    throw new SettlementCreatorSeedError(
      "stops_order_invalid",
      `Load ${load.load_number}: the stop list must start with a pickup and end with a delivery.`,
    );
  }
  let lastAt: string | null = null;
  return stops.map((st, i) => {
    const city = st.city?.trim();
    const state = st.state?.trim().toUpperCase();
    if (!city || !state) {
      throw new SettlementCreatorSeedError("stop_city_state_required", `Load ${load.load_number}: stop ${i + 1} city AND state are required.`);
    }
    // A stop with no date inherits the previous stop's day (the settlement gives dates, never clock times — ROUND 443.16).
    const at = st.date ? localDayStartIso(st.date) : lastAt ?? (load.pickup_date ? localDayStartIso(load.pickup_date) : new Date().toISOString());
    lastAt = at;
    return {
      sequence_number: i + 1,
      stop_type: st.stop_type,
      ...streetOrFacility(st.address ?? null),
      city,
      state,
      postal_code: st.zip?.trim() || undefined,
      latitude: coord(st.lat),
      longitude: coord(st.lng),
      scheduled_arrival_at: at,
    };
  });
}

function buildStops(load: SettlementCreatorLoadBlock): BookLoadInput["stops"] {
  if (load.stops && load.stops.length >= 2) return buildOrderedStops(load, load.stops);
  // ROUND 443.16 — the settlement gives dates, not clock times: appointments are the day's start in USMCA's timezone,
  // never an invented hour (the measured times come from the truck's stop events — stampStopsFromTracking).
  const pickupAt = load.pickup_date ? localDayStartIso(load.pickup_date) : new Date().toISOString();
  const deliveryAt = load.delivery_date ? localDayStartIso(load.delivery_date) : pickupAt;

  const pickupCity = load.pickup_city?.trim();
  const pickupState = load.pickup_state?.trim().toUpperCase();
  const deliveryCity = load.delivery_city?.trim();
  const deliveryState = load.delivery_state?.trim().toUpperCase();

  if (!pickupCity || !pickupState) {
    throw new SettlementCreatorSeedError(
      "stop_city_state_required",
      `Load ${load.load_number}: pickup city AND state are required. The seeder no longer defaults ` +
        `them to Laredo, TX — a stop written with a state the truck never visited corrupts IFTA, ` +
        `lane profitability and the invoice ship-to.`,
    );
  }
  if (!deliveryCity || !deliveryState) {
    throw new SettlementCreatorSeedError(
      "stop_city_state_required",
      `Load ${load.load_number}: delivery city AND state are required. The seeder no longer writes ` +
        `the literal "Pending" / "TX" for a destination it was not told.`,
    );
  }

  const pickupLat = load.pickup_lat;
  const pickupLng = load.pickup_lng;
  const deliveryLat = load.delivery_lat;
  const deliveryLng = load.delivery_lng;

  return [
    {
      sequence_number: 1,
      stop_type: "pickup",
      // 443.38: the entry files carry either a street ("514 Nafta Blvd") or a facility name ("Aldi Salisbury") here —
      // a street goes to address_line1, a name to facility_name; the booking resolver then finds the Samsara address.
      ...streetOrFacility(load.pickup_address),
      city: pickupCity,
      state: pickupState,
      postal_code: load.pickup_zip?.trim() || undefined,
      latitude:
        typeof pickupLat === "number" && Number.isFinite(pickupLat) && pickupLat !== 0
          ? pickupLat
          : undefined,
      longitude:
        typeof pickupLng === "number" && Number.isFinite(pickupLng) && pickupLng !== 0
          ? pickupLng
          : undefined,
      scheduled_arrival_at: pickupAt,
    },
    {
      sequence_number: 2,
      stop_type: "delivery",
      // 443.38: the entry files carry either a street ("514 Nafta Blvd") or a facility name ("Aldi Salisbury") here —
      // a street goes to address_line1, a name to facility_name; the booking resolver then finds the Samsara address.
      ...streetOrFacility(load.delivery_address),
      city: deliveryCity,
      state: deliveryState,
      postal_code: load.delivery_zip?.trim() || undefined,
      latitude:
        typeof deliveryLat === "number" && Number.isFinite(deliveryLat) && deliveryLat !== 0
          ? deliveryLat
          : undefined,
      longitude:
        typeof deliveryLng === "number" && Number.isFinite(deliveryLng) && deliveryLng !== 0
          ? deliveryLng
          : undefined,
      scheduled_arrival_at: deliveryAt,
    },
  ];
}

type CatalogCharge = { id: string; code: string; display_name: string };
type SeedCharge = { code: string; description?: string; amount_cents: number; additional_charge_id?: string };

/**
 * bookLoad (P44, #5931) accepts only the system codes "linehaul" / "fuel_surcharge" without a catalog id; every other
 * charge must name its catalogs.additional_charges row. The seeder sent "LH" and "ACC", so every Creator post died
 * in bookLoad with additional_charge_id_required (measured on a prod fork, ROUND 443.3). Line haul is "linehaul";
 * each accessorial resolves to its catalog charge by code or display name — no match refuses, never a MISC default.
 */
export function buildCharges(load: SettlementCreatorLoadBlock, catalog: CatalogCharge[]): SeedCharge[] {
  // ROUND 443.3 b — a Transportation load's customer revenue is $0 in USMCA; never fall back to a computed rate.
  if (isAuthorizedZeroRevenueLoad(load)) {
    return [{ code: "linehaul", description: "Line haul — Transportation load, $0 in USMCA", amount_cents: 0 }];
  }
  const amount =
    load.line_haul_amount_cents ??
    (load.line_haul_rate_cents != null && load.loaded_miles != null
      ? milesTimesRateCents(Number(load.loaded_miles), load.line_haul_rate_cents) // ROUND 443.33: the one money rule
      : 0);
  const charges: SeedCharge[] = [
    {
      code: "linehaul",
      description: amount > 0 ? "Line haul" : "Line haul (seeded — rate pending)",
      amount_cents: Math.max(0, amount),
    },
  ];
  for (const acc of load.accessorials ?? []) {
    if (acc.amount_cents <= 0) continue;
    const key = acc.item_name.trim().toLowerCase();
    const hit = catalog.find((c) => c.code.toLowerCase() === key || c.display_name.trim().toLowerCase() === key);
    if (!hit) {
      throw new SettlementCreatorSeedError(
        "accessorial_charge_unresolved",
        `Load ${load.load_number}: accessorial "${acc.item_name}" is not an additional charge in the catalog (${catalog.map((c) => c.display_name).join(", ") || "none"}).`,
      );
    }
    charges.push({
      code: hit.code,
      description: acc.description?.trim() || acc.item_name,
      amount_cents: acc.amount_cents,
      additional_charge_id: hit.id,
    });
  }
  return charges;
}

/**
 * Book every missing load via bookLoadOnClient (same checks and engine as Dispatch Book Load) on the CALLER's
 * transaction — ROUND 443.7: the loads, the settlement and every document are one transaction, so a refused post
 * leaves zero rows and a retry of the same draft succeeds. Returns the after-book extras (geofences, geocode backfill,
 * reference miles) for the caller to run ONLY after its COMMIT succeeds.
 */
/** Option 1 (5769 repair) — the load belongs to the Creator settlement this Edit replaces: same AlwaysTrack number, same
 *  driver, the load on that settlement's lines or driver bills. */
export async function isPriorCreatorSettlementLoad(client: DbClient, draft: SettlementCreatorDraft, loadId: string): Promise<boolean> {
  const no = String(draft.settlement_no ?? "").trim();
  if (!no) return false;
  const r = await client.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM driver_finance.driver_settlements s
        WHERE s.operating_company_id = $1::uuid AND s.source_document_ref = $2 AND s.driver_id = $3::uuid
          AND (EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = s.id AND sl.load_id = $4::uuid)
            OR EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_bills g WHERE g.settlement_id = s.id AND g.load_id = $4::uuid))
     ) AS ok`,
    [draft.operating_company_id, no, draft.driver_id, loadId],
  );
  return r.rows[0]?.ok === true;
}

/**
 * LEAD 443.167-R (owner-authorized 2026-10-16) — a load that already exists because the seed booked it (CC-1 443.145:
 * loads first, settlements after) is ADOPTED by the signed settlement that pays it, exactly like an Edit adopts its own
 * load: same load, never re-booked, its invoice kept. Only when ALL hold: the load is this settlement's driver's
 * (assigned_primary_driver_id), it is not voided / deleted, and no LIVE settlement other than the one this post replaces
 * (same AlwaysTrack number) carries a pay line on it — so a load already paid by another settlement is still refused.
 */
export async function isSeededLoadFreeForThisSettlement(client: DbClient, draft: SettlementCreatorDraft, loadId: string): Promise<boolean> {
  const no = String(draft.settlement_no ?? "").trim();
  const r = await client.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM mdata.loads l
        WHERE l.id = $2::uuid AND l.operating_company_id = $1::uuid
          AND l.assigned_primary_driver_id = $3::uuid
          AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM driver_finance.settlement_lines sl
              JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id AND s.operating_company_id = l.operating_company_id
             WHERE sl.load_id = l.id AND sl.voided_at IS NULL
               AND s.voided_at IS NULL AND s.status <> 'cancelled'
               AND COALESCE(s.source_document_ref, '') <> $4)
     ) AS ok`,
    [draft.operating_company_id, loadId, draft.driver_id, no],
  );
  return r.rows[0]?.ok === true;
}

export async function ensureDispatchedLoadsForCreator(
  client: DbClient,
  actor: { uuid: string; role: string },
  draft: SettlementCreatorDraft,
): Promise<{ created_load_numbers: string[]; afterCommit: Array<() => void>; stop_stamps: StopStamp[] }> {
  const created: string[] = [];
  const afterCommit: Array<() => void> = [];
  const stopStamps: StopStamp[] = [];
  // LEAD RULING ROUND 443.7 (Option A): the Creator owns the tour settlement's close for this whole transaction.
  await client.query(`SELECT set_config('app.settlement_creator_post', 'on', true)`);
  const seed = draft.seed_dispatched_loads !== false; // default ON for R-186.1 critical path

  const chargeCatalog = (
    await client.query(
      `SELECT id::text, code, display_name FROM catalogs.additional_charges
        WHERE operating_company_id = $1::uuid AND is_active = true`,
      [draft.operating_company_id],
    )
  ).rows as CatalogCharge[];
  // LEAD 443.109 — a load is never born without its trailer (the document decides; preview refuses trailer_required).
  // Resolved BEFORE any load is booked (443.110 G2): the printed number becomes the fleet trailer id, a customer trailer
  // or an explicit none, and the trailer TYPE follows it (Reefer / Dry Van / power-only) instead of book-load's DRY_VAN.
  const trailerChoice = seed && draft.loads.length ? await creatorTrailerChoice(client, draft) : null;
  let trailerTypeId: string | null = null;
  for (const load of draft.loads) {
    const existing = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND load_number = $2
          AND soft_deleted_at IS NULL
        LIMIT 1`,
      [draft.operating_company_id, load.load_number.trim()],
    );
    if (existing.rows[0] && draft.edit_void_repost && (await isPriorCreatorSettlementLoad(client, draft, existing.rows[0].id))) {
      // LEAD RULING 2026-10-11 (5769 repair, Option 1): Edit = void and repost ADOPTS the replaced settlement's own load —
      // same load number, same driver, on the Creator settlement with this AlwaysTrack number — never re-booked; its
      // sent invoice is kept. Any other existing load still refuses below.
      continue;
    }
    if (existing.rows[0] && (await isSeededLoadFreeForThisSettlement(client, draft, existing.rows[0].id))) {
      // LEAD 443.167-R — a seeded load this settlement pays: adopted, never re-booked (see isSeededLoadFreeForThisSettlement).
      // Complete this signed, same-draft leg before booking the next one on its truck. Restate pay
      // BEFORE delivery accrues its bill; unrelated active loads and unfinished legs remain untouched.
      if (!(load.not_yet_delivered !== false && !load.delivery_date)) {
        const loadId = existing.rows[0].id;
        const { restateCreatorDriverBillFromSignedLoad } = await import("./settlement-creator.service.js");
        await restateCreatorDriverBillFromSignedLoad(client, draft, load, loadId, actor.uuid);
        stopStamps.push(...await stampStopsFromTracking(client, loadId, draft.operating_company_id, { pickupDate: load.pickup_date, deliveryDate: load.delivery_date }));
        await deliverLoadThroughDispatch(client, actor.uuid, draft.operating_company_id, loadId, load.delivery_date);
      }
      continue;
    }
    if (existing.rows[0]) {
      // Owner 2026-09-26: Creator creates NEW loads only — never attach a prior load by typing
      // its number. Auto sequence + Edit override must land on a free number.
      throw new SettlementCreatorSeedError(
        "load_already_exists",
        `Load ${load.load_number} already exists. Settlement Creator only books NEW load numbers — use the next sequence (or Edit to a free number).`,
      );
    }
    if (!seed) {
      throw new SettlementCreatorSeedError(
        "load_not_found",
        `Load ${load.load_number} not found in USMCA. Book it in Dispatch first, then type it here.`,
      );
    }
    // LEAD 443.109 — this load is about to be born: it is never born without its trailer.
    if (!trailerChoice) throw new SettlementCreatorSeedError("trailer_required", `Load ${load.load_number}: ${CREATOR_TRAILER_REQUIRED_MESSAGE}`);
    // Resolve only for a genuinely NEW load. An Edit adopting its existing loads must not revalidate historical
    // equipment against today's catalog. Cache the shared document choice before the first booking.
    trailerTypeId ??= await creatorLoadTrailerEquipmentId(client, draft.operating_company_id, trailerChoice);

    // SETL-F438 — bookLoad() refuses a non-draft load with neither PO nor W/O
    // (customer_po_or_wo_number_required, ROUND 285.3.6). The Creator books with
    // save_mode 'book_dispatch', so without this the FIRST load always failed. Refuse by name here
    // rather than let the operator read an opaque book_load_failed payload.
    const poNumber = load.customer_po_number?.trim() || null;
    const woNumber = load.customer_wo_number?.trim() || null;
    if (!poNumber && !woNumber) {
      throw new SettlementCreatorSeedError(
        "customer_po_or_wo_number_required",
        `Load ${load.load_number}: the customer's PO number (or W/O number) is required at load ` +
          `creation — bookLoad refuses the load without one, and the Faro invoice join matches on it.`,
      );
    }

    const customerId = await resolveCustomerId(client, draft.operating_company_id, load);
    const tripType = load.trip_type ?? (load.join_outbound_load_number ? "SB" : "NB");
    // 5777 fork rehearsal (2026-10-11): an NB booked with no tour_id inherits the unit's previous tour, so the same
    // truck's next AlwaysTrack settlement was suggested INTO the prior, already-posted settlement as a REG-040
    // continuation and refused. One signed AlwaysTrack settlement is one tour: its NB starts a NEW tour; its TR / SB legs
    // join that tour through join_outbound_load_number.
    const tourId =
      tripType === "SB" || tripType === "TR"
        ? await resolveTourIdForSb(client, draft.operating_company_id, load.join_outbound_load_number)
        : tripType === "NB"
          ? randomUUID()
          : null;

    const notDelivered = load.not_yet_delivered !== false && !load.delivery_date;

    // ROUND 443.31 — the signed settlement's rate governs a historical load when today's card would pay differently
    // (GO-21 B5 reason-carrying override; the rate card is never edited).
    const card = (
      await client.query<{ basis_type: string; rate_per_mile_cents: number | null; rate_empty_per_mile_cents: number | null }>(
        `SELECT basis_type, rate_per_mile_cents::float8 AS rate_per_mile_cents, rate_empty_per_mile_cents::float8 AS rate_empty_per_mile_cents
           FROM driver_finance.driver_pay_rates
          WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid AND is_active AND effective_to IS NULL
          ORDER BY effective_from DESC LIMIT 1`,
        [draft.operating_company_id, draft.driver_id],
      )
    ).rows[0] ?? null;
    // Lead 443.36 — a salaried driver's load is booked with the 0-rate "Salaried" override (CC-2 #26276): no per-load
    // driver bill, the per-mile card is neither read nor ended.
    const payOverride = draft.salaried
      ? { driver_pay_rate_per_mile: 0, driver_pay_rate_override_reason: SALARIED_OVERRIDE_REASON }
      : signedRateOverride(draft.settlement_no, load, card);

    // LEAD 443.192 (owner law) — the signed settlement's miles are the SHORT (pay) miles: they go to miles_shortest, and only
    // there. Practical comes from its own figure. Neither is a copy of the other (creatorLoadMiles).
    const miles = creatorLoadMiles(load);
    if (miles.miles_shortest == null && !draft.salaried) {
      throw new SettlementCreatorSeedError("short_miles_required", `Load ${load.load_number}: ${CREATOR_SHORT_MILES_REQUIRED_MESSAGE}`);
    }
    if (miles.miles_practical == null) {
      throw new SettlementCreatorSeedError("practical_miles_required", `Load ${load.load_number}: ${CREATOR_PRACTICAL_SEPARATE_MESSAGE}`);
    }

    const input: BookLoadInput = {
      ...(payOverride ?? {}),
      requestingUserUuid: actor.uuid,
      requestingUserRole: actor.role,
      operating_company_id: draft.operating_company_id,
      customer_id: customerId,
      status: notDelivered ? "dispatched" : "assigned_not_dispatched",
      trip_type: tripType,
      tour_id: tourId ?? undefined,
      customer_po_number: poNumber ?? undefined,
      customer_wo_number: woNumber ?? undefined,
      requested_load_number: load.load_number.trim(),
      live_load_number: load.load_number.trim(),
      assigned_primary_driver_id: draft.driver_id,
      assigned_unit_id: draft.unit_id ?? undefined,
      assigned_trailer_unit_id: (trailerChoice?.kind === "company" ? trailerChoice.equipment_id : draft.trailer_id) ?? undefined,
      // LEAD 443.107 item 3 + 443.109: the document's trailer is the load's recorded choice at birth (fleet trailer,
      // customer / shipper trailer, or an explicit none) — creatorTrailerChoice decided it above, never invented.
      trailer_choice: trailerChoice,
      load_trailer_equipment_id: trailerTypeId ?? undefined,
      miles_practical: miles.miles_practical,
      // CC-2 finding 2026-10-11 (verify-mileage-g1-g5-live G4 on 5769's 13498 / 13508): miles carry their source. The
      // Creator's miles are typed from the signed settlement / AlwaysTrack record by the operator.
      mileage_source: (load.loaded_miles ?? load.line_haul_miles) != null ? "Operator entered" : undefined,
      // LEAD 443.192 — the document's pay miles = SHORT miles only: the figure the earnings line pays (creatorPayMiles).
      miles_shortest: miles.miles_shortest,
      // LEAD RULING 15:10Z #2 (supersedes RULING 443.86 #1 for the Creator): the load's deadhead = the signed document's empty
      // miles ONLY — never filled from the miles engine (fillLoadDeadhead is not called here), blank when the document has
      // none. Book Load's own Google estimate at a LIVE booking (fillDeadheadAtBooking, live_feed only) is unaffected.
      miles_deadhead: load.empty_miles ?? null,
      save_mode: "book_dispatch",
      addToOpenPresettlement: true,
      is_sample_data: false,
      // R-186.1 §3 — driver profiles not fed; automatic Owner override via engine path.
      override_reason: SETTLEMENT_CREATOR_QUAL_OVERRIDE_REASON,
      override_rules: [
        {
          rule_code: "DOT_QUALIFICATION",
          reason: SETTLEMENT_CREATOR_QUAL_OVERRIDE_REASON,
        },
      ],
      charges: buildCharges(load, chargeCatalog),
      // ROUND 443.3 b + CC-2 443.10 — the owner-authorized $0 Transportation load passes bookLoad's zero-dollar
      // dispatch gate (one exception row, reason owner_authorized_zero_revenue); every other load keeps the gate.
      authorizedZeroRevenue: isAuthorizedZeroRevenueLoad(load) || undefined,
      stops: buildStops(load),
      notes: `Settlement Creator R-186.1 seed · load ${load.load_number}`,
    };

    // 5780 fork rehearsal (2026-10-11): a Creator load already RAN (a signed AlwaysTrack settlement). Booking it as
    // live_feed judged it on the driver's CURRENT hours ("E_DRIVER_HOS_VIOLATION"); historical_backfill records the
    // two-case gates as exceptions instead of blocking (book-load FEED PARITY). Every input precheck still applies.
    const booked = await bookLoadOnClient(client as never, input, { source: "historical_backfill" });
    const result = booked.result;
    if (result.kind !== "ok") {
      throw new SettlementCreatorSeedError(
        "book_load_failed",
        `Load ${load.load_number}: bookLoad failed — ${JSON.stringify(result.payload)}`,
      );
    }
    afterCommit.push(booked.afterCommit);
    created.push(load.load_number.trim());
    // A delivered load is delivered NOW, before the next load of the tour is booked on the same truck (bookLoad refuses
    // a unit still active on an undelivered load — measured on a prod fork, ROUND 443.7).
    const delivered = !(load.not_yet_delivered !== false && !load.delivery_date);
    const bookedId = String((result as { row?: { id?: unknown } }).row?.id ?? "");
    if (delivered && bookedId) {
      stopStamps.push(...(await stampStopsFromTracking(client, bookedId, draft.operating_company_id, { pickupDate: load.pickup_date, deliveryDate: load.delivery_date })));
      await deliverLoadThroughDispatch(client, actor.uuid, draft.operating_company_id, bookedId, load.delivery_date);
    }
  }

  return { created_load_numbers: created, afterCommit, stop_stamps: stopStamps };
}
