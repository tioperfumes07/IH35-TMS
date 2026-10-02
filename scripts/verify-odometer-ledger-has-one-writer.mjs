#!/usr/bin/env node
/**
 * ROUND 297.1 — GUARD: the odometer ledger has exactly one writer of each kind, and neither
 * crosses into the other's identity.
 *
 * FAILS IF:
 *   1. the snapshot cron (odometer-snapshot.cron.ts) calls the Samsara API directly.
 *   2. odometer-snapshot.cron.ts stamps read_at with now() instead of the position's own
 *      captured_at.
 *   3. odometer-snapshot.cron.ts skips a unit with a NULL odometer instead of recording an
 *      honest gap row.
 *   4. odometer-manual.routes.ts (the manual write route) sets source='samsara'.
 *   6. (CC-3 2c) any file other than the snapshot cron and odometer-manual-upsert.service.ts INSERTs into
 *      telematics.odometer_readings (a plain INSERT collides with the day-unique index).
 *   5. a second fault processor appears anywhere outside fault-code-processor.service.ts (a
 *      second INSERT INTO maintenance.samsara_fault_code_history).
 */
import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SNAPSHOT_CRON = resolve(ROOT, "apps/backend/src/telematics/odometer-snapshot.cron.ts");
// CC-3 2c: the one manual writer is the shared upsert both the manual route and the service-history backfill call.
const MANUAL_ROUTES = resolve(ROOT, "apps/backend/src/telematics/odometer-manual-upsert.service.ts");
const ODOMETER_WRITERS = ["apps/backend/src/telematics/odometer-snapshot.cron.ts", "apps/backend/src/telematics/odometer-manual-upsert.service.ts"];
const FAULT_PROCESSOR = "apps/backend/src/integrations/samsara/fault-code-processor.service.ts";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

export function checkSnapshotCronNeverCallsSamsara(source) {
  const problems = [];
  if (/SamsaraClient|samsara-client\.js|listVehicleStats|listVehicleLocations|listVehicleFaultCodes/.test(source)) {
    problems.push(
      "odometer-snapshot.cron.ts references the Samsara client/API -- J-1 must read ONLY from " +
        "telematics.vehicle_latest_position, never call Samsara directly (that would pay twice for " +
        "an odometer the position poller already fetched)."
    );
  }
  return problems;
}

export function checkSnapshotCronNeverStampsNow(source) {
  const problems = [];
  const insertMatch = source.match(/INSERT INTO telematics\.odometer_readings[\s\S]*?VALUES\s*\([\s\S]*?\)/);
  if (!insertMatch) {
    problems.push("could not find the odometer_readings INSERT in odometer-snapshot.cron.ts to check.");
    return problems;
  }
  const insertBlock = insertMatch[0];
  if (/\bnow\(\)/i.test(insertBlock)) {
    problems.push(
      "odometer-snapshot.cron.ts's INSERT into telematics.odometer_readings uses now() -- read_at " +
        "must be the position's own captured_at, never the time the cron happened to run."
    );
  }
  if (!/captured_at/.test(source)) {
    problems.push(
      "odometer-snapshot.cron.ts never references captured_at -- read_at has no honest source to " +
        "come from."
    );
  }
  return problems;
}

export function checkSnapshotCronNeverSkipsGap(source) {
  const problems = [];
  // The gap rule requires the INSERT to run unconditionally for every unit with a position row,
  // whether or not its odometer is present -- so the loop body must reach the INSERT call exactly
  // once per row with no early "continue"/"return" keyed on a null/missing odometer BEFORE it.
  const loopMatch = source.match(/for \(const row of rows\.rows\) \{[\s\S]*?\n\s*\}/);
  if (!loopMatch) {
    problems.push("could not find the per-unit snapshot loop in odometer-snapshot.cron.ts to check.");
    return problems;
  }
  const loopBody = loopMatch[0];
  const insertIndex = loopBody.indexOf("INSERT INTO telematics.odometer_readings");
  if (insertIndex === -1) {
    problems.push("the per-unit loop in odometer-snapshot.cron.ts never reaches the odometer_readings INSERT.");
    return problems;
  }
  const beforeInsert = loopBody.slice(0, insertIndex);
  if (/continue\s*;/.test(beforeInsert) || /return\s*;/.test(beforeInsert)) {
    problems.push(
      "odometer-snapshot.cron.ts's per-unit loop contains a continue/return before the INSERT -- a " +
        "unit with a null odometer must still get a recorded gap row (confidence='suggested'), " +
        "never be skipped."
    );
  }
  if (!/isGap/.test(loopBody) || !/confidence/.test(loopBody)) {
    problems.push(
      "odometer-snapshot.cron.ts's per-unit loop does not visibly branch measured/suggested " +
        "confidence -- the gap rule is not evidently implemented."
    );
  }
  return problems;
}

