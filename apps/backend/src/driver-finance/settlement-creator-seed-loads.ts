/**
 * R-186.1 — seed not-yet-delivered loads through bookLoad (app path), never ops SQL.
 * Automatic Owner override for medical/HOS/CDL with the owner-mandated reason.
 */
import { bookLoad, type BookLoadInput } from "../dispatch/book-load.service.js";
import type { SettlementCreatorDraft, SettlementCreatorLoadBlock } from "./settlement-creator.types.js";
import { isAuthorizedZeroRevenueLoad } from "./settlement-creator-zero-revenue.js";

export const SETTLEMENT_CREATOR_QUAL_OVERRIDE_REASON =
  "entered from the AlwaysTrack settlement / load history (Settlement Creator)";

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

async function resolveCustomerId(
  client: DbClient,
  opco: string,
  load: SettlementCreatorLoadBlock,
): Promise<string> {
  if (load.customer_id) return load.customer_id;
  if (load.customer_name?.trim()) {
    const byName = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.customers
        WHERE operating_company_id = $1::uuid
          AND lower(trim(customer_name)) = lower(trim($2))
          AND COALESCE(is_sample_data, false) IS NOT TRUE
          AND deactivated_at IS NULL
        LIMIT 1`,
      [opco, load.customer_name.trim()],
    );
    if (byName.rows[0]) return byName.rows[0].id;
  }
  // Fall back to any active USMCA customer so Book Load can proceed (owner seeds from AT history).
  const any = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.customers
      WHERE operating_company_id = $1::uuid
        AND COALESCE(is_sample_data, false) IS NOT TRUE
        AND deactivated_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1`,
    [opco],
  );
  if (!any.rows[0]) {
    throw new SettlementCreatorSeedError("customer_required", `Load ${load.load_number}: no USMCA customer to book against.`);
  }
  return any.rows[0].id;
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
function buildStops(load: SettlementCreatorLoadBlock): BookLoadInput["stops"] {
  const pickupAt = load.pickup_date
    ? `${load.pickup_date}T12:00:00.000Z`
    : new Date().toISOString();
  const deliveryAt = load.delivery_date
    ? `${load.delivery_date}T18:00:00.000Z`
    : pickupAt;

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
      address_line1: load.pickup_address?.trim() || undefined,
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
      address_line1: load.delivery_address?.trim() || undefined,
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
      ? Math.round(load.line_haul_rate_cents * Number(load.loaded_miles))
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
 * Book every missing load via bookLoad (same engine as Dispatch Book Load).
 * Runs OUTSIDE the settlement Creator transaction (bookLoad owns its own withCurrentUser tx).
 */
export async function ensureDispatchedLoadsForCreator(
  client: DbClient,
  actor: { uuid: string; role: string },
  draft: SettlementCreatorDraft,
): Promise<{ created_load_numbers: string[] }> {
  const created: string[] = [];
  const seed = draft.seed_dispatched_loads !== false; // default ON for R-186.1 critical path

  const chargeCatalog = (
    await client.query(
      `SELECT id::text, code, display_name FROM catalogs.additional_charges
        WHERE operating_company_id = $1::uuid AND is_active = true`,
      [draft.operating_company_id],
    )
  ).rows as CatalogCharge[];
  for (const load of draft.loads) {
    const existing = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND load_number = $2
          AND soft_deleted_at IS NULL
        LIMIT 1`,
      [draft.operating_company_id, load.load_number.trim()],
    );
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
    const tourId =
      tripType === "SB" || tripType === "TR"
        ? await resolveTourIdForSb(client, draft.operating_company_id, load.join_outbound_load_number)
        : null;

    const notDelivered = load.not_yet_delivered !== false && !load.delivery_date;

    const input: BookLoadInput = {
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
      assigned_trailer_unit_id: draft.trailer_id ?? undefined,
      miles_practical: load.loaded_miles ?? load.line_haul_miles ?? null,
      // Driver pay = short miles (company practical stays on miles_practical). Fall back to loaded when short omitted.
      miles_shortest: load.miles_shortest ?? load.loaded_miles ?? load.line_haul_miles ?? null,
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
      stops: buildStops(load),
      notes: `Settlement Creator R-186.1 seed · load ${load.load_number}`,
    };

    const result = await bookLoad(input);
    if (result.kind !== "ok") {
      throw new SettlementCreatorSeedError(
        "book_load_failed",
        `Load ${load.load_number}: bookLoad failed — ${JSON.stringify(result.payload)}`,
      );
    }
    created.push(load.load_number.trim());
  }

  return { created_load_numbers: created };
}
