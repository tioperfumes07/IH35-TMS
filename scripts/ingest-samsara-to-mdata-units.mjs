#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ATTRIBUTION_CONFIG_PATH = path.join(ROOT, "config", "samsara-carrier-attribution.json");
const STRICT_TEST_UNIT_NUMBER = /^TEST-TRUCK-\d+$/;
const STRICT_TEST_VIN = /^TESTTRUCKVIN\d+$/;

function fail(message) {
  throw new Error(message);
}

function loadAttributionConfig() {
  if (!fs.existsSync(ATTRIBUTION_CONFIG_PATH)) {
    fail(`missing config file: ${ATTRIBUTION_CONFIG_PATH}`);
  }
  const parsed = JSON.parse(fs.readFileSync(ATTRIBUTION_CONFIG_PATH, "utf8"));
  if (!parsed.owner_company_id_for_all) fail("owner_company_id_for_all is required in config");
  if (!Array.isArray(parsed.lease_assignment_rules)) fail("lease_assignment_rules must be an array");
  if (!("default_lease" in parsed)) fail("default_lease must be present in config");
  return parsed;
}

function extractTagNames(rawPayload) {
  const tags = Array.isArray(rawPayload?.tags) ? rawPayload.tags : [];
  return tags
    .map((tag) => String(tag?.name ?? "").trim())
    .filter(Boolean);
}

function ruleMatchesTag(ruleTag, tags) {
  const target = String(ruleTag ?? "").trim().toLowerCase();
  if (!target) return false;
  return tags.some((tag) => String(tag).toLowerCase().includes(target));
}

function resolveLeaseCompanyId(tags, config, nowDate) {
  for (const rule of config.lease_assignment_rules) {
    if (!ruleMatchesTag(rule.samsara_tag, tags)) continue;
    const isActive = rule.active !== false;
    if (!isActive) {
      const activeFrom = String(rule.active_from ?? "").trim();
      if (!activeFrom) return null;
      const activeFromDate = new Date(`${activeFrom}T00:00:00.000Z`);
      if (Number.isNaN(activeFromDate.getTime())) return null;
      if (nowDate < activeFromDate) return null;
    }
    return rule.operating_company_id ?? null;
  }
  return config.default_lease ?? null;
}

function normalizeYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const year = Math.trunc(n);
  if (year < 1980 || year > 2100) return null;
  return year;
}

function normalizeText(value, maxLen = 255) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, maxLen);
}

function extractUnitNumber(rawPayload, vin) {
  const nameCandidate = normalizeText(rawPayload?.name, 120);
  if (nameCandidate) return nameCandidate;

  const externalIds = rawPayload?.externalIds && typeof rawPayload.externalIds === "object" ? rawPayload.externalIds : null;
  if (externalIds) {
    for (const rawValue of Object.values(externalIds)) {
      const candidate = normalizeText(rawValue, 120);
      if (!candidate) continue;
      if (candidate.toUpperCase() === vin.toUpperCase()) continue;
      return candidate;
    }
  }

  const suffix = vin.slice(-6).toUpperCase();
  return `VIN-${suffix}`;
}

function chooseUniqueUnitNumber(baseUnitNumber, vin, usedByUnitNumber, conflictsRef) {
  const base = baseUnitNumber.slice(0, 120);
  const existingVin = usedByUnitNumber.get(base);
  if (!existingVin || existingVin === vin) {
    usedByUnitNumber.set(base, vin);
    return base;
  }

  const vinSuffix = vin.slice(-4).toUpperCase();
  let attempt = `${base}-${vinSuffix}`.slice(0, 120);
  let counter = 1;
  while (true) {
    const mappedVin = usedByUnitNumber.get(attempt);
    if (!mappedVin || mappedVin === vin) {
      conflictsRef.count += 1;
      usedByUnitNumber.set(attempt, vin);
      return attempt;
    }
    counter += 1;
    attempt = `${base}-${vinSuffix}-${counter}`.slice(0, 120);
  }
}

