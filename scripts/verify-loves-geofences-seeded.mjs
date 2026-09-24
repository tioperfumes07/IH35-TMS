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
export const REQUIRES_LIVE_DB =
  "master-data completeness guard; missing DB access is a failure, never a green skip";

/**
 * @param {Array<{id: string, location_code: string}>} locations - mdata.locations rows with
 *   location_code LIKE 'LOVES-%'
 * @param {Array<{location_ref_id: string | null, is_active: boolean}>} geofences - geo.geofences
 *   rows with external_source = 'loves_import'
 * @returns {string[]} problems, empty when everything is seeded and linked correctly
 */
export function checkLovesGeofencesSeeded(locations, geofences, minimum = 604) {
  const problems = [];

  if (locations.length < minimum) {
    problems.push(`Love's location population ${locations.length} is below required floor ${minimum}`);
  }
  if (geofences.length < minimum) {
    problems.push(`Love's geofence population ${geofences.length} is below required floor ${minimum}`);
  }

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

  const unstatedRadius = geofences.filter(
    (g) =>
      !Number.isFinite(Number(g.radius_m)) ||
      Number(g.radius_m) <= 0 ||
      !Number.isFinite(Number(g.enter_radius_m)) ||
      Number(g.enter_radius_m) <= 0 ||
      !Number.isFinite(Number(g.exit_radius_m)) ||
      Number(g.exit_radius_m) <= 0
  );
  if (unstatedRadius.length > 0) {
    problems.push(`${unstatedRadius.length} Love's geofence row(s) have no complete positive radius declaration`);
  }

  return problems;
}

function selftest() {
  const goodLocations = [
    { id: "loc-1", location_code: "LOVES-206" },
    { id: "loc-2", location_code: "LOVES-225" },
  ];
  const goodGeofences = [
    { location_ref_id: "loc-1", is_active: true, radius_m: 200, enter_radius_m: 200, exit_radius_m: 350 },
    { location_ref_id: "loc-2", is_active: true, radius_m: 200, enter_radius_m: 200, exit_radius_m: 350 },
  ];

  const goodProblems = checkLovesGeofencesSeeded(goodLocations, goodGeofences, 2);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  // RED CASE 1: a location with no linked active geofence at all (the geofence for loc-2 is
  // missing entirely -- e.g. the seed script died partway through, as it did once live this pass
  // on the very first --execute attempt, before the source-check constraint fix).
  const missingGeofence = [goodGeofences[0]];
  const problems1 = checkLovesGeofencesSeeded(goodLocations, missingGeofence, 2);
  if (!problems1.some((p) => p.includes("LOVES-225"))) {
    console.error(`${LABEL} SELFTEST FAIL — missing-geofence regression escaped detection`);
    process.exit(1);
  }

  // RED CASE 2: an inactive geofence does not count as "linked" (is_active=false must not
  // silently satisfy the check).
  const inactiveGeofence = [
    goodGeofences[0],
    { ...goodGeofences[1], is_active: false },
  ];
  const problems2 = checkLovesGeofencesSeeded(goodLocations, inactiveGeofence, 2);
  if (!problems2.some((p) => p.includes("LOVES-225"))) {
    console.error(`${LABEL} SELFTEST FAIL — inactive-geofence-counts-as-linked regression escaped detection`);
    process.exit(1);
  }

  // RED CASE 3: an orphan geofence with NULL location_ref_id -- floating, not linked.
  const orphan = [
    ...goodGeofences,
    { ...goodGeofences[0], location_ref_id: null },
  ];
  const problems3 = checkLovesGeofencesSeeded(goodLocations, orphan, 2);
  if (!problems3.some((p) => p.includes("NULL location_ref_id"))) {
    console.error(`${LABEL} SELFTEST FAIL — orphan-geofence regression escaped detection`);
    process.exit(1);
  }

  const missingRadius = [{ ...goodGeofences[0], radius_m: null }, goodGeofences[1]];
  const problems4 = checkLovesGeofencesSeeded(goodLocations, missingRadius, 2);
  if (!problems4.some((p) => p.includes("radius declaration"))) {
    console.error(`${LABEL} SELFTEST FAIL — missing-radius regression escaped detection`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — 4 regression mutations all detected, known-good fixture clean`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

async function main() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
  if (!url) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set; live master-data guard fails closed.`);
    return 1;
  }
  if (/-pooler\./.test(url)) {
    console.error(`${LABEL}: FAIL — refusing a pooler endpoint; direct read required.`);
    return 1;
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (error) {
    console.error(`${LABEL}: FAIL — database unreachable (${error.code ?? error.message}).`);
    await client.end().catch(() => {});
    return 1;
  }

  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const locationsRes = await client.query(
      `SELECT id::text, location_code FROM mdata.locations WHERE location_code LIKE 'LOVES-%'`
    );
    const geofencesRes = await client.query(
      `SELECT location_ref_id::text, is_active, radius_m, enter_radius_m, exit_radius_m
         FROM geo.geofences
        WHERE external_source = 'loves_import'`
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
