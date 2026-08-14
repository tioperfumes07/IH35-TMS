#!/usr/bin/env node
/** @matrix-built {"modules":["cash-flow"],"cols":["customer","load","reverse_link"],"leafRe":"^tab\\.daily_prediction$","task":"LINK-F5171-CASHFLOW-CUSTOMER-ENTITYLINK","vertical":"column-wave"} */
/**
 * LINK-F5171 — cash-flow daily prediction income rows must expose customer_id from the
 * load JOIN and EntityLink kind=customer (not entityLabel(..., null)).
 *
 * Run: node scripts/verify-cashflow-predicted-customer-entitylink.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cashflow-predicted-customer-entitylink";
const SVC = "apps/backend/src/cash-flow/cash-flow.service.ts";
const FE = "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx";
const API = "apps/frontend/src/api/cashFlow.ts";

function audit() {
  const failures = [];
  const svc = fs.readFileSync(path.join(ROOT, SVC), "utf8");
  const fe = fs.readFileSync(path.join(ROOT, FE), "utf8");
  const api = fs.readFileSync(path.join(ROOT, API), "utf8");
  if (!/customer_id:\s*string\s*\|\s*null/.test(svc) && !/customer_id: string \| null/.test(svc)) {
    failures.push(`${SVC}: IncomeLineItem must include customer_id`);
  }
  if (!/l\.customer_id::text AS customer_id/.test(svc) && !/customer_id::text AS customer_id/.test(svc)) {
    failures.push(`${SVC}: income SQL must select customer_id`);
  }
  if (!/customer_id:\s*string\s*\|\s*null/.test(api)) {
    failures.push(`${API}: FE IncomeLineItem must include customer_id`);
  }
  if (!/data-testid=["']cash-flow-predicted-customer-link["']/.test(fe)) {
    failures.push(`${FE}: missing data-testid=cash-flow-predicted-customer-link`);
  }
  if (!/kind=["']customer["']/.test(fe)) {
    failures.push(`${FE}: must EntityLink kind=customer`);
  }
  if (/entityLabel\(item\.customer_name,\s*null/.test(fe) && !/item\.customer_id \?/.test(fe)) {
    failures.push(`${FE}: customer still always rendered with null id`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const failures = audit();
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL — live tree should pass:\n - ` + failures.join("\n - "));
    process.exit(1);
  }
  const fe = fs.readFileSync(path.join(ROOT, FE), "utf8");
  const broken = fe.replace(/cash-flow-predicted-customer-link/g, "x");
  fs.writeFileSync(path.join(ROOT, FE), broken);
  try {
    const planted = audit();
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted regression not caught`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(path.join(ROOT, FE), fe);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — cash-flow daily prediction customer_id + EntityLink`);
