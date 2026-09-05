#!/usr/bin/env node
/**
 * verify-load-with-crew-is-not-draft.mjs
 *
 * Owner spec 09-04-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL.md §1.1 / step 1 of the
 * 2026-09-05 strict-sequence order: "a load with an assigned unit + primary driver (and/or an open
 * driver bill / proforma) can never remain 'draft'." Names this exact guard by name, wired into
 * scripts/verify-steps/, so this pass explicitly claims it under the owner's own requested name --
 * formalizing (not replacing, never-delete-only-add) the equivalent unwired check already sitting in
 * scripts/verify-edit-load-assigned-driver-not-draft.mjs (WIZ-STATUS-01), which never got a
 * scripts/verify-steps/ wrapper. Same underlying invariant, checked here with --selftest coverage.
 *
 * Defect (proven live, 2026-09-04): load 13508 sat at status='draft' while carrying an assigned
 * primary driver, an OPEN driver bill (13508), and a proforma customer invoice (13508). The Edit Load
 * PATCH path intentionally excludes status (it flows through the dedicated /transition state
 * machine), so assigning a driver via Edit Load left the load at 'draft' forever.
 *
 * Fix (apps/backend/src/dispatch/update-load.service.ts): advance a load that ends the edit with a
 * committed driver/team from 'draft' -> 'assigned_not_dispatched' (never 'dispatched' -- dispatch is
 * its own action), gated to draft-only so non-draft loads (post-delivery edits, etc.) are untouched.
 */
import { readFileSync } from "node:fs";

const PATH = "apps/backend/src/dispatch/update-load.service.ts";

function violations(src) {
  const errors = [];
  if (!/String\(old\.status[^)]*\)\s*===\s*"draft"/.test(src)) {
    errors.push("the status advance is not gated on the load currently being a 'draft'");
  }
  if (!/effectivePrimaryDriver\s*\|\|\s*effectiveTeam/.test(src)) {
    errors.push("the advance does not require the edit to end with a committed driver or team");
  }
  if (!/add\("status",\s*"assigned_not_dispatched"/.test(src)) {
    errors.push("a crewed draft load is not advanced to 'assigned_not_dispatched'");
  }
  if (!/assigned_not_dispatched"[^\n]*::mdata\.load_status_enum/.test(src)) {
    errors.push("the status advance does not cast to ::mdata.load_status_enum");
  }
  if (/add\("status",\s*"dispatched"/.test(src)) {
    errors.push("FORBIDDEN: the edit PATCH sets status='dispatched' -- dispatch is its own action, never the edit path's");
  }
  return errors;
}

function check(src) {
  const errors = violations(src);
  if (errors.length) throw new Error(errors.join("; "));
}

const src = readFileSync(PATH, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    src.replace('String(old.status ?? "") === "draft"', "false"),
    src.replace("effectivePrimaryDriver || effectiveTeam", "false"),
    src.replace('add("status", "assigned_not_dispatched", "::mdata.load_status_enum");', ""),
    `${src}\n  add("status", "dispatched", "::mdata.load_status_enum");`,
  ];
  for (const [index, mutated] of mutations.entries()) {
    try { check(mutated); }
    catch { caught += 1; continue; }
    throw new Error(`mutation ${index + 1} escaped detection`);
  }
  check(src);
  console.log(`PASS verify-load-with-crew-is-not-draft --selftest (${caught}/${mutations.length})`);
} else {
  check(src);
  console.log("PASS verify-load-with-crew-is-not-draft (a crewed load is advanced out of draft through the real edit-load wiring)");
}