export function checkManualRouteNeverSetsSamsara(source) {
  const problems = [];
  const insertMatch = source.match(/INSERT INTO telematics\.odometer_readings[\s\S]*?VALUES\s*\([\s\S]*?\)/);
  if (!insertMatch) {
    problems.push("could not find the odometer_readings INSERT in odometer-manual.routes.ts to check.");
    return problems;
  }
  if (/'samsara'/.test(insertMatch[0])) {
    problems.push("odometer-manual.routes.ts's INSERT sets source='samsara' -- the manual route must always write source='manual'.");
  }
  if (!/'manual'/.test(insertMatch[0]) || !/'entered'/.test(insertMatch[0])) {
    problems.push("odometer-manual.routes.ts's INSERT does not hardcode source='manual'/confidence='entered'.");
  }
  return problems;
}

export function checkOnlyTwoOdometerWriters(files) {
  const extra = files.filter((f) => !ODOMETER_WRITERS.some((w) => f.endsWith(w))).filter((f) => {
    try { return /INSERT INTO telematics\.odometer_readings/.test(readFileSync(f, "utf8")); } catch { return false; }
  });
  return extra.length
    ? [`odometer_readings has a third writer: ${extra.map((f) => f.replace(ROOT + "/", "")).join(", ")} -- call upsertManualOdometerReading() (telematics/odometer-manual-upsert.service.ts) instead.`]
    : [];
}

export function checkExactlyOneFaultProcessor(files) {
  const problems = [];
  const writers = files.filter((f) => {
    if (!f.endsWith(FAULT_PROCESSOR)) {
      try {
        return /INSERT INTO maintenance\.samsara_fault_code_history/.test(readFileSync(f, "utf8"));
      } catch {
        return false;
      }
    }
    return false;
  });
  if (writers.length > 0) {
    problems.push(
      `a SECOND fault processor was found writing maintenance.samsara_fault_code_history outside ` +
        `${FAULT_PROCESSOR}: ${writers.map((f) => f.replace(ROOT + "/", "")).join(", ")}. J-3 must reuse ` +
        `the existing processor, never duplicate it.`
    );
  }
  return problems;
}

