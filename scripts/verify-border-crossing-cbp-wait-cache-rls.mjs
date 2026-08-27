#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SQL_FILE = "db/migrations/0313_border_crossing_wizard.sql";
const SVC_FILE = "apps/backend/src/border-crossing/cbp-wait-times.service.ts";

export function check({ sql, svc }) {
  const failures = [];
  if (!sql.includes("cbp_wait_cache_read")) {
    failures.push(`${SQL_FILE}: cbp_wait_cache_read policy missing`);
  }
  if (!sql.includes("ENABLE ROW LEVEL SECURITY")) {
    failures.push(`${SQL_FILE}: RLS not enabled on cbp_wait_times_cache`);
  }
  if (!sql.includes("identity.is_lucia_bypass()")) {
    failures.push(`${SQL_FILE}: lucia bypass guard missing for cache writes`);
  }
  if (!/withLuciaBypass\(async/.test(svc)) {
    failures.push(`${SVC_FILE}: cacheCbpWaitTimes must wrap INSERT in withLuciaBypass(async …)`);
  }
  const insertIdx = svc.indexOf("INSERT INTO reference.cbp_wait_times_cache");
  const wrapIdx = svc.indexOf("withLuciaBypass(async");
  if (insertIdx < 0) {
    failures.push(`${SVC_FILE}: INSERT INTO reference.cbp_wait_times_cache missing`);
  } else if (wrapIdx < 0 || wrapIdx > insertIdx) {
    failures.push(`${SVC_FILE}: withLuciaBypass(async …) must wrap the cache INSERT`);
  }
  return failures;
}

function readAll() {
  return {
    sql: fs.readFileSync(path.join(ROOT, SQL_FILE), "utf8"),
    svc: fs.readFileSync(path.join(ROOT, SVC_FILE), "utf8"),
  };
}

function run() {
  const failures = check(readAll());
  if (failures.length) {
    console.error("verify:border-crossing-cbp-wait-cache-rls FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify:border-crossing-cbp-wait-cache-rls PASS");
}

function selftest() {
  const src = readAll();
  const offender = { ...src, svc: src.svc.replace("withLuciaBypass(async", "NOT_LUCIA(async") };
  if (check(offender).length === 0) {
    console.error("FAIL(selftest): planted missing lucia wrap was NOT caught");
    process.exit(1);
  }
  if (check(src).length !== 0) {
    console.error("FAIL(selftest): current sources must PASS");
    process.exit(1);
  }
  console.log("PASS(selftest): verify-border-crossing-cbp-wait-cache-rls");
}

if (process.argv.includes("--selftest")) selftest();
else run();
