#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["customer","load","reverse_link"],"leafRe":"^planning\\.calendar$","task":"LINK-F5171-PLANNER-CALENDAR-CUSTOMER-DRILL","vertical":"column-wave"} */
/**
 * LINK-F5171 — planning.calendar load chips must EntityLink load + customer (customer_id in title + body).
 *
 * Run: node scripts/verify-planner-calendar-customer-entitylink.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-planner-calendar-customer-entitylink";
const TARGET = "apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx";

function audit(src) {
  const failures = [];
  if (!/data-testid=["']planner-calendar-load-link["']/.test(src)) {
    failures.push(`${TARGET}: missing data-testid=planner-calendar-load-link`);
  }
  if (!/data-testid=["']planner-calendar-customer-link["']/.test(src)) {
    failures.push(`${TARGET}: missing data-testid=planner-calendar-customer-link`);
  }
  if (/entityLabel\(load\.customer_name,\s*null/.test(src)) {
    failures.push(`${TARGET}: customer still entityLabel(..., null) in chip title/body`);
  }
  if (!/kind=["']customer["']/.test(src) || !/kind=["']load["']/.test(src)) {
    failures.push(`${TARGET}: must EntityLink kind=load and kind=customer`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — live file should pass`);
    process.exit(1);
  }
  const broken = good.replace(/planner-calendar-customer-link/g, "x").replace(
    /entityLabel\(load\.customer_name,\s*load\.customer_id/g,
    "entityLabel(load.customer_name, null",
  );
  if (!audit(broken).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted regression not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(path.join(ROOT, TARGET), "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — planner calendar load+customer EntityLinks`);
