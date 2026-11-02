#!/usr/bin/env node
/**
 * U29 — Faro debtor record Invoice/Load columns must EntityLink when ids are present.
 * Backend must expose invoice_id (via purchase-line Faro Inv # stamp) and load_number.
 */
import fs from "node:fs";

const LABEL = "verify-faro-debtor-u29-entity-links";
const PAGE = "apps/frontend/src/pages/factoring/FaroDebtorRecordPage.tsx";
const ROUTES = "apps/backend/src/factoring/faro-debtor.routes.ts";

const page = fs.readFileSync(PAGE, "utf8");
const routes = fs.readFileSync(ROUTES, "utf8");
const fails = [];

if (!/kind="invoice"/.test(page) || !/l\.invoice_id/.test(page)) {
  fails.push(`${PAGE}: Invoice column must EntityLink kind=invoice via invoice_id`);
}
if (!/kind="load"/.test(page) || !/l\.load_id/.test(page)) {
  fails.push(`${PAGE}: Load column must EntityLink kind=load via load_id`);
}
if (!/invoice_id: string \| null/.test(page) || !/load_number: string \| null/.test(page)) {
  fails.push(`${PAGE}: FaroDebtorLine must declare invoice_id / load_number`);
}
if (!/invoice_id: string \| null/.test(routes) || !/load_number: string \| null/.test(routes)) {
  fails.push(`${ROUTES}: FaroDebtorLine must declare invoice_id / load_number`);
}
if (!/ld\.load_number AS load_number/.test(routes) || !/LEFT JOIN mdata\.loads ld/.test(routes)) {
  fails.push(`${ROUTES}: SELECT must LEFT JOIN loads for load_number`);
}
if (!/factoring_purchase_lines/.test(routes) || !/faro_invoice_number/.test(routes)) {
  fails.push(`${ROUTES}: must resolve Faro Inv # → invoice_id via factoring_purchase_lines`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = page.replace(/kind="invoice"/g, 'kind="vendor"').replace(/kind="load"/g, 'kind="vendor"');
  if (/kind="invoice"/.test(plant) || /kind="load"/.test(plant)) {
    console.error(`${LABEL} --selftest FAIL plant weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Faro debtor Invoice/Load EntityLinks`);
