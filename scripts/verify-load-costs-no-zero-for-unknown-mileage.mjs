#!/usr/bin/env node
/**
 * Spec 09-04-2026-Claude-Coder-1-Load-Costs-Board-19-Columns.md §5.4 / §2.3: "A dash is not a zero.
 * Empty Miles, Deadhead Pay, Rate Empty and every mileage column render blank with a reason on hover
 * when the producer could not compute them... carry the reason to the cell, do not coalesce it to 0
 * in SQL." A 0 in Empty Miles asserts the driver ran no empty miles and underpays him.
 */
import fs from "node:fs";

const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const BACKEND = "apps/backend/src/accounting/load-costs-board.routes.ts";

// Columns whose backend value must NEVER be COALESCE(...,0) -- a real NULL must survive to the client.
const NEVER_ZEROED_BACKEND_FIELDS = ["short_miles", "rate_loaded_cents", "empty_miles", "rate_empty_cents"];
// deadhead_pay_cents is a CASE expression (blank unless has_deadhead_miles), checked separately below.

function violations(board, backend) {
  const errors = [];
  for (const field of NEVER_ZEROED_BACKEND_FIELDS) {
    const re = new RegExp(`COALESCE\\([^)]*${field}[^)]*,\\s*0\\)`);
    if (re.test(backend)) errors.push(`${field} is wrapped in COALESCE(...,0) in the board SQL -- a real NULL (untracked mileage) would render as a false 0`);
  }
  if (!/CASE WHEN COALESCE\(dpa\.has_deadhead_miles, false\) THEN COALESCE\(dpa\.deadhead_pay_cents, 0\)(::text)? ELSE NULL END/.test(backend)) {
    errors.push("deadhead_pay_cents does not preserve NULL when the load's driver bill(s) never tracked deadhead miles");
  }
  // Frontend: each honesty-rule column must render blank (== null check), never a bare Number(...) that
  // would coerce null to 0.
  const frontendChecks = [
    ["short_miles", 'r.short_miles == null'],
    ["rate_loaded_cents", 'r.rate_loaded_cents == null'],
    ["empty_miles", 'r.empty_miles == null'],
    ["rate_empty_cents", 'r.rate_empty_cents == null'],
    ["deadhead_pay_cents", 'r.deadhead_pay_cents == null'],
  ];
  for (const [field, needle] of frontendChecks) {
    if (!board.includes(needle)) errors.push(`frontend does not null-check ${field} before rendering`);
  }
  return errors;
}

function check(board, backend) {
  const errors = violations(board, backend);
  if (errors.length) throw new Error(errors.join("; "));
}

const board = fs.readFileSync(BOARD, "utf8");
const backend = fs.readFileSync(BACKEND, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    { board, backend: backend.replace("dpd.short_miles::text AS short_miles,", "COALESCE(dpd.short_miles, 0)::text AS short_miles,") },
    { board, backend: backend.replace("dpd.empty_miles::text AS empty_miles,", "COALESCE(dpd.empty_miles, 0)::text AS empty_miles,") },
    { board, backend: backend.replace("CASE WHEN COALESCE(dpa.has_deadhead_miles, false) THEN COALESCE(dpa.deadhead_pay_cents, 0)::text ELSE NULL END", "COALESCE(dpa.deadhead_pay_cents, 0)::text") },
    { board: board.replace("r.empty_miles == null", "false"), backend },
    { board: board.replaceAll("r.deadhead_pay_cents == null", "false"), backend },
  ];
  for (const [index, source] of mutations.entries()) {
    try { check(source.board, source.backend); }
    catch { caught += 1; continue; }
    throw new Error(`mutation ${index + 1} escaped detection`);
  }
  check(board, backend);
  console.log(`PASS verify-load-costs-no-zero-for-unknown-mileage --selftest (${caught}/${mutations.length})`);
} else {
  check(board, backend);
  console.log("PASS verify-load-costs-no-zero-for-unknown-mileage (mileage/empty-pay columns preserve NULL end to end)");
}
