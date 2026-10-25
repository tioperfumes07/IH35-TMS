/**
 * Relay fuel → mdata.drivers matcher.
 *
 * Primary key: Relay driver.integration_id = mdata.drivers.integration_id.
 * Fallback (RC6 443.341): when integration_id is missing or unresolvable, derive the driver from the load
 * that was assigned to the fill's unit at fill time — exactly one assigned_primary_driver_id wins; ambiguous
 * or missing → stays unresolved. The fallback never guesses: it uses the same load-at-time window the
 * fuel-to-load rule uses.
 *
 * Read-only against mdata.drivers (no writes) — avoids Drivers-module data thrash.
 */
import type { DbClient } from "./db-client.type.js";
import { canonicalHappenedNotVoidedLoadClause } from "../../dispatch/canonical-active-load-set.js";

/** Relay's "not set" card/driver placeholder — never a match key. */
export const RELAY_PLACEHOLDER_INTEGRATION_ID = "0000000000000000";

export type RelayDriverUnresolvedReason =
  | "relay_integration_id_missing"
  | "relay_integration_id_placeholder"
  | "no_active_driver_with_integration_id"
  | "integration_id_matches_multiple_drivers";

export type RelayDriverMatch =
  | { driver_id: string; unresolved_reason: null }
  | { driver_id: null; unresolved_reason: RelayDriverUnresolvedReason };

/**
 * Resolve the driver for a Relay fuel txn by integration_id ONLY. Exact match on the value Relay sent (no
 * trimming / case folding — the key is an identifier, not free text). Returns the reason when unresolved.
 */
export async function resolveRelayDriverMatch(
  client: DbClient,
  operatingCompanyId: string,
  integrationId: string | null
): Promise<RelayDriverMatch> {
  if (integrationId == null || integrationId.trim() === "") {
    return { driver_id: null, unresolved_reason: "relay_integration_id_missing" };
  }
  if (integrationId === RELAY_PLACEHOLDER_INTEGRATION_ID) {
    return { driver_id: null, unresolved_reason: "relay_integration_id_placeholder" };
  }
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND integration_id = $2
        AND deactivated_at IS NULL
        AND archived_at IS NULL
      LIMIT 2
    `,
    [operatingCompanyId, integrationId]
  );
  if (res.rows.length === 0) return { driver_id: null, unresolved_reason: "no_active_driver_with_integration_id" };
  // The (operating_company_id, integration_id) unique index makes this unreachable today; never pick one anyway.
  if (res.rows.length > 1) return { driver_id: null, unresolved_reason: "integration_id_matches_multiple_drivers" };
  return { driver_id: res.rows[0].id, unresolved_reason: null };
}

/**
 * RC6 443.341 — fallback: resolve the driver for a Relay fill from the load that was running on the fill's
 * unit at fill time. Uses assigned_primary_driver_id from the load identified by the fuel-to-load time window
 * (same rule as fuel-load-at-time.ts). Returns null when no load is found or the load has no driver.
 *
 * Only called when integration_id resolution fails. Never overwrites an existing match.
 */
export async function resolveRelayDriverFromLoad(
  client: DbClient,
  operatingCompanyId: string,
  matchedUnitId: string | null,
  fillAt: string | null,
): Promise<string | null> {
  if (!matchedUnitId || !fillAt) return null;

  // Find the load that was running on this unit at fill time (unit-based window only — no driver yet).
  const loadRes = await client.query<{ load_id: string }>(
    `SELECT l.id::text AS load_id
       FROM mdata.loads l
       JOIN mdata.load_stops s_first ON s_first.load_id = l.id AND s_first.sequence_number = (SELECT min(s2.sequence_number) FROM mdata.load_stops s2 WHERE s2.load_id = l.id)
       JOIN mdata.load_stops s_last ON s_last.load_id = l.id AND s_last.sequence_number = (SELECT max(s2.sequence_number) FROM mdata.load_stops s2 WHERE s2.load_id = l.id)
      WHERE l.operating_company_id = $1::uuid
        AND l.assigned_unit_id = $2::uuid
        AND l.assigned_primary_driver_id IS NOT NULL
        AND ${canonicalHappenedNotVoidedLoadClause("l")}
        AND COALESCE(s_first.actual_departure_at, s_first.scheduled_arrival_at, l.created_at) <= $3::timestamptz
        AND ($3::timestamptz <= COALESCE(s_last.actual_arrival_at, s_last.scheduled_arrival_at + interval '1 day', l.created_at + interval '30 days'))
      ORDER BY s_first.actual_departure_at DESC NULLS LAST, l.created_at DESC
      LIMIT 1`,
    [operatingCompanyId, matchedUnitId, fillAt],
  );
  if (loadRes.rows.length === 0) return null;

  const driverRes = await client.query<{ driver_id: string }>(
    `SELECT assigned_primary_driver_id::text AS driver_id
       FROM mdata.loads
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND assigned_primary_driver_id IS NOT NULL`,
    [loadRes.rows[0].load_id, operatingCompanyId],
  );
  return driverRes.rows[0]?.driver_id ?? null;
}
