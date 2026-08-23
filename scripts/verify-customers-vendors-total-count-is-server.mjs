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
const CUSTOMER_EDIT_MODAL = "apps/frontend/src/components/customers/CustomerEditModal.tsx";

function assertGuard(sources) {
  const errors = [];

  const hasServerCount = (src, table) => {
    const literal = new RegExp(`SELECT\\s+count\\(\\*\\)::int\\s+AS\\s+total\\s+FROM\\s+${table.replace(".", "\\.")}`, "i");
    if (literal.test(src)) return true;
    const fromClauseRoot = new RegExp(`const\\s+fromClause\\s*=.*["']${table.replace(".", "\\.")}["']`);
    return fromClauseRoot.test(src) && /SELECT\s+count\(\*\)::int\s+AS\s+total\s+FROM\s+\$\{fromClause\}/i.test(src);
  };

  // 1 — backend COUNT + envelope `total`
  for (const [label, src, table] of [
    [CUSTOMERS_ROUTE, sources.customersRoute, "mdata.customers"],
    [VENDORS_ROUTE, sources.vendorsRoute, "mdata.vendors"],
  ]) {
    if (!hasServerCount(src, table)) {
      errors.push(`${label}: list route must COUNT(*) AS total FROM ${table}`);
    }
    if (!/return\s*\{\s*(customers|vendors):\s*result\.rows\s*,\s*total:\s*result\.total\s*\}/.test(src)) {
      errors.push(`${label}: list route must return { …, total: result.total }`);
    }
  }

  // 2 — API clients expose server total (not page-length-only) AND always normalize collection to T[]
  // LV-CUSTOMERS-FULL-EDIT-LIST-RESPONSE-NOT-ARRAY: non-array `customers` crashed Full Edit `.map`.
  if (!/function normalizeMdataListRows[\s\S]*?Array\.isArray\(raw\)/.test(sources.mdata)) {
    errors.push(`${MDATA_API}: must export normalizeMdataListRows that Array.isArray-guards list envelopes`);
  }
  const listCustomersBlock = (sources.mdata.match(
    /export function listCustomers[\s\S]*?(?=export function (?:listPaymentTermOptions|listVendors|getVendor|getCustomer))/
  ) || [])[0] || "";
  const listVendorsBlock = (sources.mdata.match(
    /export function listVendors[\s\S]*?(?=export function getVendor|export type CreateVendorInput|$)/
  ) || [])[0] || "";
  if (!/normalizeMdataListRows(?:<Customer>)?/.test(listCustomersBlock) || !/listEnvelopeTotal/.test(listCustomersBlock)) {
    errors.push(`${MDATA_API}: listCustomers must normalize customers via normalizeMdataListRows + listEnvelopeTotal`);
  }
  if (!/normalizeMdataListRows(?:<VendorOption>)?/.test(listVendorsBlock) || !/listEnvelopeTotal/.test(listVendorsBlock)) {
    errors.push(`${MDATA_API}: listVendors must normalize vendors via normalizeMdataListRows + listEnvelopeTotal`);
  }
  if (/total:\s*payload\.total\s*\?\?\s*payload\.customers\.length/.test(listCustomersBlock)) {
    errors.push(`${MDATA_API}: listCustomers must not trust raw payload.customers.length without Array.isArray normalize`);
  }
  if (/total:\s*payload\.total\s*\?\?\s*payload\.vendors\.length/.test(listVendorsBlock)) {
    errors.push(`${MDATA_API}: listVendors must not trust raw payload.vendors.length without Array.isArray normalize`);
  }

  // LV-CUSTOMERS-FULL-EDIT-PAYMENT-TERMS-CACHE-SHAPE — normalize payment_terms + shared react-query envelope.
  const listPaymentTermsBlock = (sources.mdata.match(
    /export function listPaymentTermOptions[\s\S]*?(?=export function createPaymentTermOption|export function listVendors|$)/
  ) || [])[0] || "";
  if (!/normalizeMdataListRows(?:<PaymentTermOption>)?/.test(listPaymentTermsBlock)) {
    errors.push(`${MDATA_API}: listPaymentTermOptions must normalize payment_terms via normalizeMdataListRows`);
  }
  if (sources.customerEditModal) {
    if (/listPaymentTermOptions\([^)]*\)\.then\(\s*\(?\s*r\s*\)?\s*=>\s*r\.payment_terms\s*\)/.test(sources.customerEditModal)) {
      errors.push(
        `${CUSTOMER_EDIT_MODAL}: must not unwrap payment_terms in queryFn under shared ["payment-term-options"] key (cache shape collision with CustomerDetail)`
      );
    }
    if (!/paymentTermsQuery\.data\?\.payment_terms/.test(sources.customerEditModal)) {
      errors.push(`${CUSTOMER_EDIT_MODAL}: must read payment_terms from listPaymentTermOptions envelope (same as CustomerDetail)`);
    }
    if (!/Array\.isArray\(\s*(?:raw|paymentTermsQuery\.data\?\.payment_terms)/.test(sources.customerEditModal)) {
      errors.push(`${CUSTOMER_EDIT_MODAL}: must Array.isArray-guard payment_terms before mapping`);
    }
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
  if (!/const\s+customersServerTotal\s*=[\s\S]{0,450}(?:customersQuery|inactiveCustomersQuery)\.data\?\.total/.test(sources.customersPage)) {
    errors.push(`${CUSTOMERS_PAGE}: must read customersServerTotal from listCustomers().total`);
  }
  if (!/totalCount=\{\s*vendorsServerTotal\s*\}/.test(sources.vendorsPage)) {
    errors.push(`${VENDORS_PAGE}: totalCount must bind vendorsServerTotal (server COUNT)`);
  }
  if (!/const\s+vendorsServerTotal\s*=[\s\S]{0,450}(?:vendorsQuery|inactiveVendorsQuery)\.data\?\.total/.test(sources.vendorsPage)) {
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
    export function normalizeMdataListRows(raw) {
      if (Array.isArray(raw)) return raw;
      return [];
    }
    function listEnvelopeTotal(payload, rows) {
      if (payload && typeof payload === "object" && typeof payload.total === "number") return payload.total;
      return rows.length;
    }
    export function listCustomers(params = {}) {
      return apiRequest(\`/api/v1/mdata/customers\`).then((payload) => {
        const customers = normalizeMdataListRows(payload?.customers ?? payload);
        return { customers, total: listEnvelopeTotal(payload, customers) };
      });
    }
    export function listPaymentTermOptions(operatingCompanyId) {
      return apiRequest(\`/api/v1/catalogs/payment-terms\`).then((payload) => {
        const payment_terms = normalizeMdataListRows(payload?.payment_terms ?? payload);
        return { payment_terms };
      });
    }
    export function listVendors(params = {}) {
      return apiRequest(\`/api/v1/mdata/vendors\`).then((payload) => {
        const vendors = normalizeMdataListRows(payload?.vendors ?? payload);
        return { vendors, total: listEnvelopeTotal(payload, vendors) };
      });
    }
  `;
  const goodCustomerEditModal = `
    queryFn: () => listPaymentTermOptions(companyId),
    const raw = paymentTermsQuery.data?.payment_terms;
    return Array.isArray(raw) ? raw : [];
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
    customerEditModal: goodCustomerEditModal,
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
      name: "listCustomers drops normalize -> FAIL",
      in: {
        ...base,
        mdata: goodMdata.replace(
          /export function listCustomers[\s\S]*?(?=export function listPaymentTermOptions)/,
          `export function listCustomers(params = {}) {
      return apiRequest(\`/api/v1/mdata/customers\`).then((payload) => ({
        customers: payload.customers,
        total: listEnvelopeTotal(payload, payload.customers || []),
      }));
    }
    `
        ),
      },
      wantMin: 1,
    },
    {
      name: "listCustomers regresses to raw .length -> FAIL",
      in: {
        ...base,
        mdata: `
    export function normalizeMdataListRows(raw) {
      if (Array.isArray(raw)) return raw;
      return [];
    }
    function listEnvelopeTotal(payload, rows) { return rows.length; }
    export function listCustomers(params = {}) {
      return apiRequest(\`/api/v1/mdata/customers\`).then(
        (payload) => ({ customers: payload.customers, total: payload.total ?? payload.customers.length })
      );
    }
    export function listPaymentTermOptions(operatingCompanyId) {
      return apiRequest(\`/api/v1/catalogs/payment-terms\`).then((payload) => {
        const payment_terms = normalizeMdataListRows(payload?.payment_terms ?? payload);
        return { payment_terms };
      });
    }
    export function listVendors(params = {}) {
      return apiRequest(\`/api/v1/mdata/vendors\`).then((payload) => {
        const vendors = normalizeMdataListRows(payload?.vendors ?? payload);
        return { vendors, total: listEnvelopeTotal(payload, vendors) };
      });
    }
        `,
      },
      wantMin: 1,
    },
    {
      name: "Full Edit unwraps payment_terms under shared key -> FAIL",
      in: {
        ...base,
        customerEditModal: `
    queryFn: () => listPaymentTermOptions(companyId).then((r) => r.payment_terms),
    const paymentTermOptions = paymentTermsQuery.data ?? [];
        `,
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
  customerEditModal: readReal(CUSTOMER_EDIT_MODAL),
});

if (errors.length) {
  console.error(`${LABEL} FAIL — customers/vendors pager totalCount must be server COUNT:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customers/vendors totalCount is server COUNT; Full Edit payment_terms cache shape locked.`);
