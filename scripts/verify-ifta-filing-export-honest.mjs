#!/usr/bin/env node
/**
 * ROUND 306 E-23 addition — GUARD for the IFTA filing export.
 * FAILS IF ifta-filing.service.ts:
 *   1. builds the schedule from anything but this company's linked-unit miles;
 *   2. stops marking the export DRAFT when bought gallons fall short of the ECU burn (< 90%) or a fill has no state;
 *   3. emits tax dollars (no rates are on file -- gallons only);
 *   4. schedules a non-IFTA jurisdiction.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/telematics/ifta-filing.service.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(raw) {
  const s = stripComments(raw);
  const p = [];
  if (!/const basis = r\.linked_unit_miles;/.test(s)) p.push("the schedule is no longer built from this company's linked-unit miles.");
  if (!/totalGallons < burnedGallons \* 0\.9/.test(s)) p.push("the export no longer goes DRAFT when bought gallons fall short of the engine burn.");
  if (!/rows_without_state > 0\) draftReasons\.push/.test(s)) p.push("the export no longer goes DRAFT when a fill has no state.");
  if (/tax_due|tax_rate|_cents|dollars/i.test(s)) p.push("the export emits tax dollars; no rates are on file.");
  if (!/\.filter\(\(j\) => IFTA_MEMBER_JURISDICTIONS\.has\(j\)\)/.test(s)) p.push("non-IFTA jurisdictions can be scheduled.");
  return p;
}

function selftest() {
  const g = readFileSync(FILE, "utf8");
  const cases = [
    [g, false],
    [g.replace("const basis = r.linked_unit_miles;", "const basis = r.jurisdictions;"), true],
    [g.replace("totalGallons < burnedGallons * 0.9", "false"), true],
    [g + "\nconst tax_due = 1;", true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-ifta-filing-export-honest selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-ifta-filing-export-honest FAILED:\n  - ${p.join("\n  - ")}` : "verify-ifta-filing-export-honest: OK -- linked-unit miles, DRAFT on incomplete fuel, gallons only, IFTA members only.");
  process.exit(p.length ? 1 : 0);
}
