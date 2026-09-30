#!/usr/bin/env node
// A-25 (Lead ruling r294d, 2026-09-30, owner via C-25): "three counterparties, three money
// directions -- never one mixed table." DRIVER (settlement pay dispute), CUSTOMER (invoice
// dispute), and VENDOR (bill dispute, no table exists) must never be read through a shared query.
// Asserts the two real dispute services never reference the other's table.
//
// Usage: node scripts/verify-dispute-object-sets-never-share-a-query.mjs [--selftest]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispute-object-sets-never-share-a-query";

const DRIVER_FILE = "apps/backend/src/driver-finance/settlement-dispute.service.ts";
const CUSTOMER_FILE = "apps/backend/src/accounting/invoice-disputes.service.ts";

export function findCrossReferences({ driverSrc, customerSrc }) {
  const problems = [];
  if (/FROM\s+accounting\.invoice_disputes/i.test(driverSrc)) {
    problems.push(`${DRIVER_FILE} queries accounting.invoice_disputes — driver-side must never read the customer table`);
  }
  if (/FROM\s+driver_finance\.\w*settlement_disputes/i.test(customerSrc)) {
    problems.push(`${CUSTOMER_FILE} queries a driver_finance settlement-dispute table — customer-side must never read the driver table`);
  }
  return problems;
}

function selftest() {
  const cleanDriver = `SELECT * FROM driver_finance.driver_settlement_disputes d`;
  const cleanCustomer = `SELECT * FROM accounting.invoice_disputes d`;
  if (findCrossReferences({ driverSrc: cleanDriver, customerSrc: cleanCustomer }).length) {
    throw new Error("expected PASS on clean, separated sources");
  }
  const dirtyDriver = `${cleanDriver}\nSELECT * FROM accounting.invoice_disputes`;
  if (!findCrossReferences({ driverSrc: dirtyDriver, customerSrc: cleanCustomer }).length) {
    throw new Error("expected FAIL when driver service reads the customer table");
  }
  const dirtyCustomer = `${cleanCustomer}\nSELECT * FROM driver_finance.driver_settlement_disputes`;
  if (!findCrossReferences({ driverSrc: cleanDriver, customerSrc: dirtyCustomer }).length) {
    throw new Error("expected FAIL when customer service reads the driver table");
  }
  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const driverSrc = fs.readFileSync(path.join(ROOT, DRIVER_FILE), "utf8");
  const customerSrc = fs.readFileSync(path.join(ROOT, CUSTOMER_FILE), "utf8");
  const problems = findCrossReferences({ driverSrc, customerSrc });
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — driver-side and customer-side dispute services never query each other's table`);
}
