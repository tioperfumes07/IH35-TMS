#!/usr/bin/env node
/**
 * DISP-F6176-PWA-DEPARTURE-REJECTS-AUTHORIZED-SHARED-DRIVER — same class as the DRV-F61xx/F62xx
 * sweep. Both driver-PWA departure endpoints (dispatch-view.routes.ts and driver/loads.routes.ts)
 * gated on the assigned driver's HOME company equalling the load's company, so an active authorized
 * shared driver could open the dispatch view (DRV-F6175, already fixed) but got a false forbidden
 * when actually tapping departure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-driver-pwa-departure-shared-driver";

const CHECKS = [
  [
    "apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts",
    /departure_stop_dca\.driver_id = drv\.id[\s\S]{0,180}departure_stop_dca\.company_id = l\.operating_company_id[\s\S]{0,180}departure_stop_dca\.is_authorized = true[\s\S]{0,180}departure_stop_dca\.deactivated_at IS NULL/,
  ],
  [
    "apps/backend/src/driver/loads.routes.ts",
    /driver_loads_depart_dca\.driver_id = \$3[\s\S]{0,180}driver_loads_depart_dca\.company_id = l\.operating_company_id[\s\S]{0,180}driver_loads_depart_dca\.is_authorized = true[\s\S]{0,180}driver_loads_depart_dca\.deactivated_at IS NULL/,
  ],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) {
      failures.push(`${file}: departure gate must admit home-company OR active mdata.driver_company_authorizations, not company equality alone`);
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
console.log(`${LABEL} PASS — both driver-PWA departure gates admit authorized shared drivers`);
process.exit(0);
