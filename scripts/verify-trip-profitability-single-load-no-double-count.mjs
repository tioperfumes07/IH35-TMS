#!/usr/bin/env node
/**
 * DISPATCH-F-TRIP-PROFITABILITY-SINGLE-LOAD-DOUBLE-COUNT — a "trip" that bookends only ONE real
 * load (s.first_load_id === s.last_load_id, no true NB+SB round trip) still joined
 * revenue/pay/fuel/maintenance/factoring-fee TWICE (once via the _nb alias, once via the _sb
 * alias) and summed both, silently doubling every dollar figure for every single-load trip.
 *
 * Live-reproduced + Neon-confirmed on 3 real trips before fixing: L-20260802-0258 (rate $1.00,
 * report showed Revenue $2.00), L-20260806-0008 (rate $1,875.50, report showed $3,751.00),
 * L-20260824-0007 (rate $1,200.00, report showed $2,400.00) — all exactly 2x. Driver pay doubled
 * identically (driver_bills summed to $1,105.00 for L-20260802-0258, report showed $2,210.00).
 * Corrected query re-run directly against live Neon prod after the fix: all 4 previously-doubled
 * trips now match their real source data exactly; every other (genuinely two-load) trip unchanged.
 *
 * Fix: only add the _sb side when sb_load_id is a genuinely different load from nb_load_id.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/dispatch/load-profitability.service.ts";
const METRICS = ["revenue_cents", "driver_pay_cents", "fuel_cents", "maintenance_cents", "factoring_fee_cents"];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function audit(source) {
  const failures = [];
  const stripped = stripComments(source);
  for (const metric of METRICS) {
    const re = new RegExp(
      `CASE WHEN t\\.sb_load_id IS NOT NULL AND t\\.sb_load_id != t\\.nb_load_id\\s*\\n\\s*THEN [^\\n]*\\s*\\n\\s*ELSE [^\\n]* END AS ${metric}\\b`
    );
    if (!re.test(stripped)) {
      failures.push(
        `${FILE}: ${metric} must be gated behind "sb_load_id != nb_load_id" (CASE WHEN) -- or single-load trips double-count it again`
      );
    }
  }
  return failures;
}

const source = fs.readFileSync(FILE, "utf8");
const failures = audit(source);

if (failures.length) {
  console.error(`verify-trip-profitability-single-load-no-double-count FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const total = METRICS.length;
  for (const metric of METRICS) {
    // Mutate just this one metric's CASE WHEN guard away, leaving the others intact, and confirm
    // the guard still flags exactly this metric (proves each metric is independently checked, not
    // one regex accidentally matching all five).
    const re = new RegExp(
      `CASE WHEN t\\.sb_load_id IS NOT NULL AND t\\.sb_load_id != t\\.nb_load_id\\s*\\n\\s*THEN ([^\\n]*)\\s*\\n\\s*ELSE ([^\\n]*) END AS ${metric}`
    );
    const match = source.match(re);
    if (!match) throw new Error(`could not locate the CASE WHEN block for ${metric} to mutate -- fix the test regex`);
    const mutated = source.replace(re, `${match[1]} AS ${metric}`);
    if (mutated === source) throw new Error(`mutation for ${metric} did not change source -- inert`);
    const mutFailures = audit(mutated);
    if (!mutFailures.some((f) => f.includes(metric))) throw new Error(`mutation escaped: ${metric} was not caught`);
    caught += 1;
  }
  console.log(`verify-trip-profitability-single-load-no-double-count SELFTEST PASS — ${caught}/${total} mutations detected`);
}

console.log(
  "verify-trip-profitability-single-load-no-double-count PASS — all 5 dollar metrics guard against single-load-trip double-counting"
);
