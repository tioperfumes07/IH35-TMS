#!/usr/bin/env node
/**
 * verify-load-costs-board-trailer-unit-columns.mjs
 *
 * LIVE-CONFIRMED HTTP 500 (2026-09-03) on GET /api/v1/accounting/load-costs-board -- the freshly
 * shipped Load Costs Board (PASTE-ALL-SEATS Packet A) joined two columns that do not exist:
 *
 *   1. `l.trailer_id` -- mdata.loads has NO trailer_id column, ever, on any environment. This
 *      exact defect class is documented and already fixed at least three times elsewhere in this
 *      codebase (book-load.service.ts "W-FIX-3b", loads.routes.ts:991 "That non-existent column
 *      500'd", quick-assign.service.ts, assignments/quicksave.service.ts) -- the ONLY real
 *      trailer<->load link is dispatch.load_assignment_history.new_trailer_id (mdata.equipment),
 *      resolved via the most recent assignment-history row. This guard exists because a fourth
 *      file reintroduced the same already-fixed-elsewhere bug.
 *   2. `u.operating_company_id` -- mdata.units has owner_company_id / currently_leased_to_company_id,
 *      never operating_company_id (see db/migrations/0015_company_scoping.sql). The correct
 *      predicate is COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = <company>.
 *
 * Scoped to this one file (not a codebase-wide SQL scanner) -- pins the specific regression this
 * board just had, at the same fidelity as the sibling loads.routes.ts pattern it must match.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/accounting/load-costs-board.routes.ts";

function violations(src) {
  const errors = [];
  if (/\bl\.trailer_id\b/.test(src)) {
    errors.push("re-introduces l.trailer_id -- mdata.loads has no such column; use dispatch.load_assignment_history.new_trailer_id");
  }
  if (/\bu\.operating_company_id\b/.test(src)) {
    errors.push("re-introduces u.operating_company_id on mdata.units -- use COALESCE(u.currently_leased_to_company_id, u.owner_company_id)");
  }
  if (!/dispatch\.load_assignment_history/.test(src)) {
    errors.push("no longer resolves the trailer via dispatch.load_assignment_history -- the only real trailer<->load link");
  }
  if (!/COALESCE\(u\.currently_leased_to_company_id,\s*u\.owner_company_id\)/.test(src)) {
    errors.push("mdata.units join no longer scopes via COALESCE(currently_leased_to_company_id, owner_company_id)");
  }
  return errors;
}

function check(src) {
  const errors = violations(src);
  if (errors.length) throw new Error(errors.join("; "));
}

const src = fs.readFileSync(FILE, "utf8");

if (process.argv.includes("--selftest")) {
  const mutations = [
    src.replace(
      /LEFT JOIN LATERAL \(\s*SELECT eq\.equipment_number[\s\S]*?\) tr ON true/,
      "LEFT JOIN mdata.equipment tr ON tr.id=l.trailer_id AND tr.operating_company_id=l.operating_company_id",
    ),
    src.replace(
      "COALESCE(u.currently_leased_to_company_id, u.owner_company_id)=l.operating_company_id",
      "u.operating_company_id=l.operating_company_id",
    ),
  ];
  let caught = 0;
  for (const [index, mutated] of mutations.entries()) {
    try {
      check(mutated);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error(`selftest mutation ${index + 1} escaped detection`);
  }
  try {
    check(src);
  } catch (error) {
    throw new Error(`selftest good file failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (caught !== mutations.length) throw new Error(`selftest caught ${caught}/${mutations.length} planted regressions`);
  console.log(`PASS verify-load-costs-board-trailer-unit-columns --selftest (${caught}/${mutations.length})`);
} else {
  check(src);
  console.log("PASS verify-load-costs-board-trailer-unit-columns");
}
