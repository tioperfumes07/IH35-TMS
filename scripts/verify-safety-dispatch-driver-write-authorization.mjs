#!/usr/bin/env node
/**
 * DRV-F6220 / DISP-F6222 — same class as the DRV-F61xx/F62xx read-side sweep (GUARD-WORKORDERS.md),
 * write-side instances: HOS-violation create, DOT-inspection create, and dispatch HOS-eligibility
 * all scoped a driver to the CURRENT company only (`d.operating_company_id = $N`), rejecting (or, for
 * the dispatch eligibility read, silently passing) an actively authorized SHARED driver — one whose
 * home company differs from the company dispatching/creating against. Same shape, three call sites.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-dispatch-driver-write-authorization";

const CHECKS = [
  [
    "apps/backend/src/routes/safety/hos-violations.ts",
    /hos_create_driver_dca\.driver_id = d\.id[\s\S]{0,180}hos_create_driver_dca\.company_id = \$1::uuid[\s\S]{0,180}hos_create_driver_dca\.is_authorized = true[\s\S]{0,180}hos_create_driver_dca\.deactivated_at IS NULL/,
  ],
  [
    "apps/backend/src/routes/safety/dot-inspections.ts",
    /dot_create_driver_dca\.driver_id = d\.id[\s\S]{0,180}dot_create_driver_dca\.company_id = \$1::uuid[\s\S]{0,180}dot_create_driver_dca\.is_authorized = true[\s\S]{0,180}dot_create_driver_dca\.deactivated_at IS NULL/,
  ],
  [
    "apps/backend/src/dispatch/driver-availability.service.ts",
    /dispatch_hos_dca\.driver_id = d\.id[\s\S]{0,180}dispatch_hos_dca\.company_id = \$2::uuid[\s\S]{0,180}dispatch_hos_dca\.is_authorized = true[\s\S]{0,180}dispatch_hos_dca\.deactivated_at IS NULL/,
  ],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) {
      failures.push(`${file}: driver write/eligibility check must admit home-company OR active mdata.driver_company_authorizations, not company equality alone`);
    }
  }
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set(CHECKS.map(([f]) => f))];
  return Object.fromEntries(uniqueFiles.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadFiles(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [file, pattern] of CHECKS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
    const mutated = { ...good, [file]: good[file].replace(new RegExp(pattern.source, flags), "REMOVED") };
    if (mutated[file] === good[file]) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadFiles(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — HOS/DOT create + dispatch HOS-eligibility admit authorized shared drivers`);
process.exit(0);
