#!/usr/bin/env node
// DISPATCH-LOAD-STATUS-FILTER-ENUM-MISMATCH-400 — guard
//
// GET /api/v1/dispatch/loads validates ?status= against dispatchStatusSchema (10 narrow values), but a
// caller with the wide mdata.load_status_enum vocabulary (19 values — the frontend's LoadStatus type,
// or a load's own `.status` field) 400'd with no translation, silently failing a filtered list. Fix:
// listDispatchLoadsQuerySchema's status preprocessor now maps every wide value to its narrow equivalent
// (normalizeDispatchStatusFilterValue, exported + regression-tested in loads-status-filter.test.ts)
// before the enum check runs. This guard fails if that mapping wiring regresses.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ROUTES_FILE = "apps/backend/src/dispatch/loads.routes.ts";
const TEST_FILE = "apps/backend/src/dispatch/loads-status-filter.test.ts";

export function check(routesText, testExists) {
  const failures = [];

  if (!/export function normalizeDispatchStatusFilterValue\(raw: string\): string \{/.test(routesText)) {
    failures.push(`${ROUTES_FILE} no longer exports normalizeDispatchStatusFilterValue`);
  }
  if (!/WIDE_LOAD_STATUS_VALUES\.has\(raw\) \? fromMdataStatus\(raw\) : raw/.test(routesText)) {
    failures.push(`${ROUTES_FILE} normalizeDispatchStatusFilterValue no longer maps wide values via fromMdataStatus`);
  }
  const statusIdx = routesText.indexOf("status: z");
  const statusBlock = statusIdx >= 0 ? routesText.slice(statusIdx, statusIdx + 700) : "";
  if (!/raw\.map\(normalizeDispatchStatusFilterValue\)/.test(statusBlock)) {
    failures.push(`${ROUTES_FILE} listDispatchLoadsQuerySchema's status preprocessor no longer calls normalizeDispatchStatusFilterValue`);
  }
  // All 19 wide mdata.load_status_enum members must still be listed — a shrunk set would silently stop
  // translating whichever value got dropped.
  const wideValues = [
    "draft", "booked", "planned", "unassigned", "assigned", "assigned_not_dispatched", "dispatched",
    "at_pickup", "in_transit", "at_delivery", "delivered", "delivered_pending_docs",
    "completed_docs_received", "invoiced", "paid", "closed", "cancelled", "abandoned",
    "driver_walkoff", "driver_no_show",
  ];
  const setIdx = routesText.indexOf("const WIDE_LOAD_STATUS_VALUES");
  const setBlock = setIdx >= 0 ? routesText.slice(setIdx, setIdx + 700) : "";
  for (const v of wideValues) {
    if (!new RegExp(`"${v}"`).test(setBlock)) failures.push(`${ROUTES_FILE} WIDE_LOAD_STATUS_VALUES is missing "${v}"`);
  }

  if (!testExists) failures.push(`${TEST_FILE} is missing — the wide-to-narrow mapping has no regression test`);

  return failures;
}

function run() {
  const routesText = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
  const testExists = fs.existsSync(path.join(root, TEST_FILE));
  const failures = check(routesText, testExists);
  if (failures.length > 0) {
    console.error("FAIL: dispatch-load-status-filter-enum-mismatch-400");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: GET /api/v1/dispatch/loads maps every wide mdata status value to its narrow equivalent before validation");
}

function selftest() {
  const routesText = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");

  const offenderA = routesText.replace(
    "raw.map(normalizeDispatchStatusFilterValue)",
    "raw"
  );
  if (offenderA === routesText) {
    console.error("FAIL(selftest): offender mutation A did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA, true);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (status preprocessor stopped normalizing) was NOT caught");
    process.exit(1);
  }

  const offenderB = routesText.replace('"driver_no_show",\n]);', "]);");
  if (offenderB === routesText) {
    console.error("FAIL(selftest): offender mutation B did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB, true);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (driver_no_show removed from WIDE_LOAD_STATUS_VALUES) was NOT caught");
    process.exit(1);
  }

  const failuresC = check(routesText, false);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): missing regression test file was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 3/3 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
