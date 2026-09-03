#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  service: "apps/backend/src/accounting/proof-trail.service.ts",
  routes: "apps/backend/src/accounting/audit-trail/routes.ts",
  api: "apps/frontend/src/api/accounting.ts",
  panel: "apps/frontend/src/components/accounting/MoneyProofTrailPanel.tsx",
};
const mounts = {
  invoice: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
  bill: "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
  expense: "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx",
  payment: "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx",
  bill_payment: "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx",
  credit_memo: "apps/frontend/src/pages/accounting/CreditMemosPage.tsx",
  vendor_credit: "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx",
  settlement: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
  load: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
  driver_bill: "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx",
};

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

function audit(override = {}) {
  const source = Object.fromEntries(Object.entries(files).map(([key, rel]) => [key, override[key] ?? read(rel)]));
  const errors = [];
  for (const type of ["load", "invoice", "bill", "expense", "payment", "bill_payment", "credit_memo", "vendor_credit", "driver_bill", "settlement"]) {
    if (!new RegExp(`\\b${type}: \\{`).test(source.service)) errors.push(`service registry missing ${type}`);
  }
  if (!source.service.includes("p.source_trace_key = $4::text")) errors.push("ledger lookup must use immutable trace_key as well as source id");
  if (!source.service.includes("tsl.linked_object_type = $5::text")) errors.push("proof must include documents linked through the canonical transaction-source spine");
  if (!source.service.includes("p.operating_company_id = $2::uuid")) errors.push("ledger lookup must remain company scoped");
  if (!source.routes.includes('/api/v1/accounting/proof-trail/:documentType/:id')) errors.push("proof-trail GET route is not mounted");
  if (!source.api.includes("function getMoneyProofTrail")) errors.push("frontend API client is missing");
  if (!/kind="journal_entry"/.test(source.panel)) errors.push("proof panel must click through to the ledger JE");
  if (!source.panel.includes("No ledger posting exists for this document.")) errors.push("proof panel must expose honest unposted state");
  for (const [type, rel] of Object.entries(mounts)) {
    const text = override[rel] ?? read(rel);
    const panelMount = text.includes("MoneyProofTrailPanel") && text.includes(`documentType="${type}"`);
    const dedicatedLink = text.includes(`/accounting/proof-trail/${type}/`);
    if (!panelMount && !dedicatedLink) errors.push(`${rel} is missing ${type} proof trail`);
  }
  return errors;
}

function fail(errors) {
  console.error("verify-money-proof-trail-click-to-ledger FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const service = read(files.service);
  const panel = read(files.panel);
  const plants = [
    { service: service.replace("p.source_trace_key = $4::text", "p.source_trace_key = ''") },
    { service: service.replace("  settlement: {", "  settlement_removed: {") },
    { panel: panel.replace('kind="journal_entry"', 'kind="invoice"') },
  ];
  for (const plant of plants) if (audit(plant).length === 0) fail(["selftest planted mutation escaped"]);
  console.log(`verify-money-proof-trail-click-to-ledger SELFTEST PASS (${plants.length}/${plants.length})`);
} else {
  const errors = audit();
  if (errors.length) fail(errors);
  console.log("verify-money-proof-trail-click-to-ledger PASS (10 document types; 10 mounted surfaces; ledger click wired)");
}