export function run() {
  const problems = [];

  let snapshotSource;
  try {
    snapshotSource = readFileSync(SNAPSHOT_CRON, "utf8");
  } catch {
    problems.push(`${SNAPSHOT_CRON.replace(ROOT + "/", "")} does not exist.`);
    snapshotSource = null;
  }
  if (snapshotSource != null) {
    problems.push(...checkSnapshotCronNeverCallsSamsara(snapshotSource));
    problems.push(...checkSnapshotCronNeverStampsNow(snapshotSource));
    problems.push(...checkSnapshotCronNeverSkipsGap(snapshotSource));
  }

  let manualSource;
  try {
    manualSource = readFileSync(MANUAL_ROUTES, "utf8");
  } catch {
    problems.push(`${MANUAL_ROUTES.replace(ROOT + "/", "")} does not exist.`);
    manualSource = null;
  }
  if (manualSource != null) {
    problems.push(...checkManualRouteNeverSetsSamsara(manualSource));
  }

  const allTsFiles = walk(resolve(ROOT, "apps/backend/src"));
  problems.push(...checkExactlyOneFaultProcessor(allTsFiles));
  problems.push(...checkOnlyTwoOdometerWriters(allTsFiles));

  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? "verify-odometer-ledger-has-one-writer: OK -- one snapshot writer, one manual writer, one fault processor."
        : `verify-odometer-ledger-has-one-writer FAILED:\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  let ok = true;
  const expect = (name, problems, wantFail) => {
    const failed = problems.length > 0;
    if (failed !== wantFail) {
      console.error(`SELFTEST FAIL: ${name} expected ${wantFail ? "a failure" : "no failure"}, got ${JSON.stringify(problems)}`);
      ok = false;
    }
  };

  // 1. snapshot cron calls Samsara directly -> FAIL
  expect(
    "snapshot cron calling Samsara",
    checkSnapshotCronNeverCallsSamsara(`import { SamsaraClient } from "../integrations/samsara/samsara-client.js";`),
    true
  );
  expect("snapshot cron clean of Samsara calls", checkSnapshotCronNeverCallsSamsara(`const x = 1;`), false);

  // 2. read_at = now() -> FAIL
  const nowBadSql = `
    INSERT INTO telematics.odometer_readings (
      operating_company_id, unit_id, read_at, odometer_miles, source, confidence
    )
    VALUES ($1::uuid, $2::uuid, now(), $4, 'samsara', $5)
  `;
  expect("read_at stamped with now()", checkSnapshotCronNeverStampsNow(nowBadSql + " captured_at"), true);
  const captureGoodSql = `
    row.captured_at
    INSERT INTO telematics.odometer_readings (
      operating_company_id, unit_id, read_at, odometer_miles, source, confidence
    )
    VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, 'samsara', $5)
  `;
  expect("read_at from captured_at", checkSnapshotCronNeverStampsNow(captureGoodSql), false);

  // 3. NULL odometer skipped -> FAIL
  const skipLoop = `
    for (const row of rows.rows) {
      const odometerMi = row.odometer_mi != null ? Number(row.odometer_mi) : null;
      const isGap = odometerMi == null;
      if (isGap) continue;
      const res = await client.query(\`
        INSERT INTO telematics.odometer_readings (
          operating_company_id, unit_id, read_at, odometer_miles, source, confidence
        )
        VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, 'samsara', $5)
      \`);
    }
  `;
  expect("gap row skipped via continue", checkSnapshotCronNeverSkipsGap(skipLoop), true);
  const recordGapLoop = `
    for (const row of rows.rows) {
      const odometerMi = row.odometer_mi != null ? Number(row.odometer_mi) : null;
      const isGap = odometerMi == null;
      const res = await client.query(\`
        INSERT INTO telematics.odometer_readings (
          operating_company_id, unit_id, read_at, odometer_miles, source, confidence
        )
        VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, 'samsara', $5)
      \`, [operatingCompanyId, row.unit_id, row.captured_at, isGap ? null : odometerMi, isGap ? "suggested" : "measured"]);
    }
  `;
  expect("gap row recorded, not skipped", checkSnapshotCronNeverSkipsGap(recordGapLoop), false);

  // 4. manual route sets source='samsara' -> FAIL
  const manualBadSql = `
    INSERT INTO telematics.odometer_readings (
      operating_company_id, unit_id, read_at, odometer_miles, source, confidence, recorded_by_user_id
    )
    VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, 'samsara', 'entered', $5::uuid)
  `;
  expect("manual route sets source=samsara", checkManualRouteNeverSetsSamsara(manualBadSql), true);
  const manualGoodSql = `
    INSERT INTO telematics.odometer_readings (
      operating_company_id, unit_id, read_at, odometer_miles, source, confidence, recorded_by_user_id
    )
    VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, 'manual', 'entered', $5::uuid)
  `;
  expect("manual route sets source=manual", checkManualRouteNeverSetsSamsara(manualGoodSql), false);

  // 5. a second fault processor -> FAIL
  const fixturePath = "/tmp/verify-odometer-selftest-second-processor.ts";
  writeFileSync(fixturePath, "INSERT INTO maintenance.samsara_fault_code_history");
  try {
    expect(
      "second fault processor detected",
      checkExactlyOneFaultProcessor([resolve(ROOT, FAULT_PROCESSOR), fixturePath]),
      true
    );
  } finally {
    unlinkSync(fixturePath);
  }
  expect("no second fault processor", checkExactlyOneFaultProcessor([resolve(ROOT, FAULT_PROCESSOR)]), false);

  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const passed = selftest();
    console.log(passed ? "verify-odometer-ledger-has-one-writer selftest PASS" : "verify-odometer-ledger-has-one-writer selftest FAIL");
    process.exit(passed ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
