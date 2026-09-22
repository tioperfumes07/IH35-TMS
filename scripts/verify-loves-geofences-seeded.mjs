#!/usr/bin/env node
/**
 * verify-loves-geofences-seeded — LOVE'S 604 GEOFENCES (Lead, Round 33.1, 2026-09-23). Asserts the
 * seed built by scripts/ops/loves-604-geofences-seed.ts stays complete and linked:
 *
 *   1. Every mdata.locations row with location_code LIKE 'LOVES-%' has at least one linked,
 *      ACTIVE geo.geofences row (location_ref_id = locations.id, is_active = true).
 *   2. Every geo.geofences row with external_source = 'loves_import' carries a real, non-NULL
 *      location_ref_id -- an orphan Love's geofence (floating, unlinked) is exactly the failure
 *      class the Lead's ruling named ("LINKED not floating").
 *
 * Core logic (checkLovesGeofencesSeeded) is a pure function over plain row arrays so --selftest
 * can prove both RED cases on synthetic fixtures without touching a database, then GREEN on the
 * same fixture with the defect removed -- before the live half ever runs.
 *
 * Self-test: node scripts/verify-loves-geofences-seeded.mjs --selftest
 */
import process from "node:process";

const LABEL = "verify-loves-geofences-seeded";

// This checks data-linkage COMPLETENESS (every Love's location has a linked active geofence), not
// a dollar amount or a GL routing decision -- a silent offline skip cannot mask money moving
// incorrectly, only delay noticing a missing location/geofence link until DB access exists.
export const ALLOW_OFFLINE_SKIP =
  "location/geofence linkage completeness check, no money movement or GL routing involved";

/**
 * @param {Array<{id: string, location_code: string}>} locations - mdata.locations rows with
 *   location_code LIKE 'LOVES-%'
 * @param {Array<{location_ref_id: string | null, is_active: boolean}>} geofences - geo.geofences
 *   rows with external_source = 'loves_import'
 * @returns {string[]} problems, empty when everything is seeded and linked correctly
 */
export function checkLovesGeofencesSeeded(locations, geofences) {
  const problems = [];

  const activeGeofencedLocationIds = new Set(
    geofences.filter((g) => g.is_active && g.location_ref_id).map((g) => g.location_ref_id)
  );

  const unlinkedLocations = locations.filter((l) => !activeGeofencedLocationIds.has(l.id));
  if (unlinkedLocations.length > 0) {
    problems.push(
      `${unlinkedLocations.length} mdata.locations LOVES-% row(s) have no linked ACTIVE geo.geofences row: ` +
        `${unlinkedLocations
          .slice(0, 5)
          .map((l) => l.location_code)
          .join(", ")}${unlinkedLocations.length > 5 ? ", …" : ""}`
    );
  }

  const orphanGeofences = geofences.filter((g) => !g.location_ref_id);
  if (orphanGeofences.length > 0) {
    problems.push(
      `${orphanGeofences.length} geo.geofences row(s) with external_source='loves_import' carry a NULL location_ref_id -- floating, not linked.`
    );
  }

  return problems;
}

function selftest() {
  const goodLocations = [
    { id: "loc-1", location_code: "LOVES-206" },
    { id: "loc-2", location_code: "LOVES-225" },
  ];
  const goodGeofences = [
    { location_ref_id: "loc-1", is_active: true },
    { location_ref_id: "loc-2", is_active: true },
  ];

  const goodProblems = checkLovesGeofencesSeeded(goodLocations, goodGeofences);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  // RED CASE 1: a location with no linked active geofence at all (the geofence for loc-2 is
  // missing entirely -- e.g. the seed script died partway through, as it did once live this pass
  // on the very first --execute attempt, before the source-check constraint fix).
  const missingGeofence = [{ location_ref_id: "loc-1", is_active: true }];
  const problems1 = checkLovesGeofencesSeeded(goodLocations, missingGeofence);
  if (!problems1.some((p) => p.includes("LOVES-225"))) {
    console.error(`${LABEL} SELFTEST FAIL — missing-geofence regression escaped detection`);
    process.exit(1);
  }

  // RED CASE 2: an inactive geofence does not count as "linked" (is_active=false must not
  // silently satisfy the check).
  const inactiveGeofence = [
    { location_ref_id: "loc-1", is_active: true },
    { location_ref_id: "loc-2", is_active: false },
  ];
  const problems2 = checkLovesGeofencesSeeded(goodLocations, inactiveGeofence);
  if (!problems2.some((p) => p.includes("LOVES-225"))) {
    console.error(`${LABEL} SELFTEST FAIL — inactive-geofence-counts-as-linked regression escaped detection`);
    process.exit(1);
  }

  // RED CASE 3: an orphan geofence with NULL location_ref_id -- floating, not linked.
  const orphan = [
    { location_ref_id: "loc-1", is_active: true },
    { location_ref_id: "loc-2", is_active: true },
    { location_ref_id: null, is_active: true },
  ];
  const problems3 = checkLovesGeofencesSeeded(goodLocations, orphan);
  if (!problems3.some((p) => p.includes("NULL location_ref_id"))) {
    console.error(`${LABEL} SELFTEST FAIL — orphan-geofence regression escaped detection`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — 3 regression mutations all detected, known-good fixture clean`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

async function main() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
  if (!url) {
    console.log(`${LABEL}: SKIP (live check) — DATABASE_URL not set, not a pass or fail.`);
    return 0;
  }
  if (/-pooler\./.test(url)) {
    console.log(`${LABEL}: SKIP (live check) — refusing a pooler endpoint.`);
    return 0;
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL}: SKIP (live check) — database unreachable (${error.code ?? error.message}).`);
    await client.end().catch(() => {});
    return 0;
  }

  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const locationsRes = await client.query(
      `SELECT id::text, location_code FROM mdata.locations WHERE location_code LIKE 'LOVES-%'`
    );
    const geofencesRes = await client.query(
      `SELECT location_ref_id::text, is_active FROM geo.geofences WHERE external_source = 'loves_import'`
    );
    await client.query("ROLLBACK");

    console.log(
      `${LABEL}: live check — ${locationsRes.rows.length} LOVES-% location(s), ${geofencesRes.rows.length} loves_import geofence(s).`
    );

    const problems = checkLovesGeofencesSeeded(locationsRes.rows, geofencesRes.rows);
    if (problems.length > 0) {
      console.error(`${LABEL} FAIL:`);
      for (const p of problems) console.error(`  - ${p}`);
      return 1;
    }
    console.log(`${LABEL}: OK — every Love's location carries a real, active, linked geofence.`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (!process.argv.includes("--selftest") && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
