#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const servicePath = path.join(process.cwd(), "apps/backend/src/payroll/driver-settlement.service.ts");

function fail(message) {
  console.error(`verify:driver-settlement-uses-bill-not-je — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(servicePath)) fail(`missing required file: ${servicePath}`);

const source = fs.readFileSync(servicePath, "utf8");

if (!source.includes("createBill")) fail("posting path must create accounting Bill");
if (!source.includes("payBill")) fail("posting path must create accounting BillPayment");
if (source.includes("posting-engine.service")) fail("driver settlements cannot post through JE posting engine");
if (/journal_entries|manual-je|entry_type/i.test(source)) {
  fail("driver settlement posting must avoid JE semantics");
}

console.log("verify:driver-settlement-uses-bill-not-je — OK");
