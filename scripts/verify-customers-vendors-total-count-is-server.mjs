#!/usr/bin/env node
/**
 * verify-customers-vendors-total-count-is-server.mjs
 *
 * Locks PAGER-SERVERTOTAL-01 / tickets:
 *   - vend1-pagination-total-vs-length
 *   - cust1-vend1-pager-total-count-bug
 *
 * Root defect: Customers/Vendors list sidebars passed totalCount={*Sorted.length}
 * (in-memory page length after limit:5000), so pager math was wrong once the roster
 * exceeded the client fetch cap. The list routes already return a real COUNT as
 * `total`; the UI must use that server total — never `.length`.
 *
 * Asserts:
 *   1. GET customers + vendors list routes run SELECT count(*) and return `total`.
 *   2. listCustomers / listVendors thread `payload.total` to callers.
 *   3. Customers.tsx / Vendors.tsx do NOT pass `*.length` into totalCount=.
 *   4. Both pages bind totalCount to a server-total identifier (…ServerTotal / .total).
 *
 * Usage:
 *   node scripts/verify-customers-vendors-total-count-is-server.mjs
 *   node scripts/verify-customers-vendors-total-count-is-server.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customers-vendors-total-count-is-server";

const CUSTOMERS_PAGE = "apps/frontend/src/pages/Customers.tsx";
const VENDORS_PAGE = "apps/frontend/src/pages/Vendors.tsx";
const CUSTOMERS_ROUTE = "apps/backend/src/mdata/customers.routes.ts";
const VENDORS_ROUTE = "apps/backend/src/mdata/vendors.routes.ts";
const MDATA_API = "apps/frontend/src/api/mdata.ts";

function assertGuard(sources) {
  const errors = [];

  // 1 — backend COUNT + envelope `total`
  for (const [label, src, table] of [
    [CUSTOMERS_ROUTE, sources.customersRoute, "mdata.customers"],
    [VENDORS_ROUTE, sources.vendorsRoute, "mdata.vendors"],
  ]) {
    if (!new RegExp(`SELECT\\s+count\\(\\*\\)::int\\s+AS\\s+total\\s+FROM\\s+${table.replace(".", "\\.")}`, "i").test(src)) {
      errors.push(`${label}: list route must COUNT(*) AS total FROM ${table}`);
    }
    if (!/return\s*\{\s*(customers|vendors):\s*result\.rows\s*,\s*total:\s*result\.total\s*\}/.test(src)) {
      errors.push(`${label}: list route must return { …, total: result.total }`);
    }
  }

  // 2 — API clients expose server total (not page-length-only)
  if (!/export function listCustomers[\s\S]*?total:\s*payload\.total\s*\?\?\s*payload\.customers\.length/.test(sources.mdata)) {
    errors.push(`${MDATA_API}: listCustomers must thread payload.total (with length fallback)`);
  }
  if (!/export function listVendors[\s\S]*?total:\s*payload\.total\s*\?\?\s*payload\.vendors\.length/.test(sources.mdata)) {
    errors.push(`${MDATA_API}: listVendors must thread payload.total (with length fallback)`);
  }

  // 3 — pages must not pass array .length into totalCount
  for (const [label, src] of [
    [CUSTOMERS_PAGE, sources.customersPage],
    [VENDORS_PAGE, sources.vendorsPage],
  ]) {
    if (/totalCount=\{\s*[A-Za-z0-9_]+\.length\s*\}/.test(src)) {
      errors.push(`${label}: totalCount must not use .length — use server COUNT total`);
    }
  }

  // 4 — pages bind a server-total value into the sidebar pager
  if (!/totalCount=\{\s*customersServerTotal\s*\}/.test(sources.customersPage)) {
    errors.push(`${CUSTOMERS_PAGE}: totalCount must bind customersServerTotal (server COUNT)`);
  }
  if (!/customersServerTotal\s*=\s*customersQuery\.data\?\.total/.test(sources.customersPage)) {
    errors.push(`${CUSTOMERS_PAGE}: must read customersServerTotal from listCustomers().total`);
  }
  if (!/totalCount=\{\s*vendorsServerTotal\s*\}/.test(sources.vendorsPage)) {
    errors.push(`${VENDORS_PAGE}: totalCount must bind vendorsServerTotal (server COUNT)`);
  }
  if (!/vendorsServerTotal\s*=\s*vendorsQuery\.data\?\.total/.test(sources.vendorsPage)) {
    errors.push(`${VENDORS_PAGE}: must read vendorsServerTotal from listVendors().total`);
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

function selftest() {
  const goodCustomersRoute = `
    const countRes = await client.query(\`SELECT count(*)::int AS total FROM mdata.customers \${whereClause}\`, values);
    return { rows: enriched, total: countRes.rows[0]?.total ?? 0 };
    return { customers: result.rows, total: result.total };
  `;
  const goodVendorsRoute = `
    const countRes = await client.query(\`SELECT count(*)::int AS total FROM mdata.vendors \${whereClause}\`, values);
    return { rows: res.rows, total: countRes.rows[0]?.total ?? 0 };
    return { vendors: result.rows, total: result.total };
  `;
  const goodMdata = `
    export function listCustomers(params = {}) {
      return apiRequest(\`/api/v1/mdata/customers\`).then(
        (payload) => ({ customers: payload.customers, total: payload.total ?? payload.customers.length })
      );
    }
    export function listVendors(params = {}) {
      return apiRequest(\`/api/v1/mdata/vendors\`).then(
        (payload) => ({ vendors: payload.vendors, total: payload.total ?? payload.vendors.length })
      );
    }
  `;
  const goodCustomersPage = `
    const customersServerTotal = customersQuery.data?.total ?? 0;
    totalCount={customersServerTotal}
  `;
  const goodVendorsPage = `
    const vendorsServerTotal = vendorsQuery.data?.total ?? 0;
    totalCount={vendorsServerTotal}
  `;

  const base = {
    customersPage: goodCustomersPage,
    vendorsPage: goodVendorsPage,
    customersRoute: goodCustomersRoute,
    vendorsRoute: goodVendorsRoute,
    mdata: goodMdata,
  };

  const cases = [
    { name: "intact contract -> 0 errors", in: base, want: 0 },
    {
      name: "customers page uses .length -> FAIL",
      in: { ...base, customersPage: "totalCount={customersSorted.length}" },
      wantMin: 1,
    },
    {
      name: "vendors page uses .length -> FAIL",
      in: { ...base, vendorsPage: "totalCount={vendorsSorted.length}" },
      wantMin: 1,
    },
    {
      name: "customers route drops COUNT -> FAIL",
      in: { ...base, customersRoute: "return { customers: result.rows, total: result.total };" },
      wantMin: 1,
    },
    {
      name: "listCustomers drops total thread -> FAIL",
      in: {
        ...base,
        mdata: goodMdata.replace(
          "total: payload.total ?? payload.customers.length",
          "total: payload.customers.length"
        ),
      },
      wantMin: 1,
    },
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
});

if (errors.length) {
  console.error(`${LABEL} FAIL — customers/vendors pager totalCount must be server COUNT:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customers/vendors totalCount is server COUNT (not .length).`);
