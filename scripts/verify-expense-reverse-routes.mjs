#!/usr/bin/env node
/**
 * Rule-17 guard: expense reverse routes — account register + vendor history (Law §9 FAIL #3).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-reverse-routes";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertExpenseReverseRoutes() {
  const errors = [];
  const registerPage = read("apps/frontend/src/pages/accounting/AccountRegisterPage.tsx");
  const registerService = read("apps/backend/src/accounting/account-register.service.ts");
  const vendorDetail = read("apps/frontend/src/pages/VendorDetail.tsx");
  const expenseRoutes = read("apps/backend/src/accounting/expenses.routes.ts");

  if (!/t === ["']expense["'] && reference\)\s*return [`'"]\/accounting\/expenses\/\$\{reference\}[`'"]/.test(registerPage)) {
    errors.push("AccountRegisterPage: sourceRoute(expense) must include expense id");
  }
  if (!/source_transaction_type = 'expense'/.test(registerService) || !/ev\.vendor_name/.test(registerService)) {
    errors.push("account-register.service: must join expense→vendor for payee");
  }
  if (!/vendor_uuid/.test(expenseRoutes) || !/filters\.vendorUuid/.test(expenseRoutes)) {
    errors.push("expenses.routes: list must filter by vendor_uuid");
  }
  if (!/listExpenses\(companyId,\s*\{\s*vendor_uuid:\s*id/.test(vendorDetail) && !/vendor_uuid:\s*id/.test(vendorDetail)) {
    errors.push("VendorDetail: must list expenses filtered by vendor_uuid");
  }
  if (!/kind=["']expense["']/.test(vendorDetail)) {
    errors.push("VendorDetail: expense history must EntityLink kind=expense");
  }
  return errors;
}

function selftest() {
  const errors = assertExpenseReverseRoutes();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED — live sources rejected: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertExpenseReverseRoutes();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
