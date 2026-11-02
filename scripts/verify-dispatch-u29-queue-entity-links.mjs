#!/usr/bin/env node
/**
 * U29 — Dispatch exception queues must EntityLink named records (customer / driver / invoice),
 * not plain text names. Backend must expose the ids those links need.
 */
import fs from "node:fs";

const LABEL = "verify-dispatch-u29-queue-entity-links";
const FILES = {
  awaitingFe: "apps/frontend/src/pages/dispatch/AwaitingBolInvoicePage.tsx",
  needsAuthFe: "apps/frontend/src/pages/dispatch/NeedsDeliveryAuthorizationPage.tsx",
  remintFe: "apps/frontend/src/pages/dispatch/DriverBillRemintScreen.tsx",
  awaitingApi: "apps/frontend/src/api/dispatch.ts",
  bolSvc: "apps/backend/src/accounting/auto-invoice-on-bol.service.ts",
  needsAuthBe: "apps/backend/src/dispatch/manual-delivery-authorization.routes.ts",
};

const fails = [];
const src = Object.fromEntries(
  Object.entries(FILES).map(([k, p]) => [k, fs.readFileSync(p, "utf8")]),
);

if (!/kind="customer"/.test(src.awaitingFe) || !/row\.customer_id/.test(src.awaitingFe)) {
  fails.push(`${FILES.awaitingFe}: Customer column must EntityLink via customer_id`);
}
if (/render:\s*\(row\)\s*=>\s*row\.customer_name\s*\?\?\s*["']—["']/.test(src.awaitingFe)) {
  fails.push(`${FILES.awaitingFe}: must not render plain customer_name`);
}
if (!/customer_id::text AS customer_id/.test(src.bolSvc)) {
  fails.push(`${FILES.bolSvc}: listLoadsAwaitingBolInvoice must SELECT customer_id`);
}

if (!/kind="customer"/.test(src.needsAuthFe) || !/row\.customer_id/.test(src.needsAuthFe)) {
  fails.push(`${FILES.needsAuthFe}: Customer column must EntityLink via customer_id`);
}
if (!/kind="invoice"/.test(src.needsAuthFe) || !/row\.invoice_id/.test(src.needsAuthFe)) {
  fails.push(`${FILES.needsAuthFe}: Invoice column must EntityLink via invoice_id`);
}
if (!/l\.customer_id::text AS customer_id/.test(src.needsAuthBe) || !/i\.id::text AS invoice_id/.test(src.needsAuthBe)) {
  fails.push(`${FILES.needsAuthBe}: needs-delivery-authorization must SELECT customer_id + invoice_id`);
}

if (!/kind="driver"/.test(src.remintFe) || !/row\.driver_id/.test(src.remintFe)) {
  fails.push(`${FILES.remintFe}: Driver column must EntityLink via driver_id`);
}
if (/render:\s*\(row\)\s*=>\s*row\.driver_name\s*\?\?\s*["']— unassigned —["']/.test(src.remintFe)) {
  fails.push(`${FILES.remintFe}: must not render plain driver_name`);
}

if (!/customer_id: string \| null/.test(src.awaitingApi)) {
  fails.push(`${FILES.awaitingApi}: AwaitingBolInvoiceRow / NeedsDeliveryAuthorizationRow must declare customer_id`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plantAwaiting = src.awaitingFe.replace(/kind="customer"/g, 'kind="load"').replace(/row\.customer_id/g, "row.load_id");
  const plantRemint = src.remintFe.replace(/kind="driver"/g, 'kind="load"');
  const planted = [];
  if (!/kind="customer"/.test(plantAwaiting)) planted.push("awaiting");
  if (!/kind="driver"/.test(plantRemint)) planted.push("remint");
  if (planted.length < 2) {
    console.error(`${LABEL} --selftest FAIL plant weak`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Dispatch U29 queues EntityLink customer/driver/invoice`);
