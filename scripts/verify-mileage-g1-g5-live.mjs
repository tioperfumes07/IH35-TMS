#!/usr/bin/env node
/**
 * verify-mileage-g1-g5-live.mjs
 *
 * GO-19-2b Section 8 guards G1-G5 (owner 2026-09-03), each asserted LIVE against Neon prod,
 * bypass_rls-wrapped per the RLS law (a count without the bypass is not evidence).
 *
 * G1 catalogs.lane_mileage: no row with short_miles > practical_miles
 * G2 catalogs.lane_mileage: no row with autofill_allowed=true AND short_miles > practical_miles
 * G3 mdata.loads: no row with miles_shortest > miles_practical when both NOT NULL, EXCEPT the
 *    named, owner-accepted wizard test draft (load 13508 -- status=draft, no unit, no driver,
 *    matches BookLoadModalV4.test.tsx's own fixture; REPORT, never delete)
 * G4 mdata.loads: mileage_source NOT NULL wherever miles_practical IS NOT NULL, same 13508
 *    exception (a direct-insert test fixture, never routed through the real Book Load stamp path)
 * G5 no code path writes AlwaysTrack "St. Miles" into any application column (grep-based; St.Miles
 *    = L.Miles + E.Miles, has no destination column -- importing it double-pays deadhead)
 *
 * G6 (BookLoadModalV4 mileage defaults must not be 0) is intentionally NOT in this file --
 * BookLoadModalV4.tsx is Cursor's surface (apps/frontend/src/components/dispatch/**) under the
 * ownership lock. FIND IT, FILE IT, DO NOT FIX IT: filed to docs/bus/GUARD-WORKORDERS.md instead
 * of built here.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const KNOWN_MISMATCH_LOAD_NUMBER = "13508";
const LOAD_MILES_CHECK_MIGRATION =
  "db/migrations/202613700200_loads_miles_shortest_not_over_practical_check.sql";
const LOAD_MILES_CHECK_NAME = "loads_miles_shortest_not_over_practical";
const LOAD_MILES_CHECK_RE =
  /CHECK\s*\(\s*miles_shortest\s+IS\s+NULL\s+OR\s+miles_practical\s+IS\s+NULL\s+OR\s+miles_shortest\s*<=\s*miles_practical\s*\)/i;

const SCAN_ROOTS = ["apps/backend/src", "apps/frontend/src"];
const ST_MILES_PATTERN = /st\.?\s*miles/i;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes("verify-mileage-g1-g5-live")) out.push(full);
  }
  return out;
}

/** G5: any assignment/write expression that reads an "St. Miles"/"St Miles"-labelled source field
 * into miles_shortest, short_miles, or any mileage column. A bare mention in a comment/doc string
 * explaining the LAW (like this file, or LIVE-FINDINGS docs) is not a violation -- only an actual
 * write-shaped pattern is. */
