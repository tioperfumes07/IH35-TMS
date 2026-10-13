#!/usr/bin/env node
/**
 * DRV-ACTIVE-30D — Active drivers = activity in last 30 days; others Inactive.
 *
 * Pins:
 *  1. Migration 202612451400 exists with 30-day activity soft-deactivate + Terminated carve-out
 *  2. Service exports applyDriverActive30dRule + DRIVER_ACTIVE_THRESHOLD_DAYS === 30
 *  3. Daily worker wired in index.ts
 *  4. Drivers.tsx surfaces the 30-day Active definition
 *  5. --selftest mutates a fixture source copy and proves FAIL when threshold or Terminated carve-out removed
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const LABEL = "verify-driver-active-30d-activity";
const failures = [];

function fail(msg) {
  failures.push(msg);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    fail(`MISSING: ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

function assert(rel, src, re, label) {
  if (!src) return;
  if (!re.test(src)) fail(`${rel}: missing ${label}`);
}

const MIG = "db/migrations/202612451400_driver_active_30d_activity.sql";
const SVC = "apps/backend/src/mdata/driver-active-30d.service.ts";
const JOB = "apps/backend/src/jobs/driver-active-30d-worker.ts";
const IDX = "apps/backend/src/index.ts";
const FE = "apps/frontend/src/pages/Drivers.tsx";

const mig = read(MIG);
assert(MIG, mig, /interval '30 days'/, "30-day activity window");
assert(MIG, mig, /Terminated/, "Terminated carve-out");
assert(MIG, mig, /status = 'Inactive'/, "soft-deactivate to Inactive");
assert(MIG, mig, /vehicle_driver_assignments|assigned_primary_driver_id/, "load or drive activity signal");
assert(MIG, mig, /deactivated_at = COALESCE/, "sets deactivated_at without wiping prior");

const svc = read(SVC);
assert(SVC, svc, /export const DRIVER_ACTIVE_THRESHOLD_DAYS = 30/, "threshold constant = 30");
assert(SVC, svc, /export async function applyDriverActive30dRule/, "applyDriverActive30dRule export");
assert(SVC, svc, /assigned_primary_driver_id/, "load activity");
assert(SVC, svc, /vehicle_driver_assignments/, "drive activity");
assert(SVC, svc, /Terminated/, "never touch Terminated");

function sharedActivityFailures(source) {
  const needles = [
    "mdata.driver_company_authorizations load_activity_dca",
    "load_activity_dca.driver_id = d.id",
    "load_activity_dca.company_id = l.operating_company_id",
    "load_activity_dca.is_authorized = true",
    "load_activity_dca.deactivated_at IS NULL",
    "mdata.driver_company_authorizations telematics_activity_dca",
    "telematics_activity_dca.driver_id = d.id",
    "telematics_activity_dca.company_id = a.operating_company_id",
    "telematics_activity_dca.is_authorized = true",
    "telematics_activity_dca.deactivated_at IS NULL",
    "(l.assigned_primary_driver_id = d.id OR l.assigned_secondary_driver_id = d.id)",
  ];
  return needles.filter((needle) => !source.includes(needle));
}

for (const needle of sharedActivityFailures(svc)) fail(`${SVC}: missing ${needle}`);

const job = read(JOB);
assert(JOB, job, /applyDriverActive30dRule/, "worker calls apply");
assert(JOB, job, /initializeDriverActive30dWorker/, "worker export");

const idx = read(IDX);
assert(IDX, idx, /initializeDriverActive30dWorker/, "index wires worker");

// LEAD 443.99 class B (2026-10-12) — Drivers list copy.
//   old rule: the Active tab copy names the 30-day rule ("last 30 days").
//   new rule: the roster copy names the canonical Active definition — movement in the last 15 days (Rule 49) —
//             and never re-advertises the 30-day window as what "Active" means on the list.
//   why: RULE 49 (owner ruling 2026-09-05, .cursor/rules/49-active-entity-hardline.mdc, alwaysApply) made the
//        Drivers list's Active = Samsara movement in 15 days; ROUND 298.1 (#23495, 584f51c792) updated the copy.
//        The 30-day worker this guard locks is unchanged — it ages the stale HR status flag, which Rule 49 says
//        is NOT what Active means — so the list copy must describe the 15-day rule, not this one.
export function feCopyFailures(source) {
  const f = [];
  if (!/Active = movement in the last 15 days \(Rule 49\)/.test(source)) f.push("Active roster copy must name the Rule 49 15-day movement window");
  if (/Active = [^<]*last 30 days/.test(source)) f.push("Active roster copy must not define Active as the 30-day status rule");
  return f;
}
const fe = read(FE);
for (const f of feCopyFailures(fe)) fail(`${FE}: ${f}`);

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "drv-active-30d-"));
  const badMig = path.join(tmp, "bad.sql");
  fs.writeFileSync(
    badMig,
    mig.replace(/interval '30 days'/g, "interval '365 days'").replace(/Terminated/g, "NeverTouchMe")
  );
  const script = `
import fs from "node:fs";
const mig = fs.readFileSync(${JSON.stringify(badMig)}, "utf8");
const fails = [];
if (!/interval '30 days'/.test(mig)) fails.push("no-30d");
if (!/Terminated/.test(mig)) fails.push("no-terminated");
if (fails.length) { console.error(fails.join(",")); process.exit(1); }
process.exit(0);
`;
  const probe = path.join(tmp, "probe.mjs");
  fs.writeFileSync(probe, script);
  const r = spawnSync(process.execPath, [probe], { encoding: "utf8" });
  if (r.status === 0) {
    fail("--selftest: mutated migration (365d + no Terminated) must FAIL the probe");
  }
  const serviceMutations = [
    svc.replace("load_activity_dca.is_authorized = true", "load_activity_dca.is_authorized = false"),
    svc.replace("load_activity_dca.deactivated_at IS NULL", "load_activity_dca.deactivated_at IS NOT NULL"),
    svc.replace("telematics_activity_dca.is_authorized = true", "telematics_activity_dca.is_authorized = false"),
    svc.replace("telematics_activity_dca.deactivated_at IS NULL", "telematics_activity_dca.deactivated_at IS NOT NULL"),
    svc.replace(" OR l.assigned_secondary_driver_id = d.id", ""),
  ];
  const escaped = serviceMutations.filter((source) => sharedActivityFailures(source).length === 0);
  if (escaped.length > 0) fail(`--selftest: ${escaped.length}/${serviceMutations.length} shared-activity mutations escaped`);
  const copyMutations = [
    fe.replace("Active = movement in the last 15 days (Rule 49).", "Active = load or driving activity in the last 30 days."),
    fe.replace("Active = movement in the last 15 days (Rule 49).", "Status chips only."),
  ];
  const copyEscaped = copyMutations.filter((source) => source === fe || feCopyFailures(source).length === 0);
  if (copyEscaped.length > 0) fail(`--selftest: ${copyEscaped.length}/${copyMutations.length} Active-copy mutations escaped`);
}

if (process.argv.includes("--selftest")) {
  selftest();
}

if (failures.length) {
  console.error(`\n[${LABEL}] FAILED:\n`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — 30d active-driver rule wired (migration + service + worker + FE copy)`);
