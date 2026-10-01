#!/usr/bin/env node
/**
 * ROUND 304 T-51 — GUARD. Samsara DVIRs land in safety.dvir_submissions (read by the WF-050 dispatch gate).
 * FAILS IF samsara-dvir-ingest.service.ts:
 *   1. stops being idempotent on client_request_id 'samsara-dvir:<id>' (ON CONFLICT ... DO UPDATE);
 *   2. attributes the DVIR to anyone but the SIGNER (signer_user_id) -- e.g. the assignment-table driver;
 *   3. writes an ambiguous signer instead of skipping it;
 *   4. derives has_major_defect from anything but safetyStatus 'unsafe';
 *   5. substitutes a default odometer / location / timestamp instead of skipping.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/safety/samsara-dvir-ingest.service.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(raw) {
  const src = stripComments(raw);
  const p = [];
  if (!/SAMSARA_DVIR_CLIENT_REQUEST_PREFIX = "samsara-dvir:"/.test(src) || !/ON CONFLICT \(operating_company_id, client_request_id\) WHERE client_request_id IS NOT NULL\s*DO UPDATE/.test(src)) p.push("ingest is no longer idempotent on client_request_id.");
  if (!/driversBySamsaraId\.get\(d\.signer_user_id\)/.test(src) || /driverAtTimeSql|vehicle_driver_assignments/.test(src)) p.push("the DVIR is no longer attributed to its signer.");
  if (!/if \(drivers\.size > 1\) return \{ skip: "signer_ambiguous" \}/.test(src)) p.push("an ambiguous signer is no longer skipped.");
  if (!/const unsafe = d\.safety_status === "unsafe";/.test(src) || !/has_major_defect: unsafe,/.test(src)) p.push("has_major_defect is no longer safetyStatus 'unsafe'.");
  for (const [re, what] of [[/if \(d\.odometer_meters == null\) return \{ skip: "no_odometer" \}/, "odometer"], [/if \(!d\.location\) return \{ skip: "no_location" \}/, "location"], [/if \(!at\) return \{ skip: "no_timestamp" \}/, "timestamp"]]) {
    if (!re.test(src)) p.push(`a missing ${what} is no longer skipped.`);
  }
  if (/new Date\(\)|now\(\)/.test(src)) p.push("the ingest uses the current clock -- submitted_at must be Samsara's own time.");
  return p;
}

function selftest() {
  const good = readFileSync(FILE, "utf8");
  const cases = [
    [good, false],
    [good.replace("DO UPDATE", "DO NOTHING"), true],
    [good.replace("driversBySamsaraId.get(d.signer_user_id)", "driversBySamsaraId.get(d.samsara_vehicle_id)"), true],
    [good.replace('if (drivers.size > 1) return { skip: "signer_ambiguous" };', ""), true],
    [good.replace('const unsafe = d.safety_status === "unsafe";', "const unsafe = false;"), true],
    [good.replace('if (!d.location) return { skip: "no_location" };', ""), true],
    [good.replace("const at = d.signed_at ?? d.end_time;", "const at = d.signed_at ?? d.end_time ?? new Date().toISOString();"), true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-samsara-dvir-ingest-never-guesses selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-samsara-dvir-ingest-never-guesses FAILED:\n  - ${p.join("\n  - ")}` : "verify-samsara-dvir-ingest-never-guesses: OK -- idempotent, signer-attributed, ambiguous skipped, unsafe = major, no defaults.");
  process.exit(p.length ? 1 : 0);
}
