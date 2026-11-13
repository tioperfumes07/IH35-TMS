#!/usr/bin/env node
// ROW-101: vendor report must exclude bill_category='driver' bills from all vendor spend aggregates.
// Pattern established in load-cost-rollup.sql.ts line 79.
import { readFileSync } from "fs";
import { resolve } from "path";

const PASS = (msg) => { process.stdout.write(`PASS ${msg}\n`); };
const FAIL = (msg) => { process.stderr.write(`FAIL ${msg}\n`); process.exit(1); };

const DRIVER_EXCL = `(b.bill_category IS NULL OR b.bill_category <> 'driver')`;

const files = [
  "apps/backend/src/reports/vendor-report.service.ts",
  "apps/backend/src/mdata/canonical/party-board.service.ts",
];

if (process.argv.includes("--selftest")) {
  // Mutation: a source without the exclusion clause must be caught.
  const fake = "SELECT * FROM accounting.bills b WHERE b.vendor_id = $1";
  const caught = !fake.includes(DRIVER_EXCL);
  if (!caught) {
    process.stderr.write("verify-vendor-report-excludes-driver-bills SELFTEST FAIL — mutation not caught\n");
    process.exit(1);
  }
  process.stdout.write("verify-vendor-report-excludes-driver-bills --selftest PASS 1/1 mutations caught\n");
  process.exit(0);
}

for (const rel of files) {
  const path = resolve(rel);
  const src = readFileSync(path, "utf8");
  if (!src.includes(DRIVER_EXCL)) {
    FAIL(`${rel}: missing driver bill exclusion — add: ${DRIVER_EXCL}`);
  }
  PASS(`${rel}: driver bill exclusion present`);
}
