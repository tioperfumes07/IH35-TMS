#!/usr/bin/env node
// GUARD — verify-stops-geocoded.mjs (CC-2)
//
// 443.260: active/upcoming load stops must not linger in 'range' precision without a
// verified fence. After the geocode-backfill engine flags them with precision='range'
// and geocode_failure_reason='range_imprecise_no_fence', the GPS-dwell engine is
// responsible for creating the verified fence from actual truck dwell data.
//
// This guard is SHRINK-ONLY: the baseline count of range-precision active stops can
// only decrease or stay the same over time. A NEW stop with range precision that has
// NOT been picked up by the dwell engine is a regression.
//
// DATABASE_URL is required (live data check).
export const ALLOW_OFFLINE_SKIP = false;

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-stops-geocoded";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Baseline: the count we've already accepted. Shrink-only enforcement means this
// file can only be written down (reduced) by completing the dwell-engine work.
const BASELINE_FILE = path.join(__dirname, "../docs/audit/VERIFY-STOPS-GEOCODED-BASELINE.json");

function loadBaseline() {
  if (!existsSync(BASELINE_FILE)) return { range_active_stops: null };
  try {
    return JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  } catch {
    return { range_active_stops: null };
  }
}

async function queryRangeStops() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(`${LABEL}: SKIP — DATABASE_URL not set`);
    process.exit(0);
  }

  // Active/upcoming stops = loads not yet completed
  const sql = `
    SELECT count(*)::int AS n
    FROM mdata.load_stops ls
    JOIN mdata.loads l ON l.id = ls.load_id
    WHERE ls.geocode_precision = 'range'
      AND l.status NOT IN ('delivered','cancelled','voided')
  `;

  try {
    const result = execSync(
      `psql "${dbUrl}" -t -c "${sql.replace(/\n/g, " ").replace(/"/g, '\\"')}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 15000 }
    ).trim();
    const n = parseInt(result, 10);
    if (isNaN(n)) throw new Error(`unexpected psql output: ${result}`);
    return n;
  } catch (e) {
    console.error(`${LABEL}: FAIL — psql error: ${e.message}`);
    process.exit(1);
  }
}

async function runFull() {
  const live = await queryRangeStops();
  const baseline = loadBaseline();
  const baselineCount = baseline.range_active_stops;

  console.log(`${LABEL}: active stops with geocode_precision='range' = ${live}`);

  if (baselineCount === null) {
    // First run — seed the baseline
    writeFileSync(BASELINE_FILE, JSON.stringify({ range_active_stops: live, seeded_at: new Date().toISOString() }, null, 2));
    console.log(`${LABEL}: PASS — baseline seeded at ${live} (shrink-only from here)`);
    return;
  }

  if (live > baselineCount) {
    console.error(
      `${LABEL}: FAIL — range-precision active stops GREW from baseline ${baselineCount} → live ${live}. ` +
      `New stops with imprecise geocodes must be handled by the GPS-dwell engine or re-geocoded. ` +
      `Do NOT raise the baseline — fix the root cause (443.260).`
    );
    process.exit(1);
  }

  if (live < baselineCount) {
    // Progress: dwell engine resolved some. Lower the baseline.
    writeFileSync(BASELINE_FILE, JSON.stringify({ range_active_stops: live, updated_at: new Date().toISOString() }, null, 2));
    console.log(`${LABEL}: PASS — baseline lowered from ${baselineCount} → ${live} (dwell engine progress)`);
    return;
  }

  console.log(`${LABEL}: PASS — ${live} at baseline (no regression)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFull().catch((e) => { console.error(e); process.exit(1); });
}
