#!/usr/bin/env node
/**
 * ROUND 304 T-49 — GUARD. "Do not query the most recent 72 hours. Miles from GPS; the tax needs the gallons."
 * FAILS IF ifta-miles.service.ts:
 *   1. calls Samsara before the 72 h processing-window check, or drops the 72 h constant;
 *   2. counts gallons that did not pass fuelPurchaseIneligibleReason;
 *   3. assigns a state-less fuel row to a jurisdiction (rows_without_state must stay counted, not placed);
 *   4. computes an MPG / miles-per-gallon ratio over gallons it cannot prove complete.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/telematics/ifta-miles.service.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(raw) {
  const src = stripComments(raw);
  const p = [];
  if (!/IFTA_PROCESSING_WINDOW_HOURS = 72;/.test(src)) p.push("the 72 h processing window constant is gone.");
  const gate = src.indexOf("iftaPeriodNotReady(input.period");
  const fetchAt = src.indexOf("input.fetchReport(");
  if (gate < 0 || fetchAt < 0 || gate > fetchAt) p.push("Samsara is queried before the 72 h processing-window check.");
  if (!/fuelPurchaseIneligibleReason\(f, \{ requirePumpTime: false \}\)/.test(src)) p.push("gallons are no longer gated by fuelPurchaseIneligibleReason.");
  if (!/if \(!f\.state\) \{\s*withoutState \+= 1;\s*continue;/.test(src)) p.push("state-less fuel rows are no longer counted-and-skipped.");
  if (/\/\s*\w*[gG]allons\b/.test(src) || /\bmpg\b/i.test(src)) p.push("an MPG ratio is computed -- gallons are not proven complete.");
  return p;
}

function selftest() {
  const good = readFileSync(FILE, "utf8");
  const cases = [
    [good, false],
    [good.replaceAll("IFTA_PROCESSING_WINDOW_HOURS = 72;", "IFTA_PROCESSING_WINDOW_HOURS = 0;"), true],
    [good.replaceAll("{ requirePumpTime: false }", "{ requirePumpTime: true }").replaceAll("fuelPurchaseIneligibleReason(f,", "x(f,"), true],
    [good.replaceAll("withoutState += 1;\n      continue;", "withoutState += 1;"), true],
    [good + "\nconst fleet_mpg = miles / total_gallons;", true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-ifta-miles-never-guesses selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-ifta-miles-never-guesses FAILED:\n  - ${p.join("\n  - ")}` : "verify-ifta-miles-never-guesses: OK -- 72 h window honoured, gated gallons only, state-less rows counted not placed, no MPG guess.");
  process.exit(p.length ? 1 : 0);
}
