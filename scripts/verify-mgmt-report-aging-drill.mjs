#!/usr/bin/env node
/**
 * verify-mgmt-report-aging-drill.mjs — RPT-PAR-1 / rpt-par1-mgmt-report-test-and-drill
 *
 * Fail-closed static guard + planted-failure selftest (Rule 16 + Rule 17).
 *
 * Locks:
 * 1. ManagementReportPackagePage is mounted at /reports/management and has behavioral tests
 * 2. A/R aging row drill uses invoice list ?customer_id=&has_balance=true (server filter)
 * 3. A/P aging row drill uses bills list ?vendor_id=&has_balance=true (includes partial; not unpaid-only)
 * 4. Invoices list API accepts has_balance and filters amount_open BEFORE LIMIT/OFFSET
 * 5. Customer/vendor profile + A/R Open invoices + A/P Pay-now remain additively
 * 6. InvoicesListPage syncs customer/status/has_balance bidirectionally with searchParams
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
  bills: "apps/frontend/src/pages/accounting/BillsPage.tsx",
  billsTest: "apps/frontend/src/pages/accounting/__tests__/BillsPage.hasBalanceDeeplink.test.tsx",
  invoicesApi: "apps/frontend/src/api/accounting.ts",
  invoicesRoutes: "apps/backend/src/accounting/invoices.routes.ts",
  invoicesHasBalanceTest: "apps/backend/src/accounting/__tests__/invoices-has-balance-filter.test.ts",
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

  const {
    mgmt,
    mgmtTest,
    ar,
    ap,
    drill,
    drillTest,
    arTest,
    apTest,
    invoices,
    invoicesTest,
    bills,
    billsTest,
    invoicesApi,
    invoicesRoutes,
    invoicesHasBalanceTest,
    manifest,
  } = sources;

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

  // ── Shared drill contracts (server has_balance — no client with_balance / unpaid-only) ──
  if (!/has_balance:\s*["']true["']/.test(drill) || !/customer_id/.test(drill)) {
    f.push(`${PATHS.drill}: A/R href must use customer_id + has_balance=true`);
  }
  if (/status:\s*["']with_balance["']/.test(drill)) {
    f.push(`${PATHS.drill}: client-only status=with_balance is forbidden for A/R drill`);
  }
  if (!/has_balance:\s*["']true["']/.test(drill) || !/vendor_id/.test(drill)) {
    f.push(`${PATHS.drill}: A/P href must use vendor_id + has_balance=true`);
  }
  if (/status:\s*["']unpaid["']/.test(drill)) {
    f.push(`${PATHS.drill}: A/P drill must not map to status=unpaid/open-only`);
  }
  if (/aging_bucket|bucket=|as_of=/.test(drill)) {
    f.push(`${PATHS.drill}: invented aging query params are forbidden`);
  }
  if (!/tab=billing/.test(drill) || !/tab=ap/.test(drill)) {
    f.push(`${PATHS.drill}: profile hrefs (tab=billing / tab=ap) must remain`);
  }
  if (!/has_balance/.test(drillTest) || !/customer_id/.test(drillTest) || !/vendor_id/.test(drillTest)) {
    f.push(`${PATHS.drillTest}: has_balance contract unit tests missing`);
  }

  // ── Server invoices has_balance BEFORE LIMIT ─────────────────────────────
  if (!/has_balance/.test(invoicesRoutes)) {
    f.push(`${PATHS.invoicesRoutes}: list schema must accept has_balance`);
  }
  if (!/COALESCE\(i\.amount_open_cents,\s*0\)\s*>\s*0/.test(invoicesRoutes)) {
    f.push(`${PATHS.invoicesRoutes}: has_balance must filter amount_open_cents > 0`);
  }
  if (!/status NOT IN \('draft', 'void', 'voided', 'paid'\)/.test(invoicesRoutes)) {
    f.push(`${PATHS.invoicesRoutes}: has_balance must exclude draft/voided/paid`);
  }
  if (!/SELECT COUNT\(\*\)::int AS total/.test(invoicesRoutes)) {
    f.push(`${PATHS.invoicesRoutes}: must COUNT with same WHERE for truthful total`);
  }
  if (!/has_more/.test(invoicesRoutes)) {
    f.push(`${PATHS.invoicesRoutes}: must return has_more`);
  }
  const hbIdx = invoicesRoutes.indexOf("if (q.has_balance)");
  const limIdx = invoicesRoutes.indexOf("LIMIT $", hbIdx);
  if (hbIdx < 0 || limIdx < 0 || limIdx < hbIdx) {
    f.push(`${PATHS.invoicesRoutes}: has_balance filter must apply before LIMIT`);
  }
  if (!/has_balance/.test(invoicesApi) || !/listInvoices/.test(invoicesApi)) {
    f.push(`${PATHS.invoicesApi}: listInvoices must pass has_balance`);
  }
  if (!/has_balance/.test(invoicesHasBalanceTest) || !/amount_open_cents/.test(invoicesHasBalanceTest)) {
    f.push(`${PATHS.invoicesHasBalanceTest}: route/service has_balance coverage missing`);
  }
  // Entity-scope (verify-mdata-entity-scope): predicates must live in SQL template literals.
  if (!/c\.operating_company_id = i\.operating_company_id/.test(invoicesRoutes)) {
    f.push(`${PATHS.invoicesRoutes}: COUNT/LIST must join customers with c.operating_company_id = i.operating_company_id`);
  }
  if (!/c\.operating_company_id = \$1/.test(invoicesRoutes)) {
    f.push(`${PATHS.invoicesRoutes}: COUNT/LIST must also bind c.operating_company_id = $1`);
  }
  if (!/i\.operating_company_id = \$1/.test(invoicesRoutes)) {
    f.push(`${PATHS.invoicesRoutes}: COUNT/LIST must keep i.operating_company_id = $1 in SQL literals`);
  }
  if (!/l\.operating_company_id = i\.operating_company_id/.test(invoicesRoutes)) {
    f.push(`${PATHS.invoicesRoutes}: LIST LEFT JOIN mdata.loads must scope l.operating_company_id in ON`);
  }

  // ── A/R aging page ───────────────────────────────────────────────────────
  if (!/arAgingInvoiceListHref/.test(ar)) {
    f.push(`${PATHS.ar}: row drill must use arAgingInvoiceListHref`);
  }
  if (/onRowClick=\{\(r\)\s*=>\s*navigate\(`\/customers\//.test(ar)) {
    f.push(`${PATHS.ar}: row click must NOT drill only to customer profile`);
  }
  if (!/Open invoices/.test(ar) || !/arAgingInvoiceListHref/.test(ar)) {
    f.push(`${PATHS.ar}: Open invoices keyboard row action must mirror A/P Pay-now`);
  }
  if (!/Customer profile/.test(ar) || !/arAgingCustomerProfileHref/.test(ar)) {
    f.push(`${PATHS.ar}: Customer profile row action must remain (additive)`);
  }
  if (!/Open invoices/.test(arTest) || !/Customer profile/.test(arTest)) {
    f.push(`${PATHS.arTest}: Open invoices + profile behavioral coverage missing`);
  }
  if (!/keyboard|\{Enter\}|toHaveFocus|["'] ["']/.test(arTest)) {
    f.push(`${PATHS.arTest}: keyboard/a11y coverage missing (Enter/Space)`);
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
    f.push(`${PATHS.ap}: Pay now must remain and target has_balance bills list`);
  }
  if (!/Vendor profile/.test(ap) || !/apAgingVendorProfileHref/.test(ap)) {
    f.push(`${PATHS.ap}: Vendor profile row action must remain (additive)`);
  }
  if (!/Pay now/.test(apTest) || !/Vendor profile/.test(apTest) || !/has_balance/.test(apTest)) {
    f.push(`${PATHS.apTest}: Pay now + profile + has_balance behavioral coverage missing`);
  }
  if (!/keyboard|\{Enter\}|toHaveFocus|["'] ["']/.test(apTest)) {
    f.push(`${PATHS.apTest}: keyboard/a11y coverage missing`);
  }

  // ── Bills list consumes has_balance deep-link ────────────────────────────
  if (!/has_balance/.test(bills) || !/listBills/.test(bills)) {
    f.push(`${PATHS.bills}: must pass has_balance from searchParams to listBills`);
  }
  if (!/has_balance/.test(billsTest)) {
    f.push(`${PATHS.billsTest}: has_balance deep-link test missing`);
  }

  // ── Invoice list: server has_balance + bidirectional searchParams ────────
  if (!/has_balance/.test(invoices) || !/setSearchParams/.test(invoices)) {
    f.push(`${PATHS.invoices}: must sync has_balance via setSearchParams`);
  }
  if (!/searchParams\.get\(\s*["']customer_id["']\s*\)/.test(invoices)) {
    f.push(`${PATHS.invoices}: customer_id deep-link must remain`);
  }
  if (!/invoiceFilterFromSearchParams|has_balance/.test(invoices)) {
    f.push(`${PATHS.invoices}: must derive filters from searchParams (bidirectional)`);
  }
  // Client-only with_balance page slice over amount_open_cents is forbidden.
  if (/status === ["']with_balance["']\s*\)\s*return all\.filter/.test(invoices)) {
    f.push(`${PATHS.invoices}: client-only with_balance page filter is forbidden`);
  }
  if (!/has_balance/.test(invoicesTest) || !/customer_id/.test(invoicesTest)) {
    f.push(`${PATHS.invoicesTest}: has_balance + customer_id deep-link behavioral test missing`);
  }
  if (!/searchParams|location-search|navigate|popstate|back-forward|bidirectional/.test(invoicesTest)) {
    f.push(`${PATHS.invoicesTest}: bidirectional / popstate / query-change coverage missing`);
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
  const good = Object.fromEntries(Object.entries(PATHS).map(([k]) => [k, "placeholder"]));

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
    Open invoices
    <Button>Customer profile</Button>
    arAgingCustomerProfileHref(r.customer_id)
    arAgingInvoiceListHref(r.customer_id)
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
      return new URLSearchParams({ customer_id: id, has_balance: "true" });
    }
    export function apAgingBillsListHref(id) {
      return new URLSearchParams({ vendor_id: id, has_balance: "true" });
    }
    export function arAgingCustomerProfileHref(id) { return \`/customers/\${id}?tab=billing\`; }
    export function apAgingVendorProfileHref(id) { return \`/vendors/\${id}?tab=ap\`; }
  `;
  good.drillTest = `has_balance customer_id vendor_id`;
  good.arTest = `
    Open invoices Customer profile
    keyboard {Enter} toHaveFocus " "
    Select an operating company
  `;
  good.apTest = `
    Pay now Vendor profile has_balance
    keyboard {Enter} toHaveFocus " "
  `;
  good.invoices = `
    function invoiceFilterFromSearchParams(searchParams) {
      searchParams.get("customer_id");
      searchParams.get("has_balance");
    }
    setSearchParams
    has_balance
  `;
  good.invoicesTest = `has_balance customer_id bidirectional searchParams popstate back-forward`;
  good.bills = `has_balance listBills searchParams.get("has_balance")`;
  good.billsTest = `has_balance vendor_id`;
  good.invoicesApi = `export function listInvoices() { has_balance }`;
  good.invoicesRoutes = `
    has_balance: z.coerce.boolean().optional(),
    if (q.has_balance) {
      COALESCE(i.amount_open_cents, 0) > 0
      i.voided_at IS NULL
      i.status NOT IN ('draft', 'void', 'voided', 'paid')
    }
    SELECT COUNT(*)::int AS total
    JOIN mdata.customers c
      ON c.id = i.customer_id
     AND c.operating_company_id = i.operating_company_id
     AND c.operating_company_id = $1
    LEFT JOIN mdata.loads l
      ON l.id = i.source_load_id
     AND l.operating_company_id = i.operating_company_id
    WHERE i.operating_company_id = $1
    LIMIT $\${limitIdx}
    has_more
  `;
  good.invoicesHasBalanceTest = `has_balance amount_open_cents LIMIT`;
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
          .replace(
            "onRowClick={(r) => navigate(arAgingInvoiceListHref(r.customer_id))}",
            "onRowClick={(r) => navigate(`/customers/${r.customer_id}?tab=billing`)}"
          ),
      }).some((x) => x.includes("must NOT drill only to customer profile") || x.includes("arAgingInvoiceListHref")),
    ],
    [
      "missing Pay now caught",
      check({ ...good, ap: good.ap.replace(/Pay now/g, "Settle") }).some((x) => x.includes("Pay now")),
    ],
    [
      "unpaid-only AP drill caught",
      check({
        ...good,
        drill: good.drill.replace('has_balance: "true"', 'status: "unpaid"').replace(
          'has_balance: "true"',
          'status: "unpaid"'
        ),
      }).some((x) => x.includes("unpaid") || x.includes("has_balance")),
    ],
    [
      "client with_balance AR drill caught",
      check({
        ...good,
        drill: `
          export function arAgingInvoiceListHref(id) {
            return new URLSearchParams({ customer_id: id, status: "with_balance" });
          }
          export function apAgingBillsListHref(id) {
            return new URLSearchParams({ vendor_id: id, has_balance: "true" });
          }
          export function arAgingCustomerProfileHref(id) { return \`/customers/\${id}?tab=billing\`; }
          export function apAgingVendorProfileHref(id) { return \`/vendors/\${id}?tab=ap\`; }
        `,
      }).some((x) => x.includes("with_balance") || x.includes("has_balance")),
    ],
    [
      "invented aging_bucket param caught",
      check({ ...good, drill: good.drill + '\naging_bucket: "61+"' }).some((x) => x.includes("invented")),
    ],
    [
      "missing Open invoices caught",
      check({ ...good, ar: good.ar.replace(/Open invoices/g, "View") }).some((x) => x.includes("Open invoices")),
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
    // Also dump first failure details for debugging
    for (const [n, ok] of checks) {
      if (!ok) {
        if (n === "healthy tree passes") {
          console.error("  healthy failures:", check(good));
        }
      }
    }
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
