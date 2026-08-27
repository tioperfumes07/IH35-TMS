#!/usr/bin/env node
// DISPATCH-LOAD-PATCH-COMMODITY-COLUMN-MISSING-500 — guard
//
// mdata.loads has never had commodity/cargo_weight_lbs/reefer_setpoint_temp_f columns (verified live on
// prod, no migration ever added them). update-load.service.ts's SCALAR_COLUMNS mapped commodity/
// cargo_weight_lbs/reefer_setpoint_temp_f directly to those nonexistent columns, and
// loads.routes.ts's updateDispatchLoadBodySchema + editLoadMapping.ts's Edit-wizard round-trip fed values
// into that write path — so any PATCH /api/v1/dispatch/loads/:id touching these 3 fields 42703'd, and
// poisoned every OTHER dirty field bundled in the same request. Fix: removed the 3 fields from the write
// path end to end (PATCH schema, UpdateDispatchLoadFields type, SCALAR_COLUMNS, and the Edit-wizard
// prefill/dirty-field mapping) so the PATCH endpoint can no longer be asked to write them. This guard
// fails if any of the 3 fields are reintroduced into the write path without a real migration.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ROUTES_FILE = "apps/backend/src/dispatch/loads.routes.ts";
const SERVICE_FILE = "apps/backend/src/dispatch/update-load.service.ts";
const MAPPING_FILE = "apps/frontend/src/pages/dispatch/components/book-load-v4/editLoadMapping.ts";

const BROKEN_FIELDS = ["cargo_weight_lbs", "reefer_setpoint_temp_f"];

export function check(routesText, serviceText, mappingText) {
  const failures = [];

  // The PATCH schema block only — the CREATE (Book Load) schema keeps its own separate commodity/weight_lbs
  // fields (a distinct, already-filed, lower-severity silent-no-op finding; out of scope for this guard).
  const patchIdx = routesText.indexOf("const updateDispatchLoadBodySchema = z.object({");
  const patchBlock = patchIdx >= 0 ? routesText.slice(patchIdx, patchIdx + 4000) : "";
  for (const f of BROKEN_FIELDS) {
    if (new RegExp(`^\\s*${f}:\\s*z\\.`, "m").test(patchBlock)) {
      failures.push(`${ROUTES_FILE} updateDispatchLoadBodySchema still accepts "${f}" — mdata.loads has no such column`);
    }
  }
  if (/^\s*commodity:\s*z\./m.test(patchBlock)) {
    failures.push(`${ROUTES_FILE} updateDispatchLoadBodySchema still accepts "commodity" on PATCH — mdata.loads has no such column`);
  }

  for (const f of [...BROKEN_FIELDS, "commodity"]) {
    if (new RegExp(`^\\s*${f}:\\s*(string|number)`, "m").test(serviceText)) {
      failures.push(`${SERVICE_FILE} UpdateDispatchLoadFields still declares "${f}"`);
    }
    if (new RegExp(`^\\s*${f}:\\s*"${f}",\\s*$`, "m").test(serviceText)) {
      failures.push(`${SERVICE_FILE} SCALAR_COLUMNS still maps "${f}" to a real column — reintroduces the 500`);
    }
  }

  for (const f of ["commodity", "cargo_weight_lbs", "reefer_setpoint_temp_f", "weight_lbs", "reefer_setpoint"]) {
    if (mappingText.includes(`["${f}"`) || mappingText.includes(`load.${f}`)) {
      failures.push(`${MAPPING_FILE} still references "${f}" in the Edit-wizard prefill/PATCH mapping`);
    }
  }

  return failures;
}

function run() {
  const routesText = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
  const serviceText = fs.readFileSync(path.join(root, SERVICE_FILE), "utf8");
  const mappingText = fs.readFileSync(path.join(root, MAPPING_FILE), "utf8");
  const failures = check(routesText, serviceText, mappingText);
  if (failures.length > 0) {
    console.error("FAIL: dispatch-load-patch-commodity-column-missing-500");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: dispatch load PATCH no longer writes commodity/cargo_weight_lbs/reefer_setpoint_temp_f to nonexistent mdata.loads columns");
}

function selftest() {
  const routesText = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
  const serviceText = fs.readFileSync(path.join(root, SERVICE_FILE), "utf8");
  const mappingText = fs.readFileSync(path.join(root, MAPPING_FILE), "utf8");

  const anchor = "// DISPATCH-LOAD-PATCH-COMMODITY-COLUMN-MISSING-500: commodity/cargo_weight_lbs/reefer_setpoint_temp_f";
  const offenderRoutes = routesText.replace(
    anchor,
    "cargo_weight_lbs: z.number().int().min(0).nullable().optional(),\n  " + anchor
  );
  if (offenderRoutes === routesText) {
    console.error("FAIL(selftest): offender mutation did not change loads.routes.ts — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderRoutes, serviceText, mappingText);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (cargo_weight_lbs back in PATCH schema) was NOT caught");
    process.exit(1);
  }

  const offenderService = serviceText.replace(
    'piece_count: "piece_count",',
    'reefer_setpoint_temp_f: "reefer_setpoint_temp_f",\n  piece_count: "piece_count",'
  );
  if (offenderService === serviceText) {
    console.error("FAIL(selftest): offender mutation did not change update-load.service.ts — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(routesText, offenderService, mappingText);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (reefer_setpoint_temp_f back in SCALAR_COLUMNS) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
