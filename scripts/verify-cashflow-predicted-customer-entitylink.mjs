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
const RECEIPTS = "apps/backend/src/cash-flow/cash-flow-receipts.sql.ts";
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

function audit({ svc = read(SVC), fe = read(FE), api = read(API), receipts = read(RECEIPTS) } = {}) {
  const failures = [];
  if (!/customer_id:\s*string\s*\|\s*null/.test(svc) && !/customer_id: string \| null/.test(svc)) {
    failures.push(`${SVC}: IncomeLineItem must include customer_id`);
  }
  if (!receipts.includes("l.customer_id::text AS customer_id") || !receipts.includes("i.customer_id::text AS customer_id") || !svc.includes("customer_id: row.customer_id") || !svc.includes('${cashFlowReceiptsSql(cashFollowsEta)}')) {
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
  const incomeMarkup = fe.slice(fe.indexOf("data?.income_items.map"), fe.indexOf("data?.expense_items.length"));
  if (!incomeMarkup.includes("item.invoice_id ?? item.load_id")) failures.push("income keys must distinguish standalone invoices");
  if ((incomeMarkup.match(/if \(item\.load_id\) navigate/g) ?? []).length !== 2 ||
      (incomeMarkup.match(/else if \(item\.invoice_id\) navigate\(`\/accounting\/invoices\/\$\{item\.invoice_id\}`\)/g) ?? []).length !== 2) {
    failures.push("click and keyboard navigation must guard nullable load ids and route standalone invoices");
  }
  if (!incomeMarkup.includes('kind={item.load_id ? "load" : "invoice"}') || !incomeMarkup.includes("id={item.load_id ?? item.invoice_id}")) failures.push("standalone invoice EntityLink must use invoice identity");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const failures = audit();
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL — live tree should pass:\n - ` + failures.join("\n - "));
    process.exit(1);
  }
  const good = { svc: read(SVC), fe: read(FE), api: read(API), receipts: read(RECEIPTS) };
  const plants = [
    ["fe", "cash-flow-predicted-customer-link", "x"],
    ["receipts", "l.customer_id::text AS customer_id", "NULL::text AS customer_id"],
    ["receipts", "i.customer_id::text AS customer_id", "NULL::text AS customer_id"],
    ["svc", "customer_id: row.customer_id", "customer_id: null"],
    ["fe", "item.invoice_id ?? item.load_id", "item.load_id"],
    ["fe", "if (item.load_id) navigate", "navigate"],
    ["fe", "/accounting/invoices/${item.invoice_id}", "/dispatch/loads/${item.load_id}"],
    ["fe", 'kind={item.load_id ? "load" : "invoice"}', 'kind="load"'],
  ];
  for (const [key, from, to] of plants) {
    if (!good[key].includes(from)) throw Error(`inert plant: ${from}`);
    const planted = audit({ ...good, [key]: good[key].replaceAll(from, to) });
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted regression not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest OK — ${plants.length}/${plants.length} mutation plants rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — cash-flow daily prediction customer_id + EntityLink`);
