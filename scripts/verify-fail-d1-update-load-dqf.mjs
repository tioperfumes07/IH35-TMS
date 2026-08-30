#!/usr/bin/env node
/**
 * FAIL-D1 — Edit Load (updateDispatchLoad) must call assertDriverQualifiedForLoad when
 * assigned_primary_driver_id changes, matching book-load.service.ts and quicksave.service.ts.
 *
 * Run: node scripts/verify-fail-d1-update-load-dqf.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/dispatch/update-load.service.ts";
const ROUTES = "apps/backend/src/dispatch/loads.routes.ts";
const GATE = "assertDriverQualifiedForLoad";
const LABEL = "verify-fail-d1-update-load-dqf";

export function run() {
  const errors = [];
  const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const routes = fs.readFileSync(path.join(ROOT, ROUTES), "utf8");

  if (!src.includes(`${GATE}(client,`)) {
    errors.push(`${TARGET} must call ${GATE} when driver assignment changes (FAIL-D1)`);
  }
  if (!src.includes("DriverNotQualifiedError")) {
    errors.push(`${TARGET} must throw DriverNotQualifiedError when the gate blocks`);
  }
  if (!/assigned_primary_driver_id/.test(src)) {
    errors.push(`${TARGET} must detect assigned_primary_driver_id changes before UPDATE`);
  }
  const gateIdx = src.indexOf(`${GATE}(client,`);
  const updateIdx = src.indexOf("UPDATE mdata.loads SET");
  if (gateIdx === -1 || updateIdx === -1 || gateIdx > updateIdx) {
    errors.push(`${TARGET}: ${GATE} must run before the mdata.loads UPDATE`);
  }
  if (!routes.includes("DriverNotQualifiedError")) {
    errors.push(`${ROUTES} must map DriverNotQualifiedError to HTTP 422 on PATCH /dispatch/loads/:id`);
  }

  return errors;
}

function selftest() {
  const targetPath = path.join(ROOT, TARGET);
  const backup = fs.readFileSync(targetPath, "utf8");
  try {
    const broken = backup.replace(`${GATE}(client,`, "/* removed gate */(");
    fs.writeFileSync(targetPath, broken, "utf8");
    const planted = run();
    if (!planted.some((e) => e.includes(`must call ${GATE} when driver assignment changes`))) {
      throw new Error("planted gate removal not detected");
    }
    console.log(`[${LABEL}] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(targetPath, backup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error(`\n[${LABEL}] FAILED:\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] All checks passed ✓`);
}

main();