async function runLinkScript() {
  const scriptPath = path.join(ROOT, "scripts", "link-samsara-to-units.mjs");
  const result = spawnSync("node", [scriptPath], {
    env: process.env,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const stderr = String(result.stderr ?? "").trim();
    const stdout = String(result.stdout ?? "").trim();
    fail(`link-samsara-to-units failed: ${stderr || stdout || "unknown error"}`);
  }

  const stdout = String(result.stdout ?? "").trim();
  if (!stdout) fail("link-samsara-to-units returned empty output");

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    fail(`link-samsara-to-units produced non-JSON output: ${stdout}`);
  }

  const vehicleMatched = Array.isArray(parsed?.vehicles)
    ? parsed.vehicles.reduce((acc, row) => acc + Number(row?.matched ?? 0), 0)
    : 0;
  if (vehicleMatched <= 0) {
    fail("link-samsara-to-units matched 0 vehicles after ingestion");
  }
  return {
    matched_vehicle_links: vehicleMatched,
    raw: parsed,
  };
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) fail("DATABASE_DIRECT_URL or DATABASE_URL is required");

  const config = loadAttributionConfig();
  const nowDate = new Date();
  const client = new Client(buildPgClientConfig(connectionString));

  await client.connect();

  let summary = null;
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [String(config.default_lease ?? config.owner_company_id_for_all)]);

    const companyRows = await client.query(
      `SELECT id::text AS id FROM org.companies WHERE id = ANY($1::uuid[])`,
      [
        [
          String(config.owner_company_id_for_all),
          ...config.lease_assignment_rules
            .map((rule) => (rule?.operating_company_id ? String(rule.operating_company_id) : null))
            .filter(Boolean),
          ...(config.default_lease ? [String(config.default_lease)] : []),
        ],
      ]
    );
    const knownCompanyIds = new Set(companyRows.rows.map((row) => row.id));
    if (!knownCompanyIds.has(String(config.owner_company_id_for_all))) {
      fail(`owner_company_id_for_all not found in org.companies: ${String(config.owner_company_id_for_all)}`);
    }

    const vehiclesCountRes = await client.query(
      `
        SELECT COUNT(*)::int AS total
        FROM integrations.samsara_vehicles
        WHERE NULLIF(raw_payload->>'vin', '') IS NOT NULL
      `
    );
    const realVehicleCount = Number(vehiclesCountRes.rows[0]?.total ?? 0);
    if (realVehicleCount < 10 || realVehicleCount > 200) {
      fail(`unexpected Samsara vehicle volume (${realVehicleCount}); refusing ingestion until owner review`);
    }

    const testRows = await client.query(
      `
        SELECT id::text AS id, unit_number, vin
        FROM mdata.units
        WHERE unit_number LIKE 'TEST-%'
           OR vin LIKE 'TEST%'
        ORDER BY created_at DESC
      `
    );
    if (testRows.rows.length !== 4) {
      fail(`expected exactly 4 TEST units, found ${testRows.rows.length}; refusing destructive delete`);
    }
    for (const row of testRows.rows) {
      const unitNumber = String(row.unit_number ?? "");
      const vin = String(row.vin ?? "");
      if (!STRICT_TEST_UNIT_NUMBER.test(unitNumber) || !STRICT_TEST_VIN.test(vin)) {
        fail(`found non-strict TEST unit pattern (${row.id} ${unitNumber} ${vin}); refusing destructive delete`);
      }
    }

    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [String(config.default_lease ?? config.owner_company_id_for_all)]);

    const existingUnitsRes = await client.query(`SELECT unit_number, vin FROM mdata.units`);
    const usedByUnitNumber = new Map();
    for (const row of existingUnitsRes.rows) {
      const unitNumber = String(row.unit_number ?? "").trim();
      const vin = String(row.vin ?? "").trim();
      if (!unitNumber || !vin) continue;
      usedByUnitNumber.set(unitNumber, vin);
    }

    const vehiclesRes = await client.query(
      `
        SELECT id::text AS id, raw_payload
        FROM integrations.samsara_vehicles
        WHERE NULLIF(raw_payload->>'vin', '') IS NOT NULL
        ORDER BY created_at ASC
      `
    );

    const counters = {
      units_created: 0,
      units_updated: 0,
      conflicts_handled: 0,
    };
    const conflictsRef = { count: 0 };
    const leaseAttribution = new Map();

    for (const row of vehiclesRes.rows) {
      const rawPayload = row.raw_payload ?? {};
      const vin = normalizeText(rawPayload?.vin ?? "", 60);
      if (!vin) continue;

      const tagNames = extractTagNames(rawPayload);
      const leaseCompanyId = resolveLeaseCompanyId(tagNames, config, nowDate);
      if (leaseCompanyId && !knownCompanyIds.has(String(leaseCompanyId))) {
        fail(`lease assignment resolved to unknown company id ${String(leaseCompanyId)} for vin ${vin}`);
      }

      const baseUnitNumber = extractUnitNumber(rawPayload, vin);
      const unitNumber = chooseUniqueUnitNumber(baseUnitNumber, vin, usedByUnitNumber, conflictsRef);
      const make = normalizeText(rawPayload?.make, 120);
      const model = normalizeText(rawPayload?.model, 120);
      const year = normalizeYear(rawPayload?.year);
      const status = "InService";

      const upsertRes = await client.query(
        `
          INSERT INTO mdata.units (
            unit_number,
            vin,
            make,
            model,
            year,
            owner_company_id,
            currently_leased_to_company_id,
            status,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::uuid, $7::uuid, $8::mdata.unit_status, now())
          ON CONFLICT (vin) DO UPDATE
            SET unit_number = EXCLUDED.unit_number,
                make = EXCLUDED.make,
                model = EXCLUDED.model,
                year = EXCLUDED.year,
                owner_company_id = EXCLUDED.owner_company_id,
                currently_leased_to_company_id = EXCLUDED.currently_leased_to_company_id,
                status = EXCLUDED.status,
                updated_at = now()
          RETURNING (xmax = 0) AS inserted
        `,
        [
          unitNumber,
          vin,
          make,
          model,
          year,
          String(config.owner_company_id_for_all),
          leaseCompanyId,
          status,
        ]
      );
      if (upsertRes.rows[0]?.inserted) counters.units_created += 1;
      else counters.units_updated += 1;

      const leaseKey = leaseCompanyId ? String(leaseCompanyId) : "unleased";
      leaseAttribution.set(leaseKey, (leaseAttribution.get(leaseKey) ?? 0) + 1);
    }

    counters.conflicts_handled = conflictsRef.count;

    const deleteRes = await client.query(
      `
        DELETE FROM mdata.units
        WHERE unit_number LIKE 'TEST-TRUCK-%'
          AND vin LIKE 'TESTTRUCKVIN%'
      `
    );
    const testUnitsDeleted = Number(deleteRes.rowCount ?? 0);

    const trkExistsRes = await client.query(
      `SELECT COUNT(*)::int AS c FROM mdata.units WHERE owner_company_id = $1::uuid`,
      [String(config.owner_company_id_for_all)]
    );
    const trkOwnedUnits = Number(trkExistsRes.rows[0]?.c ?? 0);
    if (trkOwnedUnits < 1) {
      fail("post-check failed: no units attributed to owner_company_id_for_all");
    }

    const remainingTestRes = await client.query(
      `
        SELECT COUNT(*)::int AS c
        FROM mdata.units
        WHERE unit_number LIKE 'TEST-%'
           OR vin LIKE 'TEST%'
      `
    );
    const testUnitsRemaining = Number(remainingTestRes.rows[0]?.c ?? 0);
    if (testUnitsRemaining !== 0) {
      fail(`post-check failed: ${testUnitsRemaining} TEST units still present`);
    }

    await client.query("COMMIT");

    const linkSummary = await runLinkScript();
    summary = {
      tenants_attributed: Object.fromEntries([...leaseAttribution.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      units_created: counters.units_created,
      units_updated: counters.units_updated,
      test_units_deleted: testUnitsDeleted,
      conflicts_handled: counters.conflicts_handled,
      matched_vehicle_links: linkSummary.matched_vehicle_links,
      test_units_remaining: testUnitsRemaining,
    };
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

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`ingest-samsara-to-mdata-units FAILED: ${String(error?.message ?? error)}`);
  process.exit(1);
});
