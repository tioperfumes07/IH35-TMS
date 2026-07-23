#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pe = fs.readFileSync(path.join(root, "apps/backend/src/accounting/posting-engine.service.ts"), "utf8");
if (!pe.includes("resolveCustomerPaymentDepositAccount")) {
  console.error("FAIL: soft-resolve helper missing");
  process.exit(1);
}
if (!pe.includes("ops_checking")) {
  console.error("FAIL: must soft-handle ops_checking");
  process.exit(1);
}
console.log("PASS: verify-acct-receive-payment-deposit-softresolve");
