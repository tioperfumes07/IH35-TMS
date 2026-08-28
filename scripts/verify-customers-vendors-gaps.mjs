#!/usr/bin/env node
/**
 * verify-customers-vendors-gaps.mjs
 *
 * B20 (19-customers / 20-vendors) regression guard.
 *
 * The B20 gap cluster ("pagination / inline-create / no-create-button / false-empty")
 * was already CLOSED across prior PRs (FIX-PICKERS-50-CAP #1533, CUST-1/VEND-1 full-roster
 * fetch, the "+ Create" list buttons, LIST-EMPTY-1, and the A2 ReferenceSelect inline-create
 * keystone). This guard LOCKS those fixes so the whole class cannot silently regress in one
 * place while individual guards watch the others. It asserts, as a single contract:
 *
 *   1. The Customers LIST page loads the FULL roster (listCustomers passes limit > 50 — not the
 *      default-50 page that once hid ~1,159 of 1,209 customers).
 *   2. The Vendors LIST page loads the FULL roster (listVendors passes limit > 50).
 *   3. The backend customers + vendors list routes cap `limit` well ABOVE the old 50/200 cap
 *      (max ≥ 1000), so a >200 roster is not clamped server-side.
 *   4. The shared mdata query builder actually FORWARDS `limit` to the querystring (so the
 *      client limit isn't silently dropped — the driver/unit 50-cap class).
 *   5. Both list pages expose a create action using the §7 canonical verb "+ Create …"
 *      — never "+ Add …" / "+ New …".
 *   6. Customer + vendor PICKERS keep inline-create wired via the A2 ReferenceSelect keystone
 *      (createKind="vendor" and createKind="customer" both present in the codebase).
 *   7. QuickCreateEntityModal — the inline-create backend for those pickers — still supports the
 *      "vendor" and "customer" kinds.
 *
 * Usage:
 *   node scripts/verify-customers-vendors-gaps.mjs             # check real repo files
 *   node scripts/verify-customers-vendors-gaps.mjs --selftest  # inject regressions -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customers-vendors-gaps";

const CUSTOMERS_PAGE = "apps/frontend/src/pages/Customers.tsx";
const VENDORS_PAGE = "apps/frontend/src/pages/Vendors.tsx";
const CUSTOMERS_ROUTE = "apps/backend/src/mdata/customers.routes.ts";
const VENDORS_ROUTE = "apps/backend/src/mdata/vendors.routes.ts";
const MDATA_API = "apps/frontend/src/api/mdata.ts";
const QUICK_CREATE = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";
const FRONTEND_SRC = "apps/frontend/src";

// A roster fetch must page the FULL set, not the default 50-row first page.
const MIN_ROSTER_LIMIT = 50;
// The backend list cap must sit well above the retired 200-cap so a large roster isn't clamped.
const MIN_BACKEND_CAP = 1000;

/** Extract the numeric `limit:` passed to a list helper call, or null if absent. */
function listCallLimit(source, helper) {
  const m = new RegExp(`${helper}\\(\\{[^}]*\\blimit:\\s*(\\d+)`).exec(source);
  return m ? Number(m[1]) : null;
}

/** Extract the numeric `.max(N)` on the `limit:` zod schema in a route file, or null. */
function backendLimitCap(source) {
  const m = /limit:\s*z\.coerce[^\n]*?\.max\((\d+)\)/.exec(source);
  return m ? Number(m[1]) : null;
}

/**
 * Pure assertion core. `sources` supplies every file's text plus the concatenated
 * frontend source used for the inline-create presence scan. Returns an array of error strings.
 */
