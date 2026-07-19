#!/usr/bin/env node
/**
 * verify-mgmt-report-aging-drill.mjs — RPT-PAR-1 / rpt-par1-mgmt-report-test-and-drill
 *
 * Fail-closed static guard + planted-failure selftest (Rule 16 + Rule 17).
 *
 * Locks:
 * 1. ManagementReportPackagePage is mounted at /reports/management and has behavioral tests
 * 2. A/R aging row drill uses invoice list ?customer_id=&status=with_balance (existing contract)
 * 3. A/P aging row drill uses bills list ?vendor_id=&status=unpaid (existing Pay-now contract)
 * 4. Customer/vendor profile entry points remain additively (never deleted)
 * 5. InvoicesListPage honors ?status= deep-link (with_balance) so AR drill lands filtered
 * 6. Shared href builders invent no query params beyond verified contracts
 * 7. Routes remain registered in manifest
 *
 * Usage:
 *   node scripts/verify-mgmt-report-aging-drill.mjs
 *   node scripts/verify-mgmt-report-aging-drill.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.VERIFY_MGMT_REPORT_AGING_DRILL_ROOT
  ? path.resolve(process.env.VERIFY_MGMT_REPORT_AGING_DRILL_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LABEL = "verify-mgmt-report-aging-drill";

const PATHS = {
  mgmt: "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
  mgmtTest: "apps/frontend/src/pages/reports/__tests__/ManagementReportPackagePage.test.tsx",
  ar: "apps/frontend/src/pages/reports/ARAgingPage.tsx",
  ap: "apps/frontend/src/pages/reports/APAgingPage.tsx",
  drill: "apps/frontend/src/pages/reports/agingDrillThrough.ts",
  drillTest: "apps/frontend/src/pages/reports/__tests__/agingDrillThrough.test.ts",
  arTest: "apps/frontend/src/pages/reports/__tests__/ARAgingPage.test.tsx",
  apTest: "apps/frontend/src/pages/reports/__tests__/APAgingPage.test.tsx",
  invoices: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
  invoicesTest: "apps/frontend/src/pages/accounting/__tests__/InvoicesListPage.statusDeeplink.test.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
};

function read(rel) {
  const abs = path.join(ROOT, rel);
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check(sources) {
  const f = [];

  for (const [key, rel] of Object.entries(PATHS)) {
    if (!sources[key]) f.push(`MISSING: ${rel}`);
  }
  if (f.length) return f;

  const { mgmt, mgmtTest, ar, ap, drill, drillTest, arTest, apTest, invoices, invoicesTest, manifest } = sources;

  // ── Management package mounted + tested ──────────────────────────────────
  if (!/path="\/reports\/management"/.test(manifest)) {
    f.push(`${PATHS.manifest}: /reports/management route missing`);
  }
  if (!/ManagementReportPackagePage/.test(manifest)) {
    f.push(`${PATHS.manifest}: ManagementReportPackagePage must be mounted`);
  }
  if (!/export function ManagementReportPackagePage/.test(mgmt)) {
    f.push(`${PATHS.mgmt}: ManagementReportPackagePage export missing`);
  }
  if (!/company-overview|sales-performance|expenses-performance/.test(mgmt)) {
    f.push(`${PATHS.mgmt}: QBO package types missing`);
  }
  if (!/describe\(["']ManagementReportPackagePage["']/.test(mgmtTest)) {
    f.push(`${PATHS.mgmtTest}: behavioral suite missing`);
  }
  if (!/operating_company_id|Select an operating company/.test(mgmtTest)) {
    f.push(`${PATHS.mgmtTest}: entity-scoping coverage missing`);
  }
  if (!/keyboard|toHaveFocus|\{Enter\}/.test(mgmtTest)) {
    f.push(`${PATHS.mgmtTest}: keyboard/a11y coverage missing`);
  }

  // ── Shared drill contracts (no invented params) ──────────────────────────
  if (!/status:\s*["']with_balance["']/.test(drill) || !/customer_id/.test(drill)) {
    f.push(`${PATHS.drill}: A/R href must use customer_id + status=with_balance`);
  }
  if (!/status:\s*["']unpaid["']/.test(drill) || !/vendor_id/.test(drill)) {
    f.push(`${PATHS.drill}: A/P href must use vendor_id + status=unpaid`);
  }
  if (/aging_bucket|bucket=|as_of=/.test(drill)) {
    f.push(`${PATHS.drill}: invented aging query params are forbidden`);
  }
  if (!/tab=billing/.test(drill) || !/tab=ap/.test(drill)) {
    f.push(`${PATHS.drill}: profile hrefs (tab=billing / tab=ap) must remain`);
  }
  if (!/with_balance/.test(drillTest) || !/unpaid/.test(drillTest)) {
    f.push(`${PATHS.drillTest}: contract unit tests missing`);
  }

  // ── A/R aging page ───────────────────────────────────────────────────────
  if (!/arAgingInvoiceListHref/.test(ar)) {
    f.push(`${PATHS.ar}: row drill must use arAgingInvoiceListHref`);
  }
  if (/onRowClick=\{\(r\)\s*=>\s*navigate\(`\/customers\//.test(ar)) {
    f.push(`${PATHS.ar}: row click must NOT drill only to customer profile`);
  }
  if (!/Customer profile/.test(ar) || !/arAgingCustomerProfileHref/.test(ar)) {
    f.push(`${PATHS.ar}: Customer profile row action must remain (additive)`);
  }
  if (!/arAgingInvoiceListHref/.test(arTest) || !/Customer profile/.test(arTest)) {
    f.push(`${PATHS.arTest}: drill + profile behavioral coverage missing`);
  }
  if (!/keyboard|\{Enter\}|toHaveFocus/.test(arTest)) {
    f.push(`${PATHS.arTest}: keyboard/a11y coverage missing`);
  }
  if (!/Select an operating company/.test(arTest)) {
    f.push(`${PATHS.arTest}: entity-scoping coverage missing`);
  }

  // ── A/P aging page ───────────────────────────────────────────────────────
  if (!/apAgingBillsListHref/.test(ap)) {
    f.push(`${PATHS.ap}: row drill must use apAgingBillsListHref`);
  }
  if (/onRowClick=\{\(r\)\s*=>\s*\{[\s\S]*navigate\(`\/vendors\//.test(ap)) {
    f.push(`${PATHS.ap}: row click must NOT drill only to vendor profile`);
  }
  if (!/Pay now/.test(ap) || !/apAgingBillsListHref/.test(ap)) {
    f.push(`${PATHS.ap}: Pay now must remain and target unpaid bills list`);
  }
  if (!/Vendor profile/.test(ap) || !/apAgingVendorProfileHref/.test(ap)) {
    f.push(`${PATHS.ap}: Vendor profile row action must remain (additive)`);
  }
  if (!/Pay now/.test(apTest) || !/Vendor profile/.test(apTest)) {
    f.push(`${PATHS.apTest}: Pay now + profile behavioral coverage missing`);
  }
  if (!/keyboard|\{Enter\}|toHaveFocus|["'] ["']/.test(apTest)) {
    f.push(`${PATHS.apTest}: keyboard/a11y coverage missing`);
  }

  // ── Invoice list consumes status deep-link ───────────────────────────────
  if (!/searchParams\.get\(\s*["']status["']\s*\)/.test(invoices)) {
    f.push(`${PATHS.invoices}: must seed status from searchParams.get("status")`);
  }
  if (!/with_balance/.test(invoices)) {
    f.push(`${PATHS.invoices}: with_balance filter must remain available`);
  }
  if (!/searchParams\.get\(\s*["']customer_id["']\s*\)/.test(invoices)) {
    f.push(`${PATHS.invoices}: customer_id deep-link must remain`);
  }
  if (!/with_balance/.test(invoicesTest) || !/customer_id/.test(invoicesTest)) {
    f.push(`${PATHS.invoicesTest}: status+customer_id deep-link behavioral test missing`);
  }

  // ── Routes for aging pages ───────────────────────────────────────────────
  if (!/path="\/reports\/ar-aging"/.test(manifest) || !/path="\/reports\/ap-aging"/.test(manifest)) {
    f.push(`${PATHS.manifest}: /reports/ar-aging and /reports/ap-aging must remain`);
  }
  if (!/path="\/accounting\/invoices"/.test(manifest) || !/path="\/accounting\/bills"/.test(manifest)) {
    f.push(`${PATHS.manifest}: invoice/bill list routes must remain`);
  }

  return f;
}

export function run() {
  const sources = Object.fromEntries(Object.entries(PATHS).map(([k, rel]) => [k, read(rel)]));
  return check(sources);
}

function selftest() {
  const good = Object.fromEntries(
    Object.entries(PATHS).map(([k]) => [
      k,
      "placeholder",
    ])
  );

  good.mgmt = `
    export function ManagementReportPackagePage() {}
    const PACKAGES = { "company-overview": {}, "sales-performance": {}, "expenses-performance": {} };
  `;
  good.mgmtTest = `
    describe("ManagementReportPackagePage", () => {
      it("entity", () => { expect("Select an operating company"); });
      it("a11y", () => { expect("keyboard"); toHaveFocus(); "{Enter}"; });
    });
  `;
  good.ar = `
    import { arAgingInvoiceListHref, arAgingCustomerProfileHref } from "./agingDrillThrough";
    onRowClick={(r) => navigate(arAgingInvoiceListHref(r.customer_id))}
    <Button>Customer profile</Button>
    arAgingCustomerProfileHref(r.customer_id)
  `;
  good.ap = `
    import { apAgingBillsListHref, apAgingVendorProfileHref } from "./agingDrillThrough";
    onRowClick={(r) => { navigate(apAgingBillsListHref(r.vendor_id)); }}
    Pay now
    Vendor profile
    apAgingBillsListHref(r.vendor_id)
    apAgingVendorProfileHref(r.vendor_id)
  `;
  good.drill = `
    export function arAgingInvoiceListHref(id) {
      return new URLSearchParams({ customer_id: id, status: "with_balance" });
    }
    export function apAgingBillsListHref(id) {
      return new URLSearchParams({ vendor_id: id, status: "unpaid" });
    }
    export function arAgingCustomerProfileHref(id) { return \`/customers/\${id}?tab=billing\`; }
    export function apAgingVendorProfileHref(id) { return \`/vendors/\${id}?tab=ap\`; }
  `;
  good.drillTest = `with_balance unpaid customer_id vendor_id`;
  good.arTest = `
    arAgingInvoiceListHref Customer profile
    keyboard {Enter} toHaveFocus
    Select an operating company
  `;
  good.apTest = `
    Pay now Vendor profile
    keyboard {Enter} toHaveFocus " "
  `;
  good.invoices = `
    const initialStatus = searchParams.get("status");
    searchParams.get("customer_id")
    with_balance
  `;
  good.invoicesTest = `with_balance customer_id status deeplink`;
  good.manifest = `
    path="/reports/management"
    ManagementReportPackagePage
    path="/reports/ar-aging"
    path="/reports/ap-aging"
    path="/accounting/invoices"
    path="/accounting/bills"
  `;

  const checks = [
    ["healthy tree passes", check(good).length === 0],
    [
      "profile-only AR row click caught",
      check({
        ...good,
        ar: good.ar
          .replace("arAgingInvoiceListHref(r.customer_id)", "`/customers/${r.customer_id}?tab=billing`")
          .replace("onRowClick={(r) => navigate(arAgingInvoiceListHref(r.customer_id))}", "onRowClick={(r) => navigate(`/customers/${r.customer_id}?tab=billing`)}"),
      }).some((x) => x.includes("must NOT drill only to customer profile") || x.includes("arAgingInvoiceListHref")),
    ],
    [
      "missing Pay now caught",
      check({ ...good, ap: good.ap.replace(/Pay now/g, "Settle") }).some((x) => x.includes("Pay now")),
    ],
    [
      "invented aging_bucket param caught",
      check({ ...good, drill: good.drill + '\naging_bucket: "61+"' }).some((x) => x.includes("invented")),
    ],
    [
      "missing invoice status deep-link caught",
      check({
        ...good,
        invoices: good.invoices.replace('searchParams.get("status")', 'searchParams.get("foo")'),
      }).some((x) => x.includes('searchParams.get("status")')),
    ],
    [
      "missing management test suite caught",
      check({ ...good, mgmtTest: "describe('Other')" }).some((x) => x.includes("behavioral suite")),
    ],
    [
      "missing route caught",
      check({ ...good, manifest: good.manifest.replace('path="/reports/management"', "") }).some((x) =>
        x.includes("/reports/management")
      ),
    ],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} cases)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const line of failures) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
