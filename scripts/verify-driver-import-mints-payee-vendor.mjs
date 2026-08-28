#!/usr/bin/env node
/**
 * LIAB-F9927-SILENT-CATCH-SWEEP (USMCA leg, GO-0013) — apps/backend/src/mdata/drivers-import.routes.ts's
 * bulk CSV importer (POST /api/v1/mdata/drivers/import, mode=commit) inserted rows straight into
 * mdata.drivers with no call to ensureDriverVendor(). Live-measured on USMCA (2026-08-28): 4 real
 * Active drivers, all created through this exact route on the same batch timestamp, had no
 * mdata.vendors payee — meaning they cannot be billed or paid through A/P (drivers are 1099
 * contractors; the vendor picker on bills/expenses does not contain a driver without a matching
 * mdata.vendors row). Same root cause the individual hire path (drivers.routes.ts) already fixed
 * (2026-08-09 measurement) — this importer was simply never swept.
 *
 * Fix mirrors the hire path's own pattern exactly: best-effort, audited on failure, never fails the
 * import; Terminated (rehire-history) rows are intentionally skipped — they get a payee again through
 * the normal hire flow if actually rehired, not through this importer.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const IMPORT_FILE = "apps/backend/src/mdata/drivers-import.routes.ts";

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function check(srcRaw) {
  const src = stripLineComments(srcRaw);
  const failures = [];

  if (!/ensureDriverVendor\(/.test(src)) {
    failures.push(`${IMPORT_FILE}: no ensureDriverVendor(...) call found — the bulk importer no longer mints a payee for newly-created Active drivers`);
  }

  // Must gate on Active only — Terminated rehire-history rows must NOT get a payee minted.
  if (!/r\.status === "Active"/.test(src)) {
    failures.push(`${IMPORT_FILE}: ensureDriverVendor call is not gated on r.status === "Active" — could mint a payee for a Terminated rehire-history contact`);
  }

  // Must not let a payee-provisioning failure abort the whole per-row import (best-effort law).
  if (!/appendCrudAudit[\s\S]{0,120}driver_payee_provision_failed/.test(src)) {
    failures.push(`${IMPORT_FILE}: no audited failure path for ensureDriverVendor — a payee-provisioning failure would go unrecorded`);
  }

  if (!src.includes("INSERT INTO mdata.drivers")) {
    failures.push(`${IMPORT_FILE}: expected mdata.drivers INSERT not found — guard out of sync`);
  }

  return failures;
}

function readSrc() {
  return fs.readFileSync(path.join(root, IMPORT_FILE), "utf8");
}

function run() {
  const failures = check(readSrc());
  if (failures.length > 0) {
    console.error("FAIL: driver-import-mints-payee-vendor");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: bulk driver importer mints a payee vendor for newly-created Active drivers");
}

function selftest() {
  const src = readSrc();
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Offender A: remove the ensureDriverVendor call entirely (the original defect).
  const offenderA = src.replace(/if \(r\.status === "Active"\) \{[\s\S]*?\n            \}\n/, "");
  if (offenderA === src) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender A (ensureDriverVendor call removed) was NOT caught");
    process.exit(1);
  }

  // Offender B: widen the gate so Terminated rows also get a payee minted.
  const offenderB = src.replace('r.status === "Active"', "true");
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender B (Active-only gate widened) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