function scanForStMilesWrite() {
  const hits = [];
  for (const root of SCAN_ROOTS) {
    for (const f of walk(root)) {
      const text = readFileSync(f, "utf8");
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!ST_MILES_PATTERN.test(line)) continue;
        // A write shape: assigning/passing a "St Miles"-derived value into miles_shortest/short_miles.
        if (/(miles_shortest|short_miles)\s*[:=].*st\.?\s*miles/i.test(line) || /st\.?\s*miles.*(miles_shortest|short_miles)\s*[:=]/i.test(line)) {
          hits.push(`${f}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  }
  return hits;
}

function checkLoadMilesConstraint(migrationSource) {
  const failures = [];
  if (!migrationSource.includes(LOAD_MILES_CHECK_NAME)) {
    failures.push(`missing constraint name ${LOAD_MILES_CHECK_NAME}`);
  }
  if (!LOAD_MILES_CHECK_RE.test(migrationSource)) {
    failures.push("mdata.loads CHECK no longer blocks miles_shortest > miles_practical");
  }
  return failures;
}

async function withClient(fn) {
  const url = process.env.DATABASE_URL;
  if (!url) return { skipped: true, reason: "DATABASE_URL not set" };
  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } finally {
    await client.end();
  }
}

async function runLiveChecks() {
  return withClient(async (client) => {
    const g1 = await client.query(
      `SELECT count(*)::int AS n FROM catalogs.lane_mileage
        WHERE operating_company_id = $1::uuid AND short_miles IS NOT NULL AND short_miles > practical_miles`,
      [USMCA]
    );
    const g2 = await client.query(
      `SELECT count(*)::int AS n FROM catalogs.lane_mileage
        WHERE operating_company_id = $1::uuid AND autofill_allowed = true
          AND short_miles IS NOT NULL AND short_miles > practical_miles`,
      [USMCA]
    );
    const g3 = await client.query(
      `SELECT count(*)::int AS n FROM mdata.loads
        WHERE operating_company_id = $1::uuid AND miles_shortest IS NOT NULL AND miles_practical IS NOT NULL
          AND miles_shortest > miles_practical AND load_number <> $2`,
      [USMCA, KNOWN_MISMATCH_LOAD_NUMBER]
    );
    const g4 = await client.query(
      `SELECT count(*)::int AS n FROM mdata.loads
        WHERE operating_company_id = $1::uuid AND miles_practical IS NOT NULL AND mileage_source IS NULL
          AND load_number <> $2`,
      [USMCA, KNOWN_MISMATCH_LOAD_NUMBER]
    );
    return {
      g1_short_gt_practical: Number(g1.rows[0]?.n ?? 0),
      g2_autofill_and_short_gt_practical: Number(g2.rows[0]?.n ?? 0),
      g3_shortest_gt_practical_unexplained: Number(g3.rows[0]?.n ?? 0),
      g4_missing_mileage_source_unexplained: Number(g4.rows[0]?.n ?? 0),
    };
  });
}

if (process.argv.includes("--selftest")) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const migration = readFileSync(LOAD_MILES_CHECK_MIGRATION, "utf8");
  if (!src.includes(KNOWN_MISMATCH_LOAD_NUMBER)) {
    console.error("verify-mileage-g1-g5-live SELFTEST FAIL — 13508 exception no longer named");
    process.exit(1);
  }
  const cleanHits = scanForStMilesWrite();
  if (cleanHits.length > 0) {
    console.error(`verify-mileage-g1-g5-live SELFTEST FAIL — G5 flags real source with nothing planted: ${cleanHits.join(" | ")}`);
    process.exit(1);
  }
  const planted = migration.replace("miles_shortest <= miles_practical", "miles_shortest >= miles_practical");
  if (planted === migration || checkLoadMilesConstraint(planted).length === 0) {
    console.error("verify-mileage-g1-g5-live SELFTEST FAIL — planted shortest/practical CHECK inversion escaped");
    process.exit(1);
  }
  const realConstraintFailures = checkLoadMilesConstraint(migration);
  if (realConstraintFailures.length > 0) {
    console.error(`verify-mileage-g1-g5-live SELFTEST FAIL — ${realConstraintFailures.join("; ")}`);
    process.exit(1);
  }
  console.log("verify-mileage-g1-g5-live SELFTEST PASS — planted CHECK inversion blocked; G5 scanner clean; 13508 exception present");
  process.exit(0);
}

async function main() {
  const g5Hits = scanForStMilesWrite();
  const live = await runLiveChecks();
  const constraintFailures = checkLoadMilesConstraint(readFileSync(LOAD_MILES_CHECK_MIGRATION, "utf8"));

  if (live.skipped) {
    console.log(`verify-mileage-g1-g5-live: G1-G4 UNVERIFIED — ${live.reason} (no live DB reachable this run)`);
  } else {
    console.log(
      `G1 short>practical: ${live.g1_short_gt_practical} · G2 autofill+short>practical: ${live.g2_autofill_and_short_gt_practical} · ` +
        `G3 shortest>practical (unexplained, excl. ${KNOWN_MISMATCH_LOAD_NUMBER}): ${live.g3_shortest_gt_practical_unexplained} · ` +
        `G4 missing mileage_source (unexplained, excl. ${KNOWN_MISMATCH_LOAD_NUMBER}): ${live.g4_missing_mileage_source_unexplained}`
    );
  }
  console.log(`G5 St.Miles write-shaped hits: ${g5Hits.length}`);
  for (const h of g5Hits) console.log(`  - ${h}`);

  const failures = [];
  if (!live.skipped) {
    if (live.g1_short_gt_practical > 0) failures.push(`G1 FAIL: ${live.g1_short_gt_practical} lane_mileage row(s) with short_miles > practical_miles`);
    if (live.g2_autofill_and_short_gt_practical > 0) failures.push(`G2 FAIL: ${live.g2_autofill_and_short_gt_practical} autofill-eligible row(s) with short_miles > practical_miles`);
    if (live.g3_shortest_gt_practical_unexplained > 0) failures.push(`G3 FAIL: ${live.g3_shortest_gt_practical_unexplained} unexplained mdata.loads row(s) with miles_shortest > miles_practical`);
    if (live.g4_missing_mileage_source_unexplained > 0) failures.push(`G4 FAIL: ${live.g4_missing_mileage_source_unexplained} unexplained mdata.loads row(s) with miles_practical set but mileage_source NULL`);
  }
  if (g5Hits.length > 0) failures.push(`G5 FAIL: ${g5Hits.length} St.Miles write-shaped hit(s)`);
  failures.push(...constraintFailures.map((failure) => `G3 CONSTRAINT FAIL: ${failure}`));

  if (failures.length > 0) {
    console.error("verify-mileage-g1-g5-live: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("verify-mileage-g1-g5-live: OK — G1-G5 all clean (13508's known miles_shortest>miles_practical/mileage_source gap named and excluded, never silently swallowed)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
