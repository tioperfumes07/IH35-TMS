/**
 * HIDE-VOIDED-01 — settlements default-hide cancelled; bill payments hide revoked unless
 * include_voided; customer payments list defaults to status=active.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hide-voided-filter";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const failures = [];

const setl = read("apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
if (!/settlements-hide-cancelled/.test(setl)) {
  failures.push("SettlementsPage must expose Hide cancelled checkbox (data-testid)");
}
if (!/hideCancelled && s\.status === "cancelled"/.test(setl)) {
  failures.push("SettlementsPage must filter cancelled when hideCancelled");
}
if (!/include_cancelled/.test(setl)) {
  failures.push("SettlementsPage must URL-persist include_cancelled");
}

const billPayPage = read("apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx");
if (!/bill-payments-hide-voided/.test(billPayPage)) {
  failures.push("BillPaymentsListPage must expose Hide voided checkbox");
}
if (!/include_voided:\s*hideVoided \? undefined : true/.test(billPayPage)) {
  failures.push("BillPaymentsListPage must pass include_voided when Hide voided is off");
}

const billPayApi = read("apps/frontend/src/api/accounting.ts");
if (!/include_voided\?: boolean/.test(billPayApi) || !/include_voided/.test(billPayApi)) {
  failures.push("listBillPayments client must accept include_voided");
}

const billPayRoutes = read("apps/backend/src/accounting/bills.routes.ts");
if (!/include_voided/.test(billPayRoutes)) {
  failures.push("GET /bill-payments must parse include_voided");
}

const billPaySvc = read("apps/backend/src/accounting/bills.service.ts");
if (!/includeVoided/.test(billPaySvc) || !/if \(!options\.includeVoided\)/.test(billPaySvc)) {
  failures.push("listBillPayments must only filter revoked_at when includeVoided is false");
}

const payments = read("apps/frontend/src/pages/accounting/PaymentsListPage.tsx");
if (!/useState<"all" \| "active" \| "voided">\("active"\)/.test(payments)) {
  failures.push("PaymentsListPage must default status filter to active (hide voided)");
}

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
process.exit(0);
