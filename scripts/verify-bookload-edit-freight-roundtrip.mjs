#!/usr/bin/env node
/**
 * Book Load edit honesty — the mapper round-trips commodity/weight/reefer(temp)/trip_type.
 * The edit-mode banner must NOT claim those fields "aren't stored" (false honesty / theater).
 * Hazmat remains owner-excluded from edit PATCH (create-path only).
 *
 * CORRECTED (ACCT-F9508, migration 202613220000): this guard previously required a
 * `["reefer_setpoint", "reefer_setpoint_temp_f"]` SCALAR_FIELDS entry — that column name was NEVER
 * real (verified live on prod; see verify-dispatch-load-patch-commodity-column-missing-500.mjs).
 * The real reefer setpoint field has always been reefer_temp_f (render-v6 §B, migration
 * 202606231400), mapped as `["reefer_temp_f", "reefer_temp_f", ...]`. commodity + cargo_weight_lbs
 * are real as of migration 202613220000 and ARE required below.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bookload-edit-freight-roundtrip";
const SELFTEST = process.argv.includes("--selftest");

const MAPPER = "apps/frontend/src/pages/dispatch/components/book-load-v4/editLoadMapping.ts";
const MODAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive() {
  const problems = [];
  const mapper = read(MAPPER);
  const modal = read(MODAL);

  for (const needle of [
    '["commodity", "commodity"',
    '["weight_lbs", "cargo_weight_lbs"',
    '["reefer_temp_f", "reefer_temp_f"',
    '["trip_type", "trip_type"',
    "commodity: str(load.commodity)",
    "weight_lbs: num(load.cargo_weight_lbs)",
  ]) {
    if (!mapper.includes(needle)) problems.push(`${MAPPER}: missing ${needle}`);
  }
  // reefer_setpoint_temp_f was NEVER a real column (verified live) — must never be reintroduced.
  if (/\["reefer_setpoint(_temp_f)?"/.test(mapper)) {
    problems.push(`${MAPPER}: reintroduces phantom field "reefer_setpoint_temp_f" — the real column is reefer_temp_f`);
  }

  // Theater ban: must not claim commodity/weight aren't stored for edit.
  if (/aren.?t stored for edit yet/i.test(modal) && /Commodity,\s*weight/i.test(modal)) {
    problems.push(
      `${MODAL}: stale honesty banner still claims Commodity/weight aren't stored — Block 7 mapper round-trips them`
    );
  }
  if (!/book-load-edit-honesty/.test(modal)) {
    problems.push(`${MODAL}: missing data-testid=book-load-edit-honesty`);
  }
  if (!/round-trip on edit/i.test(modal)) {
    problems.push(`${MODAL}: edit honesty must state commodity/weight/trip/reefer round-trip`);
  }
  if (!/form\.register\("live_load_number"\)/.test(modal) || !/data-testid="book-load-live-load-number"/.test(modal)) {
    problems.push(`${MODAL}: live_load_number must be operator-editable for canonical historical dispatch linkage`);
  }
  for (const token of [
    "isEditMode && editLoadQuery.isError",
    'message="Could not load persisted load details." onRetry={() => void editLoadQuery.refetch()}',
    "if (isEditMode && !editLoad)",
    "Load details must finish loading before changes can be saved.",
    "form.formState.isSubmitting || (isEditMode && !editLoad)",
  ]) if (!modal.includes(token)) problems.push(`${MODAL}: edit-prefill failure contract missing ${token}`);

  return problems;
}

if (SELFTEST) {
  const baseline = assertLive();
  if (baseline.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL — baseline (current HEAD) is not clean:`, baseline);
    process.exit(1);
  }

  const mapper = read(MAPPER);
  const modal = read(MODAL);

  // Mutation 1: stale honesty banner claiming commodity/weight aren't stored.
  const brokenModal = modal.replace(
    /Commodity, weight, trip type, and reefer\/tarp\s*\n\s*settings<\/span> round-trip on edit\./,
    "Commodity, weight, trailer/trip type, hazmat and reefer settings</span> aren't stored for edit yet."
  );
  if (brokenModal === modal) {
    console.error(`${LABEL} SELFTEST FAIL — offender mutation did not change BookLoadModalV4.tsx honesty banner text; pattern out of sync`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(ROOT, MODAL), brokenModal);
  const failuresA = assertLive();
  fs.writeFileSync(path.join(ROOT, MODAL), modal); // restore immediately regardless of outcome
  if (failuresA.length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — planted stale honesty banner was NOT caught`);
    process.exit(1);
  }

  // Mutation 2: reintroduce the phantom reefer_setpoint_temp_f field (the pre-correction bug).
  const brokenMapper = mapper.replace(
    '["reefer_temp_f", "reefer_temp_f"',
    '["reefer_setpoint_temp_f", "reefer_setpoint_temp_f"'
  );
  if (brokenMapper === mapper) {
    console.error(`${LABEL} SELFTEST FAIL — offender mutation did not change editLoadMapping.ts; pattern out of sync`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(ROOT, MAPPER), brokenMapper);
  const failuresB = assertLive();
  fs.writeFileSync(path.join(ROOT, MAPPER), mapper); // restore immediately regardless of outcome
  if (failuresB.length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — planted phantom reefer_setpoint_temp_f field was NOT caught`);
    process.exit(1);
  }

  const brokenFailureLock = modal.replace("form.formState.isSubmitting || (isEditMode && !editLoad)", "form.formState.isSubmitting");
  fs.writeFileSync(path.join(ROOT, MODAL), brokenFailureLock);
  const failuresC = assertLive();
  fs.writeFileSync(path.join(ROOT, MODAL), modal);
  if (failuresC.length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — planted edit-prefill fail-open submit was NOT caught`);
    process.exit(1);
  }

  const brokenRetry = modal.replace("onRetry={() => void editLoadQuery.refetch()}", "onRetry={() => undefined}");
  fs.writeFileSync(path.join(ROOT, MODAL), brokenRetry);
  const failuresD = assertLive();
  fs.writeFileSync(path.join(ROOT, MODAL), modal);
  if (failuresD.length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — planted edit-prefill dead Retry was NOT caught`);
    process.exit(1);
  }

  const brokenLiveLoadNumber = modal.replace('form.register("live_load_number")', 'form.register("pickup_number")');
  fs.writeFileSync(path.join(ROOT, MODAL), brokenLiveLoadNumber);
  const failuresE = assertLive();
  fs.writeFileSync(path.join(ROOT, MODAL), modal);
  if (failuresE.length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — planted historical/live load-number disconnection was NOT caught`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — five planted regressions correctly caught; baseline clean`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — edit mapper round-trips freight fields; honesty banner not theater`);
