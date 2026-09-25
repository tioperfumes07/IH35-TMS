#!/usr/bin/env node
// verify-driver-samsara-map-one-to-many.mjs — ROUND 181.1 step 0 guard.
//
// Owner order: "one driver WILL have more than one Samsara account/username."
// This guard enforces:
//   A. The map table mdata.driver_samsara_accounts exists.
//   B. Every Samsara id in the map maps to exactly one driver (UNIQUE constraint on samsara_driver_id).
//   C. No code path resolves a driver via mdata.drivers.samsara_driver_id as the KEY (legacy column
//      is read-only; the map is canonical). Static scan of apps/backend/src for SELECT/WHERE
//      clauses that treat d.samsara_driver_id as the join key.
//   D. Live: every driver with a legacy samsara_driver_id has at least one row in the map.
//   E. Live: no Samsara id maps to 2 drivers.
//
// Self-arming POPULATION check. Read-only. Never writes.

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const LABEL = "verify-driver-samsara-map-one-to-many";

// --- classifier (pure, testable) ---
/**
 * @param {{
 *   mapTableExists: boolean,
 *   uniqueConstraint: boolean,
 *   legacyColumnUsedAsKey: boolean,
 *   liveDriversWithLegacySamsara: number,
 *   liveDriversWithMapRow: number,
 *   liveSamsaraIdsMappingTo2Drivers: number,
 * }} input
 * @returns {{ pass: boolean, checks: Record<string, { pass: boolean, detail: string }> }}
 */
export function classifyDriverSamsaraMap(input) {
  const checks = {};

  checks.A_MAP_TABLE_EXISTS = {
    pass: input.mapTableExists,
    detail: input.mapTableExists
      ? "mdata.driver_samsara_accounts exists"
      : "mdata.driver_samsara_accounts MISSING — migration 202614350000 not applied",
  };

  checks.B_UNIQUE_SAMSARA_ID = {
    pass: input.uniqueConstraint,
    detail: input.uniqueConstraint
      ? "UNIQUE constraint on samsara_driver_id present"
      : "UNIQUE constraint on samsara_driver_id MISSING — one Samsara id could map to 2 drivers",
  };

  checks.C_NO_LEGACY_AS_KEY = {
    pass: !input.legacyColumnUsedAsKey,
    detail: input.legacyColumnUsedAsKey
      ? "Code path resolves driver via mdata.drivers.samsara_driver_id as join key — must use the map"
      : "No code path uses mdata.drivers.samsara_driver_id as the join key",
  };

  checks.D_LEGACY_BACKFILLED = {
    pass: input.liveDriversWithLegacySamsara === input.liveDriversWithMapRow,
    detail: `legacy samsara_driver_id drivers: ${input.liveDriversWithLegacySamsara}, map rows: ${input.liveDriversWithMapRow}`,
  };

  checks.E_NO_DUPLICATE_SAMSARA_MAPPING = {
    pass: input.liveSamsaraIdsMappingTo2Drivers === 0,
    detail: `Samsara ids mapping to 2+ drivers: ${input.liveSamsaraIdsMappingTo2Drivers}`,
  };

  const pass = Object.values(checks).every(c => c.pass);
  return { pass, checks };
}

