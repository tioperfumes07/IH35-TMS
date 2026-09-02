/**
 * GO-23 owner ruling 2026-09-02: deadhead is a TRIP property, not a lane property. Reading
 * catalogs.lane_mileage.empty_miles into Book Load's miles_deadhead box put a LANE AVERAGE into
 * a driver's paycheck -- August ranged 0 to 598.7 miles on comparable lanes, wrong on nearly
 * every load. This is the replacement producer: for the unit being booked, find that SAME
 * unit's most recent DELIVERY stop before this new load's pickup -- across all three entities,
 * because a truck does not stop being the same truck when the load is booked under a different
 * company -- and compute road distance (haversineMiles, same approximation the deadhead
 * optimizer already uses -- no PC*MILER live) from that delivery point to this pickup.
 *
 * First load for a unit, or no locatable prior delivery -> return null with a reason. Never 0,
 * never a lane average, never a guess -- blank is an honest unknown; 0 is a false statement that
 * pays the driver nothing for real empty miles.
 *
 * Known historical trap (owner-named): some seats' deadhead has been booked on the load that
 * DELIVERED rather than the load that PICKED UP -- front/back attribution is inconsistent in
 * old data. This producer never reads any load's stored miles_deadhead; it only reads
 * mdata.load_stops delivery locations directly, so it cannot inherit that inconsistency.
 */
import { withLuciaBypass } from "../../auth/db.js";
import { haversineMiles, cityStateToLatLng } from "./optimizer.service.js";

export type ChainDeadheadInput = {
  unit_uuid: string;
  /** The new load's pickup point -- prefer real lat/lng; city/state is the fallback. */
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  pickup_city: string;
  pickup_state: string;
  /** Exclude any delivery at or after this timestamp (the load being booked has no ISO time yet
   *  in the wizard's happy path, so callers may omit this and get "most recent delivery ever"). */
  before_iso?: string | null;
};

export type ChainDeadheadResult =
  | {
      deadhead_miles: number;
      source: "chain";
      prior_load_number: string | null;
      prior_delivery_city: string;
      prior_delivery_state: string;
      prior_delivered_at: string | null;
    }
  | {
      deadhead_miles: null;
      source: "blank";
      reason: "no_prior_delivery_for_unit" | "prior_delivery_not_locatable" | "pickup_not_locatable";
    };

function resolvePoint(
  lat: number | null | undefined,
  lng: number | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined
): { lat: number; lng: number } | null {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  if (city && state) return cityStateToLatLng(city, state);
  return null;
}

export async function computeChainDeadheadMiles(
  actorUserId: string,
  input: ChainDeadheadInput
): Promise<ChainDeadheadResult> {
  const pickupPoint = resolvePoint(input.pickup_latitude, input.pickup_longitude, input.pickup_city, input.pickup_state);
  if (!pickupPoint) {
    return { deadhead_miles: null, source: "blank", reason: "pickup_not_locatable" };
  }

  return withLuciaBypass(async (client) => {
    // No operating_company_id filter, deliberately -- the unit's delivery history lives across
    // TRANSP/TRK/USMCA and the chain does not reset at an entity boundary. bypass_rls scopes
    // visibility to exactly this unit_uuid's own load history, nothing broader.
    const result = await client.query<{
      load_number: string | null;
      city: string | null;
      state: string | null;
      latitude: number | null;
      longitude: number | null;
      delivered_at: string | null;
    }>(
      `
        SELECT
          l.load_number,
          s.city,
          s.state,
          s.latitude::float8 AS latitude,
          s.longitude::float8 AS longitude,
          COALESCE(s.actual_arrival_at, s.actual_departure_at, s.scheduled_arrival_at) AS delivered_at
        FROM mdata.loads l
        JOIN LATERAL (
          SELECT ls.city, ls.state, ls.latitude, ls.longitude, ls.actual_arrival_at, ls.actual_departure_at, ls.scheduled_arrival_at
          FROM mdata.load_stops ls
          WHERE ls.load_id = l.id AND ls.stop_type = 'delivery'::mdata.stop_type_enum
            AND ls.soft_deleted_at IS NULL
          ORDER BY ls.sequence_number DESC
          LIMIT 1
        ) s ON true
        WHERE l.assigned_unit_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND l.status IN (
            'delivered_pending_docs'::mdata.load_status_enum,
            'completed_docs_received'::mdata.load_status_enum
          )
          AND COALESCE(s.actual_arrival_at, s.actual_departure_at, s.scheduled_arrival_at) IS NOT NULL
          AND ($2::timestamptz IS NULL OR COALESCE(s.actual_arrival_at, s.actual_departure_at, s.scheduled_arrival_at) < $2::timestamptz)
        ORDER BY COALESCE(s.actual_arrival_at, s.actual_departure_at, s.scheduled_arrival_at) DESC
        LIMIT 1
      `,
      [input.unit_uuid, input.before_iso ?? null]
    );

    const row = result.rows[0];
    if (!row) {
      return { deadhead_miles: null, source: "blank", reason: "no_prior_delivery_for_unit" };
    }

    const priorPoint = resolvePoint(row.latitude, row.longitude, row.city, row.state);
    if (!priorPoint) {
      return { deadhead_miles: null, source: "blank", reason: "prior_delivery_not_locatable" };
    }

    const miles = Math.round(haversineMiles(priorPoint.lat, priorPoint.lng, pickupPoint.lat, pickupPoint.lng) * 10) / 10;
    return {
      deadhead_miles: miles,
      source: "chain",
      prior_load_number: row.load_number,
      prior_delivery_city: row.city ?? "",
      prior_delivery_state: row.state ?? "",
      prior_delivered_at: row.delivered_at,
    };
  }, { actorUserId });
}
