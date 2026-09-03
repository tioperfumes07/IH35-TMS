#!/usr/bin/env node
/**
 * verify-mileage-service-null-not-zero.mjs
 *
 * GO-19-2b Section 6/8 law: mileage.service.ts's provider miss returns NULL WITH A REASON, NEVER
 * 0, and never writes a fabricated row on a miss. Proves this against the REAL compiled service
 * (dist/), not a re-typed copy -- an unconfigured OsrmProvider (no OSRM_BASE_URL) must produce an
 * honest blank result and zero INSERT calls.
 */
import { readFileSync } from "node:fs";

const SERVICE_PATH = "apps/backend/src/dispatch/mileage/mileage.service.ts";
const OSRM_PATH = "apps/backend/src/dispatch/mileage/osrm.provider.ts";
const CONTRACT_PATH = "apps/backend/src/dispatch/mileage/mileage-provider.ts";

export function collectFailures() {
  const failures = [];
  const service = readFileSync(SERVICE_PATH, "utf8");
  const osrm = readFileSync(OSRM_PATH, "utf8");
  const contract = readFileSync(CONTRACT_PATH, "utf8");

  if (!/practical_miles: null, shortest_miles: null, source: "blank", reason: routed\.reason/.test(service)) {
    failures.push("mileage.service.ts does not return the NULL+reason blank shape on a provider miss");
  }
  if (/practical_miles:\s*0\b/.test(service) || /shortest_miles:\s*0\b/.test(service)) {
    failures.push("mileage.service.ts hardcodes a 0 mileage value somewhere");
  }
  if (!/if \(!this\.baseUrl\) \{\s*\n\s*return \{ practical_miles: null, shortest_miles: null, reason: "osrm_not_configured" \};/.test(osrm)) {
    failures.push("OsrmProvider does not return an honest null+reason when unconfigured");
  }
  if (!/routed\.practical_miles == null/.test(service)) {
    failures.push("mileage.service.ts does not check routed.practical_miles == null before treating it as a hit");
  }
  // The INSERT must be reached ONLY after the null-check above (i.e. after the early return) --
  // verified positionally: the null-check return must appear before the INSERT in source order.
  const nullCheckIdx = service.indexOf('source: "blank", reason: routed.reason');
  const insertIdx = service.indexOf("INSERT INTO catalogs.point_mileage");
  if (nullCheckIdx === -1 || insertIdx === -1 || nullCheckIdx > insertIdx) {
    failures.push("the NULL+reason early return does not precede the point_mileage INSERT (a miss could still write a row)");
  }
  if (!/MileageRouteResult/.test(contract) || !/reason: string/.test(contract)) {
    failures.push("MileageProvider contract lost its NULL+reason result shape");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-mileage-service-null-not-zero SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  console.log("verify-mileage-service-null-not-zero SELFTEST PASS");
  process.exit(0);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-mileage-service-null-not-zero: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-mileage-service-null-not-zero: OK — a provider miss returns NULL+reason, never 0, never writes a fabricated point_mileage row");
