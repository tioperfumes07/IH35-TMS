/**
 * R-186.1 — seed not-yet-delivered loads through bookLoad (app path), never ops SQL.
 * Automatic Owner override for medical/HOS/CDL with the owner-mandated reason.
 */
import { bookLoad, type BookLoadInput } from "../dispatch/book-load.service.js";
import type { SettlementCreatorDraft, SettlementCreatorLoadBlock } from "./settlement-creator.types.js";

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

function buildStops(load: SettlementCreatorLoadBlock): BookLoadInput["stops"] {
  const pickupAt = load.pickup_date
    ? `${load.pickup_date}T12:00:00.000Z`
    : new Date().toISOString();
  const deliveryAt = load.delivery_date
    ? `${load.delivery_date}T18:00:00.000Z`
    : pickupAt;
  return [
    {
      sequence_number: 1,
      stop_type: "pickup",
      city: load.pickup_city?.trim() || "Laredo",
      state: "TX",
      scheduled_arrival_at: pickupAt,
    },
    {
      sequence_number: 2,
      stop_type: "delivery",
      city: load.delivery_city?.trim() || "Pending",
      state: "TX",
      scheduled_arrival_at: deliveryAt,
    },
  ];
}

function buildCharges(load: SettlementCreatorLoadBlock): Array<{ code: string; description?: string; amount_cents: number }> {
  const amount =
    load.line_haul_amount_cents ??
    (load.line_haul_rate_cents != null && load.loaded_miles != null
      ? Math.round(load.line_haul_rate_cents * Number(load.loaded_miles))
      : 0);
  return [
    {
      code: "LH",
      description: amount > 0 ? "Line haul" : "Line haul (seeded — rate pending)",
      amount_cents: Math.max(0, amount),
    },
  ];
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

  for (const load of draft.loads) {
    const existing = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND load_number = $2
          AND soft_deleted_at IS NULL
        LIMIT 1`,
      [draft.operating_company_id, load.load_number.trim()],
    );
    if (existing.rows[0]) continue;
    if (!seed) {
      throw new SettlementCreatorSeedError(
        "load_not_found",
        `Load ${load.load_number} not found in USMCA. Book it in Dispatch first, then type it here.`,
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
      requested_load_number: load.load_number.trim(),
      live_load_number: load.load_number.trim(),
      assigned_primary_driver_id: draft.driver_id,
      assigned_unit_id: draft.unit_id ?? undefined,
      assigned_trailer_unit_id: draft.trailer_id ?? undefined,
      miles_practical: load.loaded_miles ?? load.line_haul_miles ?? null,
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
      charges: buildCharges(load),
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
