/**
 * Backfill matched_driver_id on staging Relay fuel rows + driver_id on canonical
 * fuel.fuel_transactions when ingest left them NULL (drivers.integration_id empty at the time).
 *
 * Same rule as ingest: Relay driver.integration_id = mdata.drivers.integration_id and nothing else
 * (relay-fuel-driver-match.ts). Re-run after integration_ids are filled in on driver profiles.
 * Fills NULL only — never overwrites an existing driver link.
 */
import type { DbClient } from "./db-client.type.js";
import { resolveRelayDriverMatch } from "./relay-fuel-driver-match.js";
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
        relay_driver_integration_id
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
    const match = await resolveRelayDriverMatch(client, row.operating_company_id, row.relay_driver_integration_id);
    if (match.driver_id === null) {
      skipped += 1;
      unresolvedReasons[match.unresolved_reason] = (unresolvedReasons[match.unresolved_reason] ?? 0) + 1;
      continue;
    }
    const driverId = match.driver_id;
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
