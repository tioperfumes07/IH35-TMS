#!/usr/bin/env node
/** @matrix-built {"modules":["cash-flow"],"cols":["customer","load","reverse_link"],"leafRe":"^tab\\.daily_prediction$","task":"LINK-F5171-CASHFLOW-CUSTOMER-ENTITYLINK","vertical":"column-wave"} */
/**
 * LINK-F5171 — Projected (Auto) income rows must expose customer_id and EntityLink kind=customer.
 *
 * ROUND 443.250: Projected V3 is ledger-backed (getRollingLedger), not getDailyPrediction.
 * Receipts SQL + getDailyPrediction IncomeLineItem still carry customer_id for other consumers;
 * the rolling ledger now also selects and returns customer_id / customer_name so the Projected
 * tab can keep the same customer EntityLink law on one engine.
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
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function audit({ svc = read(SVC), fe = read(FE), api = read(API), receipts = read(RECEIPTS) } = {}) {
  const failures = [];

  // Receipts stream (shared by getDailyPrediction + rolling ledger invoice/load income).
  if (
    !receipts.includes("l.customer_id::text AS customer_id") ||
    !receipts.includes("i.customer_id::text AS customer_id")
  ) {
    failures.push(`${RECEIPTS}: income SQL must select customer_id`);
  }

  // getDailyPrediction IncomeLineItem still exposes customer_id (other consumers / parity).
  if (!/customer_id:\s*string\s*\|\s*null/.test(svc) && !/customer_id: string \| null/.test(svc)) {
    failures.push(`${SVC}: IncomeLineItem / rolling rows must include customer_id`);
  }
  if (!svc.includes("customer_id: row.customer_id") || !svc.includes("${cashFlowReceiptsSql(cashFollowsEta)}")) {
    failures.push(`${SVC}: getDailyPrediction income SQL must select customer_id`);
  }

  // Rolling ledger income rows must carry customer_id onto the API shape (443.250 one-engine).
  if (!/customer_id\?:\s*string\s*\|\s*null/.test(svc) && !/customer_id\?: string \| null/.test(svc)) {
    failures.push(`${SVC}: RollingLedgerRow must include optional customer_id`);
  }
  if (!svc.includes("receipts.customer_id") || !svc.includes("customer_id: inv.customer_id")) {
    failures.push(`${SVC}: rolling ledger invoice rows must select + assign customer_id`);
  }
  if (!svc.includes("customer_id: l.customer_id")) {
    failures.push(`${SVC}: rolling ledger load-not-invoiced rows must assign customer_id`);
  }

  // FE API RollingLedgerRow
  if (!/customer_id\?:\s*string\s*\|\s*null/.test(api)) {
    failures.push(`${API}: FE RollingLedgerRow must include customer_id`);
  }

  // Projected tab is ledger-backed V3 (443.250).
  if (!/\bgetRollingLedger\b/.test(fe)) {
    failures.push(`${FE}: Projected must call getRollingLedger (one engine with Home / Rolling Ledger)`);
  }
  if (!/from ["'][^"']*design\/v3-tokens["']/.test(fe)) {
    failures.push(`${FE}: missing v3-tokens import — 443.250 Projected V3 board`);
  }
  for (const comp of ["V3Panel", "V3Segmented"]) {
    if (!new RegExp(`<${comp}\\b`).test(fe)) {
      failures.push(`${FE}: does not render <${comp}> — 443.250 Projected V3`);
    }
  }
  for (const testId of [
    "cash-flow-projected-outlook",
    "cash-flow-projected-income-panel",
    "cash-flow-projected-expense-panel",
  ]) {
    if (!fe.includes(testId)) {
      failures.push(`${FE}: missing data-testid "${testId}" — 443.250 Projected V3 surfaces`);
    }
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
  if (!/kind=\{item\.load_id \? ["']load["'] : ["']invoice["']\}/.test(fe)) {
    failures.push(`${FE}: income doc EntityLink must use load vs invoice identity`);
  }
  if (!/id=\{item\.load_id \?\? item\.document_id\}/.test(fe)) {
    failures.push(`${FE}: income doc EntityLink id must prefer load_id then document_id`);
  }

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
    ["fe", "getRollingLedger", "getDailyPrediction"],
    ["fe", "cash-flow-projected-outlook", "x"],
    ["receipts", "l.customer_id::text AS customer_id", "NULL::text AS customer_id"],
    ["receipts", "i.customer_id::text AS customer_id", "NULL::text AS customer_id"],
    ["svc", "customer_id: row.customer_id", "customer_id: null"],
    ["svc", "customer_id: inv.customer_id", "customer_id: null"],
    ["svc", "customer_id: l.customer_id", "customer_id: null"],
    ["fe", 'kind={item.load_id ? "load" : "invoice"}', 'kind="load"'],
    ["fe", "id={item.load_id ?? item.document_id}", "id={item.load_id}"],
  ];
  for (const [key, from, to] of plants) {
    if (!good[key].includes(from)) throw Error(`inert plant: ${from}`);
    const planted = audit({ ...good, [key]: good[key].replaceAll(from, to) });
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted regression not caught (${from})`);
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
console.log(`${LABEL} PASS — Projected V3 ledger customer_id + EntityLink (LINK-F5171)`);
