#!/usr/bin/env node
/**
 * DISPATCH-CUSTOMER-LABEL-LOST-FOR-DEACTIVATED-CUSTOMERS (live-verified on SHA 88a6e98, GO-1722)
 *
 * On /dispatch?view=board and /dispatch?view=list, 5 loads showed "Customer — not visible" because
 * customer_name resolved to null in GET /api/v1/dispatch/loads. Root cause: a plain
 * `LEFT JOIN mdata.customers c ON c.id = l.customer_id` drops the match when the customer is
 * archived/deactivated (mdata.customers' own RLS hides deactivated_at IS NOT NULL rows — same
 * mechanism the LV-SYSTEM-AUDIT-LOAD-LINK-DEAD-END comment in this file already documents for the
 * detail query). mdata.resolve_customer_label_same_company (a SECURITY DEFINER same-company resolver)
 * already exists and is wired into invoices.routes.ts and cancellations-report.routes.ts, but was
 * never wired into dispatch/loads.routes.ts's own list/detail queries — the exact same class of gap
 * already fixed here for drivers via resolve_driver_label_same_company (driver_short_name /
 * assigned_primary_driver_name / assigned_secondary_driver_name all fall back to the resolver; only
 * customer_name did not).
 *
 * This guard locks: both the list query and the detail query resolve customer_name through
 * mdata.resolve_customer_label_same_company as a COALESCE fallback, keyed on l.customer_id /
 * l.operating_company_id (never a bare `c.customer_name,` with no fallback for either SELECT).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/dispatch/loads.routes.ts";

const RESOLVED_RE =
  /COALESCE\(c\.customer_name,\s*mdata\.resolve_customer_label_same_company\(l\.customer_id,\s*l\.operating_company_id\)\)\s*AS\s*customer_name/g;

// The exact pre-fix shape: c.customer_name selected bare, with a trailing comma, no COALESCE/resolver.
const BARE_RE = /(?<!COALESCE\()\bc\.customer_name,(?!\s*$)/g;

export function check(src) {
  const failures = [];

  const resolvedCount = (src.match(RESOLVED_RE) ?? []).length;
  if (resolvedCount < 2) {
    failures.push(
      `${FILE}: expected 2 resolved "COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(...))" ` +
        `occurrences (list query + detail query), found ${resolvedCount}`
    );
  }

  // Scan line-by-line for a bare `c.customer_name,` SELECT-list item that is NOT part of the
  // resolved COALESCE expression above (i.e. still the old unresolved shape reappearing somewhere,
  // e.g. a new list variant added later that forgot the resolver).
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*c\.customer_name,\s*$/.test(line) || /SELECT l\.\*,\s*c\.customer_name,/.test(line)) {
      failures.push(`${FILE}:${i + 1}: bare "c.customer_name," with no resolve_customer_label_same_company fallback`);
    }
  }

  return failures;
}

function run() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(src);
  if (failures.length > 0) {
    console.error("FAIL: dispatch-loads-customer-label-survives-archive");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: dispatch/loads.routes.ts's list + detail queries resolve customer_name through " +
      "mdata.resolve_customer_label_same_company, surviving an archived/deactivated customer"
  );
}

function selftest() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: revert the LIST query's customer_name back to the exact bare pre-fix shape.
  const offenderA = src.replace(
    "COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(l.customer_id, l.operating_company_id)) AS customer_name,\n            u.unit_number,",
    "c.customer_name,\n            u.unit_number,"
  );
  if (offenderA === src) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (list query reverted to bare customer_name) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: revert the DETAIL query's customer_name back to the exact bare pre-fix shape
  // (`SELECT l.*, c.customer_name,`).
  const offenderB = src.replace(
    "SELECT l.*,\n                 -- DISPATCH-CUSTOMER-LABEL-LOST-FOR-DEACTIVATED-CUSTOMERS: same gap as the list query\n                 -- above — a plain c.customer_name drops to null for an archived/deactivated customer.\n                 COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(l.customer_id, l.operating_company_id)) AS customer_name,",
    "SELECT l.*, c.customer_name,"
  );
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (detail query reverted to bare customer_name) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
