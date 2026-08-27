#!/usr/bin/env node
// MAINTENANCE-PARTS-CREATE-SUB-CATEGORY-BARCODE-NULL-400 — guard
//
// Live-confirmed against prod: POST /api/v1/catalogs/maintenance/parts-master with sub_category:null
// and barcode_upc:null (CreateMaintPartModal.tsx's real blank-field values) 400'd on both fields with
// "Invalid input: expected string, received null". Third instance this session of the
// createSchema-bare-.optional()-vs-updateSchema-already-.nullable() asymmetry (siblings: #16702 lists
// load-cancellation-reasons, #16706 safety civil-fine-types).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ROUTES_FILE = "apps/backend/src/catalogs/maintenance/parts.routes.ts";

export function check(text) {
  const failures = [];
  const idx = text.indexOf("export const createSchema = z.object({");
  const block = idx >= 0 ? text.slice(idx, idx + 1000) : "";
  if (!/sub_category: z\.string\(\)\.trim\(\)\.max\(120\)\.nullable\(\)\.optional\(\),/.test(block)) {
    failures.push(`${ROUTES_FILE} createSchema's sub_category field no longer accepts null`);
  }
  if (!/barcode_upc: z\.string\(\)\.trim\(\)\.max\(50\)\.nullable\(\)\.optional\(\),/.test(block)) {
    failures.push(`${ROUTES_FILE} createSchema's barcode_upc field no longer accepts null`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: maintenance-parts-create-sub-category-barcode-null-400");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Maintenance Parts create accepts blank sub_category/barcode_upc");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
  const offenderA = text.replace(
    "sub_category: z.string().trim().max(120).nullable().optional(),",
    "sub_category: z.string().trim().max(120).optional(),"
  );
  if (offenderA === text) {
    console.error("FAIL(selftest): offender mutation A did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (sub_category reverted) was NOT caught");
    process.exit(1);
  }

  const offenderB = text.replace(
    "barcode_upc: z.string().trim().max(50).nullable().optional(),",
    "barcode_upc: z.string().trim().max(50).optional(),"
  );
  if (offenderB === text) {
    console.error("FAIL(selftest): offender mutation B did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (barcode_upc reverted) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