function assertGuard(sources) {
  const errors = [];

  // 1 + 2 — list pages load the full roster (limit > 50).
  const customerRosterIsComplete = /listAllCustomers\(\{[^}]*operating_company_id:\s*companyId[^}]*active_company_only:\s*true/.test(sources.customersPage);
  const custLimit = listCallLimit(sources.customersPage, "listCustomers");
  if (!customerRosterIsComplete && custLimit == null) {
    errors.push(`${CUSTOMERS_PAGE}: no listAllCustomers scoped roster fetch found (default-page cap risk).`);
  } else if (!customerRosterIsComplete && custLimit <= MIN_ROSTER_LIMIT) {
    errors.push(`${CUSTOMERS_PAGE}: listCustomers limit=${custLimit} truncates the roster (must exhaust total).`);
  }
  const vendorRosterIsComplete = /listAllVendors\(\{[^}]*operating_company_id:\s*companyId[^}]*active_company_only:\s*true/.test(sources.vendorsPage);
  const vendLimit = listCallLimit(sources.vendorsPage, "listVendors");
  if (!vendorRosterIsComplete && vendLimit == null) {
    errors.push(`${VENDORS_PAGE}: no listAllVendors scoped roster fetch found (default-page cap risk).`);
  } else if (!vendorRosterIsComplete && vendLimit <= MIN_ROSTER_LIMIT) {
    errors.push(`${VENDORS_PAGE}: listVendors limit=${vendLimit} truncates the roster (must be > ${MIN_ROSTER_LIMIT}).`);
  }

  // 3 — backend caps allow the full roster (> old 200-cap).
  const custCap = backendLimitCap(sources.customersRoute);
  if (custCap == null) {
    errors.push(`${CUSTOMERS_ROUTE}: could not find limit .max(N) cap on the list query schema.`);
  } else if (custCap < MIN_BACKEND_CAP) {
    errors.push(`${CUSTOMERS_ROUTE}: limit cap max(${custCap}) too low — a >${custCap} roster is clamped (must be >= ${MIN_BACKEND_CAP}).`);
  }
  const vendCap = backendLimitCap(sources.vendorsRoute);
  if (vendCap == null) {
    errors.push(`${VENDORS_ROUTE}: could not find limit .max(N) cap on the list query schema.`);
  } else if (vendCap < MIN_BACKEND_CAP) {
    errors.push(`${VENDORS_ROUTE}: limit cap max(${vendCap}) too low — a >${vendCap} roster is clamped (must be >= ${MIN_BACKEND_CAP}).`);
  }

  // 4 — the shared query builder forwards `limit` (otherwise the client limit is dropped).
  if (!/query\.set\(\s*["']limit["']\s*,\s*String\(\s*params\.limit\s*\)\s*\)/.test(sources.mdata)) {
    errors.push(`${MDATA_API}: appendCompanyScopedQuery must forward params.limit to the querystring.`);
  }

  // 5 — §7 canonical create verb on both list pages.
  if (!/\+\s*Create Customer/.test(sources.customersPage)) {
    errors.push(`${CUSTOMERS_PAGE}: missing "+ Create Customer" action (§7 canonical verb).`);
  }
  if (/\+\s*(Add|New) Customer/.test(sources.customersPage)) {
    errors.push(`${CUSTOMERS_PAGE}: create action uses "+ Add/New Customer" — §7 requires "+ Create".`);
  }
  if (!/\+\s*Create Vendor/.test(sources.vendorsPage)) {
    errors.push(`${VENDORS_PAGE}: missing "+ Create Vendor" action (§7 canonical verb).`);
  }
  if (/\+\s*(Add|New) Vendor/.test(sources.vendorsPage)) {
    errors.push(`${VENDORS_PAGE}: create action uses "+ Add/New Vendor" — §7 requires "+ Create".`);
  }

  // 6 — inline-create keystone wired for BOTH vendor and customer pickers.
  if (!/createKind=["']vendor["']/.test(sources.inlineCreateScan)) {
    errors.push(`inline-create: no ReferenceSelect createKind="vendor" found in ${FRONTEND_SRC} (vendor pickers lost inline "+ Create").`);
  }
  if (!/createKind=["']customer["']/.test(sources.inlineCreateScan)) {
    errors.push(`inline-create: no ReferenceSelect createKind="customer" found in ${FRONTEND_SRC} (customer pickers lost inline "+ Create").`);
  }

  // 7 — QuickCreateEntityModal still supports vendor + customer kinds.
  const kindUnion = /QuickCreateKind\s*=\s*([^;]+);/.exec(sources.quickCreate)?.[1] ?? "";
  if (!/["']vendor["']/.test(kindUnion)) {
    errors.push(`${QUICK_CREATE}: QuickCreateKind union no longer includes "vendor".`);
  }
  if (!/["']customer["']/.test(kindUnion)) {
    errors.push(`${QUICK_CREATE}: QuickCreateKind union no longer includes "customer".`);
  }

  return errors;
}

function readReal(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`${LABEL} FAIL: required file missing — ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, "utf8");
}

/** Concatenate every non-test .ts/.tsx under a dir for a presence scan. */
function collectSource(rel) {
  const root = path.join(ROOT, rel);
  let out = "";
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        walk(abs);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
        out += fs.readFileSync(abs, "utf8") + "\n";
      }
    }
  };
  walk(root);
  return out;
}

function selftest() {
  const goodCustomersPage = `
    queryFn: () => listAllCustomers({ operating_company_id: companyId, active_company_only: true }),
    <ActionButton onClick={() => setCreateOpen(true)}>+ Create Customer</ActionButton>
  `;
  const goodVendorsPage = `
    queryFn: () => listAllVendors({ operating_company_id: companyId, active_company_only: true }),
    <ActionButton onClick={() => setCreateOpen(true)}>+ Create Vendor</ActionButton>
  `;
  const goodCustomersRoute = `const q = z.object({ limit: z.coerce.number().int().min(1).max(5000).default(50), });`;
  const goodVendorsRoute = `const q = z.object({ limit: z.coerce.number().int().min(1).max(5000).default(50), });`;
  const goodMdata = `if (params.limit != null) query.set("limit", String(params.limit));`;
  const goodInlineScan = `<ReferenceSelect createKind="vendor" /> <ReferenceSelect createKind="customer" />`;
  const goodQuickCreate = `export type QuickCreateKind = "vendor" | "customer" | "item" | "category" | "part" | "class";`;

  const base = {
    customersPage: goodCustomersPage,
    vendorsPage: goodVendorsPage,
    customersRoute: goodCustomersRoute,
    vendorsRoute: goodVendorsRoute,
    mdata: goodMdata,
    inlineCreateScan: goodInlineScan,
    quickCreate: goodQuickCreate,
  };

  const cases = [
    { name: "all B20 invariants intact -> 0 errors", in: base, want: 0 },
    { name: "customers roster regressed to first page -> FAIL", in: { ...base, customersPage: goodCustomersPage.replace("listAllCustomers", "listCustomers") }, wantMin: 1 },
    { name: "vendors roster regressed to first page -> FAIL", in: { ...base, vendorsPage: goodVendorsPage.replace("listAllVendors", "listVendors") }, wantMin: 1 },
    { name: "backend customer cap regressed to max(200) -> FAIL", in: { ...base, customersRoute: goodCustomersRoute.replace("max(5000)", "max(200)") }, wantMin: 1 },
    { name: "mdata drops limit forwarding -> FAIL", in: { ...base, mdata: "// limit no longer forwarded" }, wantMin: 1 },
    { name: 'customers uses "+ Add Customer" -> FAIL', in: { ...base, customersPage: goodCustomersPage.replace("+ Create Customer", "+ Add Customer") }, wantMin: 1 },
    { name: 'vendors uses "+ New Vendor" -> FAIL', in: { ...base, vendorsPage: goodVendorsPage.replace("+ Create Vendor", "+ New Vendor") }, wantMin: 1 },
    { name: "vendor picker lost inline-create -> FAIL", in: { ...base, inlineCreateScan: `<ReferenceSelect createKind="customer" />` }, wantMin: 1 },
    { name: "customer picker lost inline-create -> FAIL", in: { ...base, inlineCreateScan: `<ReferenceSelect createKind="vendor" />` }, wantMin: 1 },
    { name: "QuickCreateKind dropped customer -> FAIL", in: { ...base, quickCreate: `export type QuickCreateKind = "vendor" | "item";` }, wantMin: 1 },
  ];

  let failed = 0;
  for (const c of cases) {
    const errs = assertGuard(c.in);
    const n = errs.length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed} case(s) did not behave as expected`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertGuard({
  customersPage: readReal(CUSTOMERS_PAGE),
  vendorsPage: readReal(VENDORS_PAGE),
  customersRoute: readReal(CUSTOMERS_ROUTE),
  vendorsRoute: readReal(VENDORS_ROUTE),
  mdata: readReal(MDATA_API),
  inlineCreateScan: collectSource(FRONTEND_SRC),
  quickCreate: readReal(QUICK_CREATE),
});

if (errors.length) {
  console.error(`${LABEL} FAIL — B20 customers/vendors gap invariants regressed:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — B20 customers/vendors gap invariants intact (pagination, "+ Create", inline-create).`);
