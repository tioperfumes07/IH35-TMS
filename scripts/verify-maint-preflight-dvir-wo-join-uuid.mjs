#!/usr/bin/env node
/**
 * verify-maint-preflight-dvir-wo-join-uuid.mjs
 * LV-MAINT-PREFLIGHT-DVIR-WO-JOIN-UUID
 *
 * Pre-flight DVIR queue must JOIN maintenance.work_orders on UUID=UUID.
 * Casting work_order_id to text in the CTE then joining to w.id (uuid) raises
 * Postgres 42883 `operator does not exist: uuid = text` and blanks the page.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-maint-preflight-dvir-wo-join-uuid";
const ROUTE = "apps/backend/src/maintenance/pre-flight-dvir.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze(src) {
  const failures = [];
  if (!/LEFT JOIN\s+maintenance\.work_orders\s+w\s+ON\s+w\.id\s*=\s*b\.work_order_id/.test(src)) {
    failures.push("queue SQL must LEFT JOIN maintenance.work_orders w ON w.id = b.work_order_id");
  }
  // Forbidden: CTE alias casts WO id to text before the uuid join.
  if (/COALESCE\(\s*d\.follow_up_wo_id\s*,\s*lt\.auto_wo_id\s*\)\s*::\s*text\s+AS\s+work_order_id/.test(src)) {
    failures.push("must not cast COALESCE(follow_up_wo_id, auto_wo_id)::text AS work_order_id before joining w.id");
  }
  if (/w\.id\s*=\s*b\.work_order_id\s*::\s*uuid/.test(src)) {
    // Allowed alternate — cast at join site — but prefer typed CTE column.
  }
  if (/w\.id\s*::\s*text\s*=\s*b\.work_order_id/.test(src)) {
    failures.push("must not join via w.id::text = b.work_order_id (keep UUID=UUID)");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const good = `
    COALESCE(d.follow_up_wo_id, lt.auto_wo_id) AS work_order_id,
    b.work_order_id::text AS work_order_id,
    LEFT JOIN maintenance.work_orders w ON w.id = b.work_order_id
  `;
  const bad = `
    COALESCE(d.follow_up_wo_id, lt.auto_wo_id)::text AS work_order_id,
    LEFT JOIN maintenance.work_orders w ON w.id = b.work_order_id
  `;
  if (analyze(good).length) fail("selftest expected GOOD to pass");
  if (!analyze(bad).length) fail("selftest expected BAD (text cast before join) to fail");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze(read(ROUTE));
if (failures.length) {
  for (const f of failures) console.error(`${LABEL} FAIL: ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
process.exit(0);
