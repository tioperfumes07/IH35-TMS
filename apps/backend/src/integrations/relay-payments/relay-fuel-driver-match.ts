/**
 * Relay fuel → mdata.drivers matcher.
 *
 * ONE key, nothing else: Relay driver.integration_id = mdata.drivers.integration_id (column added by
 * 202607110000_relay_fuel_ingest.sql), within the operating company, active drivers only.
 * Relay (relayed by the Lead 2026-10-03): "use the integration_id to match transactions as thats the value we
 * store on the driver profile that is visible to the users."
 *
 * The phone / first+last name fallbacks were REMOVED: a fill attributed to the wrong driver becomes a wrong
 * settlement deduction. No integration_id match -> the driver stays unresolved with a named reason (stored rows
 * keep relay_driver_* verbatim, so a human can still link it) — the matcher never guesses. Relay driver.id,
 * email, phone, name and card number are NOT match keys (Relay has not confirmed integration_id == driver.id).
 *
 * Read-only against mdata.drivers (no writes) — avoids Drivers-module data thrash.
 */
import type { DbClient } from "./db-client.type.js";

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
