#!/usr/bin/env node
// ROUND 155.23 item 6 / 157-A item 6: "13614's lane reads LAREDO, TX -> LAREDO, TX on a
// 1,137.4-mile load. Both stops are Laredo. A 1,137-mile load cannot start and end in the same
// city." Root cause, live-confirmed: the delivery stop was a literal copy of the pickup stop
// (same city/state/postal_code, same actual_arrival_at timestamp) — a data-entry/import artifact,
// not a real short-haul or round-trip load. Fixed by reading the real signed settlement document
// (Driver_Settlement_5818.pdf): real destination is CONLEY, GA, real loaded miles 1,111.6mi.
//
// This guard is the permanent gate: a load whose first and last scheduled stop share the same
// city (case-insensitive) while its own recorded miles exceed 100 fails — that combination is
// never physically possible and always means copied/corrupted stop data, never a real load.
// Loads at or under 100 miles are exempt (a genuine short-haul or empty-repositioning round trip
// through the same city is physically real at that distance).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-stop-lane-is-consistent-with-miles";
const MILES_THRESHOLD = 100;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = path.join(ROOT, "scripts/verify-stop-lane-is-consistent-with-miles.baseline.json");
export const REQUIRES_LIVE_DB =
  "live-data ratchet: same-city first/last stop with miles > 100; fails closed via requireLiveDbOrExit";

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

export function findViolation(row) {
  const miles = Number(row.miles_practical ?? row.miles_shortest ?? row.loaded_miles ?? 0);
  if (!(miles > MILES_THRESHOLD)) return null;
  const first = String(row.first_city ?? "").trim().toUpperCase();
  const last = String(row.last_city ?? "").trim().toUpperCase();
  if (!first || !last) return null;
  if (first === last) {
    return `load ${row.load_number}: first and last stop both "${first}" but recorded miles = ${miles} (> ${MILES_THRESHOLD})`;
  }
  return null;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  t("same city, long miles -> violation", findViolation({ load_number: "X", first_city: "Laredo", last_city: "LAREDO", miles_practical: 1137.4 }) !== null);
  t("different cities, long miles -> clean", findViolation({ load_number: "X", first_city: "Laredo", last_city: "Conley", miles_practical: 1111.6 }) === null);
  t("same city, short miles (<=100) -> clean (real local/repositioning trip)", findViolation({ load_number: "X", first_city: "Laredo", last_city: "Laredo", miles_practical: 45 }) === null);
  t("same city, no miles captured yet -> clean (nothing to contradict)", findViolation({ load_number: "X", first_city: "Laredo", last_city: "Laredo", miles_practical: null }) === null);
  t("missing city data -> clean (nothing to compare)", findViolation({ load_number: "X", first_city: null, last_city: null, miles_practical: 500 }) === null);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 5 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const res = await client.query(`
      SELECT l.load_number, l.miles_practical, l.miles_shortest, l.loaded_miles,
             (SELECT s1.city FROM mdata.load_stops s1 WHERE s1.load_id = l.id AND s1.soft_deleted_at IS NULL ORDER BY s1.sequence_number ASC LIMIT 1) AS first_city,
             (SELECT s2.city FROM mdata.load_stops s2 WHERE s2.load_id = l.id AND s2.soft_deleted_at IS NULL ORDER BY s2.sequence_number DESC LIMIT 1) AS last_city
        FROM mdata.loads l
       WHERE l.soft_deleted_at IS NULL
    `);
    await client.query("ROLLBACK");

    const violatingLoadNumbers = res.rows.filter((r) => findViolation(r) !== null).map((r) => r.load_number);
    const baseline = loadBaseline();
    const baselineSet = new Set(baseline?.load_numbers ?? []);
    const newRot = violatingLoadNumbers.filter((ln) => !baselineSet.has(ln));

    if (newRot.length > 0) {
      console.error(`${LABEL}: FAIL — new rot, not in baseline: ${newRot.join(", ")}`);
      process.exit(1);
    }
    const nowClean = [...baselineSet].filter((ln) => !violatingLoadNumbers.includes(ln));
    console.log(
      `${LABEL}: PASS — ${res.rows.length} load(s) checked, ${violatingLoadNumbers.length} known baselined violation(s) (ceiling ${baselineSet.size})` +
        (nowClean.length ? `; ${nowClean.length} now clean — shrink the baseline: ${nowClean.join(", ")}` : "")
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
