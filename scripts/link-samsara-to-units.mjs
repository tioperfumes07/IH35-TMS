#!/usr/bin/env node
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");

const { Client } = pg;

function asCountMap(rows, keyField, countField) {
  const out = new Map();
  for (const row of rows) {
    const key = String(row[keyField] ?? "");
    if (!key) continue;
    out.set(key, Number(row[countField] ?? 0));
  }
  return out;
}

function summarizeByTenant(totalMap, matchedMap, stillMap) {
  const allTenants = new Set([...totalMap.keys(), ...matchedMap.keys(), ...stillMap.keys()]);
  return [...allTenants]
    .sort((a, b) => a.localeCompare(b))
    .map((tenant) => ({
      tenant,
      total: totalMap.get(tenant) ?? 0,
      matched: matchedMap.get(tenant) ?? 0,
      still_unlinked: stillMap.get(tenant) ?? 0,
    }));
}

async function relationExists(client, qualifiedName) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [qualifiedName]);
  return Boolean(res.rows[0]?.ok);
}

async function columnExists(client, schema, table, column) {
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
      ) AS ok
    `,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

async function collectVehicleUnlinkedByTenant(client) {
  const res = await client.query(
    `
      SELECT operating_company_id::text AS tenant, count(*)::text AS total
      FROM integrations.samsara_vehicles
      WHERE local_unit_id IS NULL
      GROUP BY operating_company_id
    `
  );
  return asCountMap(res.rows, "tenant", "total");
}

async function collectDriverUnlinkedByTenant(client) {
  const res = await client.query(
    `
      SELECT operating_company_id::text AS tenant, count(*)::text AS total
      FROM integrations.samsara_drivers
      WHERE local_driver_id IS NULL
      GROUP BY operating_company_id
    `
  );
  return asCountMap(res.rows, "tenant", "total");
}

async function linkVehiclesByVin(client) {
  const res = await client.query(
    `
      WITH candidates AS (
        SELECT
          sv.id,
          sv.operating_company_id,
          upper(trim(coalesce(
            sv.raw_payload->>'vin',
            sv.raw_payload#>>'{data,vin}',
            sv.raw_payload#>>'{vehicle,vin}',
            ''
          ))) AS vin_norm
        FROM integrations.samsara_vehicles sv
        WHERE sv.local_unit_id IS NULL
      ),
      matches AS (
        SELECT
          c.id AS samsara_vehicle_row_id,
          u.id AS unit_id,
          c.operating_company_id,
          row_number() OVER (
            PARTITION BY c.id
            ORDER BY u.updated_at DESC NULLS LAST, u.created_at DESC NULLS LAST, u.id
          ) AS rn
        FROM candidates c
        JOIN mdata.units u
          ON upper(trim(coalesce(u.vin, ''))) = c.vin_norm
         AND (
           u.owner_company_id = c.operating_company_id
           OR u.currently_leased_to_company_id = c.operating_company_id
         )
        WHERE c.vin_norm <> ''
      )
      UPDATE integrations.samsara_vehicles sv
      SET local_unit_id = m.unit_id,
          updated_at = now()
      FROM matches m
      WHERE sv.id = m.samsara_vehicle_row_id
        AND m.rn = 1
        AND sv.local_unit_id IS NULL
      RETURNING sv.operating_company_id::text AS tenant
    `
  );
  const counts = new Map();
  for (const row of res.rows) {
    const tenant = String(row.tenant ?? "");
    if (!tenant) continue;
    counts.set(tenant, (counts.get(tenant) ?? 0) + 1);
  }
  return counts;
}

async function linkDriversBySamsaraId(client) {
  const res = await client.query(
    `
      WITH candidates AS (
        SELECT
          sd.id,
          sd.operating_company_id,
          trim(coalesce(
            sd.raw_payload->>'id',
            sd.raw_payload#>>'{data,id}',
            sd.raw_payload#>>'{driver,id}',
            sd.samsara_driver_id,
            ''
          )) AS samsara_driver_id_norm
        FROM integrations.samsara_drivers sd
        WHERE sd.local_driver_id IS NULL
      ),
      matches AS (
        SELECT
          c.id AS samsara_driver_row_id,
          d.id AS driver_id,
          c.operating_company_id,
          row_number() OVER (PARTITION BY c.id ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC NULLS LAST, d.id) AS rn
        FROM candidates c
        JOIN mdata.drivers d
          ON d.operating_company_id = c.operating_company_id
         AND d.samsara_driver_id = c.samsara_driver_id_norm
        WHERE c.samsara_driver_id_norm <> ''
      )
      UPDATE integrations.samsara_drivers sd
      SET local_driver_id = m.driver_id,
          updated_at = now()
      FROM matches m
      WHERE sd.id = m.samsara_driver_row_id
        AND m.rn = 1
        AND sd.local_driver_id IS NULL
      RETURNING sd.operating_company_id::text AS tenant
    `
  );
  const counts = new Map();
  for (const row of res.rows) {
    const tenant = String(row.tenant ?? "");
    if (!tenant) continue;
    counts.set(tenant, (counts.get(tenant) ?? 0) + 1);
  }
  return counts;
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const result = {
      vehicles: [],
      drivers: [],
      notes: [],
    };

    if (!(await relationExists(client, "integrations.samsara_vehicles"))) {
      result.notes.push("integrations.samsara_vehicles not found; vehicle linkage skipped");
    } else if (!(await relationExists(client, "mdata.units"))) {
      result.notes.push("mdata.units not found; vehicle linkage skipped");
    } else {
      const total = await collectVehicleUnlinkedByTenant(client);
      const matched = await linkVehiclesByVin(client);
      const still = await collectVehicleUnlinkedByTenant(client);
      result.vehicles = summarizeByTenant(total, matched, still);
    }

    const canLinkDrivers =
      (await relationExists(client, "integrations.samsara_drivers")) &&
      (await relationExists(client, "mdata.drivers")) &&
      (await columnExists(client, "mdata", "drivers", "samsara_driver_id"));

    if (!canLinkDrivers) {
      result.notes.push("driver linkage skipped (required tables/column unavailable)");
    } else {
      const totalDrivers = await collectDriverUnlinkedByTenant(client);
      const matchedDrivers = await linkDriversBySamsaraId(client);
      const stillDrivers = await collectDriverUnlinkedByTenant(client);
      result.drivers = summarizeByTenant(totalDrivers, matchedDrivers, stillDrivers);
    }

    await client.query("COMMIT");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`link-samsara-to-units FAILED: ${String(error?.message ?? error)}`);
  process.exit(1);
});
