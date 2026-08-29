#!/usr/bin/env node
/**
 * verify-mdata-loads-patch-writes-assignment-history.mjs
 *
 * SCEN-01 hop.assign — PATCH /api/v1/mdata/loads/:id (mdata/loads.routes.ts) was the only
 * driver/unit assignment writer that never recorded dispatch.load_assignment_history
 * (book-load.service.ts, quick-assign.service.ts, dispatch-refinements.service.ts, and
 * assignments/quicksave.service.ts all do). It only wrote a generic, untyped appendCrudAudit
 * "mdata.loads.assigned" info-log entry -- not the dedicated typed previous/new driver+unit table
 * other features, including this scenario's own live probe (apps/backend/src/home/
 * scenario-registry.ts, key "hop.assign"), join against. Live-verified 2026-08-29: 4 real driver
 * bills already correctly priced from the rate card (the money mechanism was fine) had ZERO
 * matching dispatch.load_assignment_history rows -- permanently masking the probe behind a false
 * empty.
 *
 * Guards that the PATCH handler's assignment-change branch still contains BOTH the appendCrudAudit
 * call (kept, not narrowed) AND an INSERT INTO dispatch.load_assignment_history gated on a real
 * primary-driver/unit change (never a no-op on secondary/team-only edits).
 */
import { readFileSync } from "node:fs";

const routesPath = "apps/backend/src/mdata/loads.routes.ts";
const src = readFileSync(routesPath, "utf8");

const failures = [];

if (!/"mdata\.loads\.assigned"/.test(src)) {
  failures.push(`${routesPath}: the mdata.loads.assigned appendCrudAudit call is gone -- this guard's anchor is missing`);
}

if (!/INSERT INTO dispatch\.load_assignment_history/.test(src)) {
  failures.push(`${routesPath}: PATCH /api/v1/mdata/loads/:id no longer writes dispatch.load_assignment_history -- hop.assign's probe (and any other feature joining on this table) goes blind again for loads assigned through the office edit path`);
}

// The INSERT must be gated on a REAL primary-driver/unit change, not fire unconditionally (which
// would flood the table with no-op rows on every unrelated field PATCH).
if (!/oldRow\.assigned_unit_id !== row\.assigned_unit_id \|\|\s*\n\s*oldRow\.assigned_primary_driver_id !== row\.assigned_primary_driver_id\s*\n\s*\) \{\s*\n\s*await client\.query\(\s*\n\s*`\s*\n\s*INSERT INTO dispatch\.load_assignment_history/.test(src)) {
  failures.push(`${routesPath}: the load_assignment_history INSERT is no longer gated on oldRow.assigned_unit_id/assigned_primary_driver_id actually changing -- either it fires unconditionally (row flood) or it moved somewhere this guard can't verify is still change-gated`);
}

// assignment_method must be one of the CHECK-constrained values (db/migrations/0100_p5_f3_quicksave_assignments.sql).
if (!/VALUES \(\$1::uuid, \$2::uuid, 'full_form', \$3::uuid, \$4::uuid, \$5::uuid, \$6::uuid, \$7::uuid, '\[\]'::jsonb\)/.test(src)) {
  failures.push(`${routesPath}: the load_assignment_history INSERT's VALUES clause no longer matches the expected column order/assignment_method='full_form' shape`);
}

if (process.argv.includes("--selftest")) {
  const mutated = src.replace(
    /if \(\s*\n\s*oldRow\.assigned_unit_id !== row\.assigned_unit_id \|\|\s*\n\s*oldRow\.assigned_primary_driver_id !== row\.assigned_primary_driver_id\s*\n\s*\) \{\s*\n\s*await client\.query\(\s*\n\s*`\s*\n\s*INSERT INTO dispatch\.load_assignment_history[\s\S]*?\n\s*\);\s*\n\s*\}\n(\s*\}\n)/,
    "$1"
  );
  if (mutated === src) {
    console.error("SELFTEST SETUP FAIL — could not locate the INSERT block to remove for the mutation");
    process.exit(1);
  }
  const mutatedHasInsert = /INSERT INTO dispatch\.load_assignment_history/.test(mutated);
  if (mutatedHasInsert) {
    console.error("SELFTEST FAIL — planted mutation (removing the INSERT) was not actually removed");
    process.exit(1);
  }
  console.log("SELFTEST PASS — removing the load_assignment_history INSERT is correctly detectable (this guard's own real-run assertion would then fail)");
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify-mdata-loads-patch-writes-assignment-history: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-mdata-loads-patch-writes-assignment-history: OK — PATCH /api/v1/mdata/loads/:id writes dispatch.load_assignment_history on a real primary-driver/unit change, gated (not unconditional), assignment_method='full_form'"
);
