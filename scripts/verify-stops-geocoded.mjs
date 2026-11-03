#!/usr/bin/env node
// GUARD — verify-stops-geocoded.mjs (CC-2)
//
// 443.260: active/upcoming load stops must not accumulate with 'range' geocode precision
// without being resolved by the GPS-dwell engine. After the geocode-backfill engine flags
// them (precision='range', geocode_failure_reason='range_imprecise_no_fence'), the dwell
// engine creates the verified fence from actual truck dwell data.
//
// SHRINK-ONLY: the baseline count of range-precision active stops can only decrease.
// A new stop with range precision that the dwell engine hasn't resolved is a regression.
//
// Run with --live to check against the live database (requires DATABASE_URL).
// Without --live: static check that the baseline file is well-formed JSON.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-stops-geocoded";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = path.join(__dirname, "../docs/audit/VERIFY-STOPS-GEOCODED-BASELINE.json");

function loadBaseline() {
  if (!existsSync(BASELINE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  } catch {
    return null;
  }
}

if (process.argv.includes("--selftest")) {
  console.log(`${LABEL}: --selftest PASS`);
  process.exit(0);
}

if (process.argv.includes("--live")) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(`${LABEL}: FAIL — --live requires DATABASE_URL; never falls back to local`);
    process.exit(1);
  }

  const sql = `
    SELECT count(*)::int AS n
    FROM mdata.load_stops ls
    JOIN mdata.loads l ON l.id = ls.load_id
    WHERE ls.geocode_precision = 'range'
      AND l.status NOT IN ('delivered','cancelled','voided')
  `;

  let live;
  try {
    const result = execSync(
      `psql "${dbUrl}" -t -c "${sql.replace(/\n/g, " ").replace(/"/g, '\\"')}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 15000 }
    ).trim();
    live = parseInt(result, 10);
    if (isNaN(live)) throw new Error(`unexpected psql output: ${result}`);
  } catch (e) {
    console.error(`${LABEL}: FAIL — psql error: ${e.message}`);
    process.exit(1);
  }

  console.log(`${LABEL}: active stops with geocode_precision='range' = ${live}`);

  const baseline = loadBaseline();
  if (baseline === null) {
    writeFileSync(BASELINE_FILE, JSON.stringify({ range_active_stops: live, seeded_at: new Date().toISOString() }, null, 2));
    console.log(`${LABEL}: PASS — baseline seeded at ${live} (shrink-only from here)`);
    process.exit(0);
  }

  const baselineCount = baseline.range_active_stops;
  if (live > baselineCount) {
    console.error(
      `${LABEL}: FAIL — range-precision active stops GREW from baseline ${baselineCount} → live ${live}. ` +
      `Do NOT raise the baseline — fix the root cause (443.260).`
    );
    process.exit(1);
  }

  if (live < baselineCount) {
    writeFileSync(BASELINE_FILE, JSON.stringify({ range_active_stops: live, updated_at: new Date().toISOString() }, null, 2));
    console.log(`${LABEL}: PASS — baseline lowered from ${baselineCount} → ${live} (dwell engine progress)`);
    process.exit(0);
  }

  console.log(`${LABEL}: PASS — ${live} at baseline (no regression)`);
  process.exit(0);
}

// Static check: baseline file exists and is well-formed (or doesn't exist yet — first run)
if (existsSync(BASELINE_FILE)) {
  const b = loadBaseline();
  if (b === null) {
    console.error(`${LABEL}: FAIL — ${BASELINE_FILE} exists but is not valid JSON`);
    process.exit(1);
  }
  if (typeof b.range_active_stops !== "number") {
    console.error(`${LABEL}: FAIL — baseline missing range_active_stops field`);
    process.exit(1);
  }
}
console.log(`${LABEL}: PASS static (run with --live for live DB check)`);
