#!/usr/bin/env node
// AUDIT-EVENTS-EVENT-CLASS-FULL-TABLE-SCAN-EVERY-REPORT-LOAD -- guard
//
// Every /reports/audit/* route filters audit.audit_events on event_class ILIKE
// ANY(ARRAY['%...%', ...]) -- a leading-wildcard ILIKE can never use a plain btree index, so
// every one of these requests forced a full Seq Scan over the whole table. Confirmed live
// (br-fancy-credit-akjnd07a, EXPLAIN ANALYZE) at 2,712,346 rows: 8,359 ms per deduction-trail
// request alone. A pg_trgm GIN index on event_class drops the identical query to 0.8-1.7 ms
// across all 3 tested filter patterns (deduction-trail's, void-reversal's, period-close-
// history's) -- confirmed to fix every sibling, not just one route.
//
// This guard fails if the migration file (or its idempotent CREATE INDEX IF NOT EXISTS form)
// disappears.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "db/migrations/202613210000_audit_events_event_class_trgm_index.sql";

export function check(text) {
  const failures = [];
  if (!/CREATE INDEX IF NOT EXISTS idx_audit_events_event_class_trgm/.test(text)) {
    failures.push(`${FILE}: missing idempotent CREATE INDEX IF NOT EXISTS idx_audit_events_event_class_trgm`);
  }
  if (!/ON audit\.audit_events/.test(text)) {
    failures.push(`${FILE}: index is not on audit.audit_events`);
  }
  if (!/USING gin \(event_class gin_trgm_ops\)/.test(text)) {
    failures.push(`${FILE}: missing gin (event_class gin_trgm_ops) -- required for ILIKE ANY pattern matching to use the index`);
  }
  return failures;
}

function run() {
  const filePath = path.join(root, FILE);
  if (!fs.existsSync(filePath)) {
    console.error(`FAIL: audit-events-event-class-trgm-index -- ${FILE} does not exist`);
    process.exit(1);
  }
  const text = fs.readFileSync(filePath, "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: audit-events-event-class-trgm-index");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: db/migrations has the trigram GIN index fixing the audit.audit_events full-table-scan on every /reports/audit/* request");
}

function selftest() {
  const filePath = path.join(root, FILE);
  const text = fs.readFileSync(filePath, "utf8");
  const offender = text.replace("USING gin (event_class gin_trgm_ops)", "-- removed for selftest");
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (removed the gin_trgm_ops index type) was NOT caught");
    process.exit(1);
  }
  const baselineFailures = check(text);
  if (baselineFailures.length > 0) {
    console.error("FAIL(selftest): baseline (unmodified) source unexpectedly fails check()");
    for (const f of baselineFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS(selftest): planted offender correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
