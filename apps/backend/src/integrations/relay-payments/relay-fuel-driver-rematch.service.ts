/**
 * Backfill matched_driver_id on staging Relay fuel rows + driver_id on canonical
 * fuel.fuel_transactions when ingest left them NULL (drivers.integration_id empty).
 *
 * Fills NULL only — never overwrites an existing driver link.
 */
import type { DbClient } from "./db-client.type.js";
import { resolveMatchedDriverId } from "./relay-fuel-driver-match.js";
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
  load_rematch?: RelayFuelLoadRematchResult;
};

type UnmatchedRelayRow = {
  id: string;
  operating_company_id: string;
  transaction_id: string;
  relay_driver_integration_id: string | null;
  relay_driver_phone: string | null;
  relay_driver_first_name: string | null;
  relay_driver_last_name: string | null;
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
        relay_driver_phone,
        relay_driver_first_name,
        relay_driver_last_name
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

  for (const row of res.rows) {
    const driverId = await resolveMatchedDriverId(client, row.operating_company_id, {
      integration_id: row.relay_driver_integration_id,
      phone: row.relay_driver_phone,
      first_name: row.relay_driver_first_name,
      last_name: row.relay_driver_last_name,
    });
    if (!driverId) {
      skipped += 1;
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
    ...(loadRematch ? { load_rematch: loadRematch } : {}),
  };
}
