#!/usr/bin/env node
/**
 * CLOSURE-15-DEEP-AUDIT-B — /accounting/invoices 17-tab subnav walk CI guard.
 * Asserts subnav-manifest entries, route manifest mounts, and AccountingSubNav on invoice context.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "deep-audit-b-invoices-subnav";

/** PASS-5 H6: 17 top-level subnav targets when entering via /accounting/invoices. */
const AUDIT_17_TABS = [
  { group: "Bills▾", path: "/accounting/bills", label: "Bill" },
  { group: "Settlements▾", path: "/accounting/dispute-queue", label: "Dispute queue" },
  { group: null, path: "/accounting/expenses", label: "Expenses" },
  { group: null, path: "/accounting/bill-payments", label: "Bill payment" },
  { group: null, path: "/accounting/maintenance-shop", label: "Maintenance & shop" },
  { group: null, path: "/accounting/vendors", label: "Vendors" },
  { group: null, path: "/accounting/customers", label: "Customers" },
  { group: null, path: "/accounting/reports", label: "Reports" },
  { group: null, path: "/reports/ar-aging", label: "AR Aging" },
  { group: null, path: "/accounting/collections", label: "Collections" },
  { group: null, path: "/reports/ap-aging", label: "AP Aging" },
  { group: null, path: "/accounting/invoices", label: "Invoices" },
  { group: null, path: "/accounting/multi-entity", label: "Multi-entity" },
  { group: null, path: "/accounting/payments", label: "Receive Payment" },
  { group: null, path: "/accounting/factoring", label: "Factoring" },
  { group: null, path: "/factoring/faro-import", label: "Faro CSV import" },
  { group: null, path: "/accounting/factor-reconciliation", label: "Factor reconciliation" },
];

const BILLS_CHILDREN = [
  "/accounting/bills",
  "/accounting/bills/maintenance",
  "/accounting/bills/repair",
  "/accounting/bills/fuel",
  "/accounting/bills/driver",
  "/accounting/bills/vendor",
  "/accounting/bills/multiple",
];

const SETTLEMENTS_CHILDREN = ["/accounting/dispute-queue", "/accounting/abandonment-queue"];

/** Pages that must keep AccountingSubNav when reached from invoice-context subnav. */
const PAGE_FILES_WITH_SUBNAV = [
  { path: "/accounting/invoices", file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx" },
  { path: "/accounting/bill-payments", file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx" },
  { path: "/accounting/collections", file: "apps/frontend/src/pages/accounting/CollectionsPage.tsx" },
  { path: "/accounting/factoring", file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx" },
  { path: "/accounting/factor-reconciliation", file: "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx" },
  { path: "/accounting/multi-entity", file: "apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx" },
  { path: "/accounting/payments", file: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx" },
];

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const subnavManifest = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");
const routeManifest = read("apps/frontend/src/routes/manifest.tsx");
// orphan-triage F1: AccountingSubNav.tsx (the old HoverDropdownNav-based "17-tab hover subnav")
// was a verified-dead, zero-render-consumer duplicate — verify-accounting-nav.mjs Check 4
// CI-forbids any OTHER page from importing it back, and it was never actually reached from
// InvoicesListPage.tsx (confirmed: that page only ever imported AccountingSubNavWrapper — the
// `.includes("AccountingSubNav")` checks below already pass via that substring, not the old file).
// It has been deleted; the live, unified nav is AccountingSubNavWrapper.tsx, checked here instead.
const accountingSubNavWrapper = read("apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx");
const invoicesPage = read("apps/frontend/src/pages/accounting/InvoicesListPage.tsx");

if (!invoicesPage.includes("AccountingSubNav")) {
  fail("InvoicesListPage must render AccountingSubNavWrapper (unified accounting subnav)");
}
if (!accountingSubNavWrapper.includes("startsWith(`${to}/`)") && !accountingSubNavWrapper.includes("startsWith(\"/accounting/invoices/\")")) {
  fail("AccountingSubNavWrapper must keep nested-route tab-active matching (was HoverDropdownNav's job pre-unification)");
}

for (const tab of AUDIT_17_TABS) {
  const hasInlinePath = subnavManifest.includes(`path: "${tab.path}"`);
  const hasCollectionsItem = tab.path === "/accounting/collections" && subnavManifest.includes("COLLECTIONS_SUBNAV_ITEM");
  if (!hasInlinePath && !hasCollectionsItem) {
    fail(`subnav-manifest missing path for ${tab.label}: ${tab.path}`);
  }
}

for (const child of BILLS_CHILDREN) {
  if (!subnavManifest.includes(`path: "${child}"`)) fail(`Bills dropdown missing child path ${child}`);
}
for (const child of SETTLEMENTS_CHILDREN) {
  if (!subnavManifest.includes(`path: "${child}"`)) fail(`Settlements dropdown missing child path ${child}`);
}

for (const tab of AUDIT_17_TABS) {
  if (!routeManifest.includes(`path="${tab.path}"`) && !routeManifest.includes(`path={COLLECTIONS_ROUTE.path}`)) {
    if (tab.path === "/accounting/collections") {
      if (!routeManifest.includes("COLLECTIONS_ROUTE")) fail("route manifest missing COLLECTIONS_ROUTE wiring");
      continue;
    }
    fail(`route manifest missing Route path="${tab.path}" for ${tab.label}`);
  }
}

for (const page of PAGE_FILES_WITH_SUBNAV) {
  const source = read(page.file);
  if (!source.includes("AccountingSubNav")) {
    fail(`${page.file} must render AccountingSubNav for ${page.path}`);
  }
}

// AccountingSubNavWrapper's generic tabActive() keeps ANY tab (incl. Invoices) active on nested
// detail paths via `pathname.startsWith(`${to}/`)` — equivalent to the retired file's hand-coded
// accountingSubNavActiveHref, verified above.

console.log(`[${LABEL}] PASS — ${AUDIT_17_TABS.length} subnav tabs + Bills/Settlements children + route mounts guarded`);
