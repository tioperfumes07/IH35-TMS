/**
 * Backfill matched_driver_id on staging Relay fuel rows + driver_id on canonical
 * fuel.fuel_transactions when ingest left them NULL.
 *
 * Resolution order (RC6 443.341):
 *   1. integration_id match (relay-fuel-driver-match.ts)
 *   2. load-based fallback: find the load running on the fill's unit at fill time → assigned_primary_driver_id
 * Fills NULL only — never overwrites an existing driver link.
 */
import type { DbClient } from "./db-client.type.js";
import { resolveRelayDriverMatch, resolveRelayDriverFromLoad } from "./relay-fuel-driver-match.js";
import {
  rematchRelayFuelLoads,
  type RelayFuelLoadRematchResult,
} from "./relay-fuel-load-rematch.service.js";

export type RelayFuelDriverRematchResult = {
  scanned: number;
  matched: number;
  relay_updated: number;
  fuel_updated: number;
  skipped_ambiguous_or_unmatched: number;
  /** Why each skipped row stayed unresolved (relay_integration_id_missing, no_active_driver_with_integration_id, ...). */
  unresolved_reasons: Record<string, number>;
  load_rematch?: RelayFuelLoadRematchResult;
};

type UnmatchedRelayRow = {
  id: string;
  operating_company_id: string;
  transaction_id: string;
  relay_driver_integration_id: string | null;
  matched_unit_id: string | null;
  relay_created_at: string | null;
};

export async function rematchRelayFuelDrivers(
  client: DbClient,
  opts?: { operating_company_id?: string; limit?: number },
): Promise<RelayFuelDriverRematchResult> {
  const limit = Math.min(Math.max(opts?.limit ?? 5000, 1), 20000);
  const params: unknown[] = [];
  let opcoClause = "";
  if (opts?.operating_company_id) {
    params.push(opts.operating_company_id);
    opcoClause = `AND operating_company_id = $${params.length}::uuid`;
  }
  params.push(limit);

  const res = await client.query<UnmatchedRelayRow>(
    `
      SELECT
        id::text AS id,
        operating_company_id::text AS operating_company_id,
        transaction_id,
        relay_driver_integration_id,
        matched_unit_id::text AS matched_unit_id,
        relay_created_at::text AS relay_created_at
      FROM integrations.relay_fuel_transactions
      WHERE matched_driver_id IS NULL
        ${opcoClause}
      ORDER BY relay_created_at DESC NULLS LAST, created_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  let matched = 0;
  let relayUpdated = 0;
  let fuelUpdated = 0;
  let skipped = 0;
  const unresolvedReasons: Record<string, number> = {};

  for (const row of res.rows) {
    // 0. Cheapest path: canonical fuel row may already carry driver_id (set by other means).
    let driverId: string | null = null;
    const fuelRow = await client.query<{ driver_id: string }>(
      `SELECT ft.driver_id::text AS driver_id
         FROM fuel.fuel_transactions ft
        WHERE ft.operating_company_id = $1::uuid
          AND ft.transaction_reference = $2
          AND ft.driver_id IS NOT NULL
          AND ft.voided_at IS NULL
          AND ft.archived_at IS NULL
        LIMIT 1`,
      [row.operating_company_id, row.transaction_id],
    );
    if (fuelRow.rows.length > 0) {
      driverId = fuelRow.rows[0].driver_id;
    }

    let unresolvedReason = "no_load_driver_match";
    if (driverId === null) {
      // 1. Try integration_id match.
      const intMatch = await resolveRelayDriverMatch(client, row.operating_company_id, row.relay_driver_integration_id);
      if (intMatch.driver_id !== null) {
        driverId = intMatch.driver_id;
      } else {
        unresolvedReason = intMatch.unresolved_reason ?? "no_load_driver_match";
        // 2. RC6 fallback: load-based driver from the unit's active load at fill time.
        driverId = await resolveRelayDriverFromLoad(client, row.operating_company_id, row.matched_unit_id, row.relay_created_at);
      }
    }
    if (driverId === null) {
      skipped += 1;
      unresolvedReasons[unresolvedReason] = (unresolvedReasons[unresolvedReason] ?? 0) + 1;
      continue;
    }
    matched += 1;

    const relayUp = await client.query(
      `
        UPDATE integrations.relay_fuel_transactions
        SET matched_driver_id = $1::uuid,
            updated_at = now()
        WHERE id = $2::uuid
          AND matched_driver_id IS NULL
      `,
      [driverId, row.id],
    );
    relayUpdated += relayUp.rowCount ?? 0;

    const fuelUp = await client.query(
      `
        UPDATE fuel.fuel_transactions
        SET driver_id = $1::uuid,
            updated_at = now()
        WHERE operating_company_id = $2::uuid
          AND transaction_reference = $3
          AND driver_id IS NULL
      `,
      [driverId, row.operating_company_id, row.transaction_id],
    );
    fuelUpdated += fuelUp.rowCount ?? 0;
  }

  let loadRematch: RelayFuelLoadRematchResult | undefined;
  if (fuelUpdated > 0) {
    loadRematch = await rematchRelayFuelLoads(client, {
      operating_company_id: opts?.operating_company_id,
      limit: opts?.limit,
    });
  }

  return {
    scanned: res.rows.length,
    matched,
    relay_updated: relayUpdated,
    fuel_updated: fuelUpdated,
    skipped_ambiguous_or_unmatched: skipped,
    unresolved_reasons: unresolvedReasons,
    ...(loadRematch ? { load_rematch: loadRematch } : {}),
  };
}
