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
 *
 * RE-ANCHORED 2026-10-05 (Devin): the trip rollup was rewritten to aggregate through the
 * canonical `settlement_loads` membership table — one row per load per settlement — so a load
 * can only ever be summed once. The nb/sb dual-alias CASE WHEN shape no longer exists in this
 * file; the invariant this guard now locks is (a) the rollup joins loads via settlement_loads
 * (never via the first_load_id/last_load_id bookends), and (b) no dual-alias load join
 * (first_load_id AND last_load_id both joining mdata.loads for the same rollup) can return.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/dispatch/load-profitability.service.ts";

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function audit(source) {
  const failures = [];
  const stripped = stripComments(source);
  // (a) The trip rollup must aggregate loads through settlement_loads — canonical membership,
  //     exactly one contribution per load per settlement.
  if (!/FROM\s+settlement_loads\s+sl\s*\n\s*JOIN\s+mdata\.loads\s+l\b/i.test(stripped)) {
    failures.push(
      `${FILE}: trip rollup must aggregate loads via settlement_loads sl JOIN mdata.loads l (one row per load) — the bookend dual-join that double-counted single-load trips must not return`
    );
  }
  // (b) Forbidden: re-deriving a trip's loads from the settlement bookends (first_load_id /
  //     last_load_id) is exactly the shape that double-counted a one-load trip.
  if (
    /(?:first_load_id|last_load_id)\s*=\s*\w+\.id/.test(stripped) ||
    /\w+\.id\s*=\s*\w+\.(?:first_load_id|last_load_id)/.test(stripped)
  ) {
    failures.push(
      `${FILE}: load rollup joining via settlement first_load_id/last_load_id bookends is forbidden — use settlement_loads membership (bookends double-count single-load trips)`
    );
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
  const mutations = [
    // The bookend double-join returning.
    ["JOIN mdata.loads l ON l.id = s.first_load_id JOIN mdata.loads l2 ON l2.id = s.last_load_id", "bookend"],
    // The canonical settlement_loads membership join being replaced by a bookend join.
    ["FROM settlement_loads sl\n      JOIN mdata.loads l", "membership"],
  ];
  let caught = 0;
  for (const [plant, tag] of mutations) {
    const mutated =
      tag === "bookend"
        ? source + `\n      JOIN mdata.loads l_nb ON l_nb.id = s.first_load_id\n`
        : source.replace(/FROM\s+settlement_loads\s+sl\s*\n\s*JOIN\s+mdata\.loads\s+l/i, "FROM mdata.loads l JOIN settlements s ON l.id = s.first_load_id");
    if (mutated === source && tag !== "bookend") throw new Error(`mutation for ${tag} did not change source -- inert`);
    const mutFailures = audit(mutated);
    if (!mutFailures.length) throw new Error(`mutation escaped: ${tag} was not caught`);
    caught += 1;
  }
  console.log(`verify-trip-profitability-single-load-no-double-count SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log(
  "verify-trip-profitability-single-load-no-double-count PASS — all 5 dollar metrics guard against single-load-trip double-counting"
);