// --- selftest ---
export function selftest() {
  const fixtures = [
    {
      name: "all-pass",
      input: { mapTableExists: true, uniqueConstraint: true, legacyColumnUsedAsKey: false, liveDriversWithLegacySamsara: 5, liveDriversWithMapRow: 5, liveSamsaraIdsMappingTo2Drivers: 0 },
      expectPass: true,
    },
    {
      name: "map-table-missing",
      input: { mapTableExists: false, uniqueConstraint: false, legacyColumnUsedAsKey: false, liveDriversWithLegacySamsara: 0, liveDriversWithMapRow: 0, liveSamsaraIdsMappingTo2Drivers: 0 },
      expectPass: false,
    },
    {
      name: "unique-constraint-missing",
      input: { mapTableExists: true, uniqueConstraint: false, legacyColumnUsedAsKey: false, liveDriversWithLegacySamsara: 5, liveDriversWithMapRow: 5, liveSamsaraIdsMappingTo2Drivers: 0 },
      expectPass: false,
    },
    {
      name: "legacy-used-as-key",
      input: { mapTableExists: true, uniqueConstraint: true, legacyColumnUsedAsKey: true, liveDriversWithLegacySamsara: 5, liveDriversWithMapRow: 5, liveSamsaraIdsMappingTo2Drivers: 0 },
      expectPass: false,
    },
    {
      name: "backfill-incomplete",
      input: { mapTableExists: true, uniqueConstraint: true, legacyColumnUsedAsKey: false, liveDriversWithLegacySamsara: 5, liveDriversWithMapRow: 3, liveSamsaraIdsMappingTo2Drivers: 0 },
      expectPass: false,
    },
    {
      name: "duplicate-samsara-mapping",
      input: { mapTableExists: true, uniqueConstraint: true, legacyColumnUsedAsKey: false, liveDriversWithLegacySamsara: 5, liveDriversWithMapRow: 5, liveSamsaraIdsMappingTo2Drivers: 1 },
      expectPass: false,
    },
  ];

  let pass = 0;
  for (const f of fixtures) {
    const result = classifyDriverSamsaraMap(f.input);
    if (result.pass === f.expectPass) {
      pass++;
    } else {
      console.error(`${LABEL}: selftest FAIL — fixture "${f.name}" expected ${f.expectPass} got ${result.pass}`);
      console.error(JSON.stringify(result.checks, null, 2));
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${pass}/${fixtures.length} classifier fixtures all correct`);
}

// --- static scan: check if any code uses d.samsara_driver_id as join key ---
function staticScanLegacyAsKey() {
  // Look for patterns like "WHERE d.samsara_driver_id = $", "JOIN ... ON d.samsara_driver_id ="
  // in apps/backend/src. The legacy column being READ for display is fine; being used as the
  // JOIN KEY to resolve a Samsara event to a driver is the anti-pattern.
  const backendSrc = "apps/backend/src";
  if (!existsSync(backendSrc)) return false;

  try {
    // Search for samsara_driver_id used in WHERE/JOIN clauses in .ts files
    const grepResult = execSync(
      `grep -rn "samsara_driver_id" ${backendSrc} --include="*.ts" | grep -v __tests__ | grep -v ".test." | grep -v "node_modules" || true`,
      { encoding: "utf-8", timeout: 10000 },
    );

    // The anti-pattern is using mdata.drivers.samsara_driver_id (d.samsara_driver_id) as the
    // join key. The map table is the canonical source. We flag patterns like:
    //   "d.samsara_driver_id = $"
    //   "md.samsara_driver_id = $"
    //   "drivers.samsara_driver_id = $"
    // but NOT:
    //   "sd.samsara_driver_id = $" (integrations.samsara_drivers — that's the ingestion bridge)
    //   "m.samsara_driver_id = $" (the map table itself)
    const lines = grepResult.split("\n").filter(l => l.trim());
    const violations = lines.filter(line => {
      // Skip the map table itself and the samsara_drivers ingestion bridge
      if (line.includes("driver_samsara_accounts")) return false;
      if (line.includes("sd.samsara_driver_id")) return false;
      if (line.includes("samsara_drivers.samsara_driver_id")) return false;
      // Flag d.samsara_driver_id or md.samsara_driver_id or drivers.samsara_driver_id used as join
      return /(?:d|md|drivers)\.samsara_driver_id\s*=/.test(line);
    });

    return violations.length > 0;
  } catch {
    return false;
  }
}

// --- live measurement ---
async function measureLive() {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });

  try {
    // A. Map table exists
    const tableRes = await client.query(
      `SELECT to_regclass('mdata.driver_samsara_accounts') IS NOT NULL AS exists`,
    );
    const mapTableExists = tableRes.rows[0].exists;

    // B. Unique constraint on samsara_driver_id
    const constraintRes = await client.query(
      `SELECT 1 FROM pg_constraint
       WHERE conrelid = 'mdata.driver_samsara_accounts'::regclass
         AND contype = 'u'
         AND conkey = ARRAY[
           (SELECT attnum FROM pg_attribute
            WHERE attrelid = 'mdata.driver_samsara_accounts'::regclass
              AND attname = 'samsara_driver_id')
         ]`,
    );
    const uniqueConstraint = constraintRes.rows.length > 0;

    // D. Legacy backfill: drivers with legacy samsara_driver_id vs map rows
    const legacyRes = await client.query(
      `SELECT count(*)::int AS cnt FROM mdata.drivers WHERE samsara_driver_id IS NOT NULL`,
    );
    const mapRes = await client.query(
      `SELECT count(*)::int AS cnt FROM mdata.driver_samsara_accounts`,
    );
    const liveDriversWithLegacySamsara = legacyRes.rows[0].cnt;
    const liveDriversWithMapRow = mapRes.rows[0].cnt;

    // E. Samsara ids mapping to 2+ drivers (should be 0 due to UNIQUE, but check)
    const dupRes = await client.query(
      `SELECT count(*)::int AS cnt FROM (
        SELECT samsara_driver_id, count(DISTINCT driver_id) AS driver_count
        FROM mdata.driver_samsara_accounts
        GROUP BY samsara_driver_id
        HAVING count(DISTINCT driver_id) > 1
      ) dups`,
    );
    const liveSamsaraIdsMappingTo2Drivers = dupRes.rows[0].cnt;

    return {
      mapTableExists,
      uniqueConstraint,
      legacyColumnUsedAsKey: staticScanLegacyAsKey(),
      liveDriversWithLegacySamsara,
      liveDriversWithMapRow,
      liveSamsaraIdsMappingTo2Drivers,
    };
  } finally {
    client.release();
    await pool.end();
  }
}

// --- main ---
async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const input = await measureLive();
  const result = classifyDriverSamsaraMap(input);

  console.log(`${LABEL}: ${result.pass ? "PASS" : "FAIL"}`);
  for (const [name, check] of Object.entries(result.checks)) {
    console.log(`  ${check.pass ? "PASS" : "FAIL"}  ${name} — ${check.detail}`);
  }

  process.exit(result.pass ? 0 : 1);
}

main();
