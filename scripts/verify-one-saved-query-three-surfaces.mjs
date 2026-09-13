#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","vendors"],"cols":["one-saved-query"],"leafRe":"^accounting\\.expenses\\.duplicates$","task":"D2-ONE-SAVED-QUERY-THREE-SURFACES"} */
/**
 * D2 (owner law, 2026-09-13, verbatim: "ONE saved query, published three ways") — the SAME
 * duplicate-expense definition (listExpenseDuplicateGroups, ACCT-R-17: same vendor + date + amount
 * fingerprint) must power all three surfaces with no second query, no re-derived fingerprint:
 *
 *   1. Full list  — ExpensesListPage.tsx's inline "Possible duplicate expenses" panel.
 *   2. Sublist    — VendorDetail.tsx's VendorDuplicateExpensesSection, scoped to ONE vendor via
 *                   the backend's own additive, optional vendor_id filter (never a parallel query).
 *   3. Dashboard  — OwnerHome.tsx's "Duplicate expenses" saved-query chip.
 *
 * --selftest plants each regression and requires the guard to fail.
 */
import fs from "node:fs";

const SERVICE = "apps/backend/src/accounting/expense-duplicate.service.ts";
const ROUTES = "apps/backend/src/accounting/expenses.routes.ts";
const API = "apps/frontend/src/api/accounting.ts";
const EXPENSES_LIST = "apps/frontend/src/pages/accounting/ExpensesListPage.tsx";
const VENDOR_SECTION = "apps/frontend/src/pages/vendors/VendorDuplicateExpensesSection.tsx";
const VENDOR_DETAIL = "apps/frontend/src/pages/VendorDetail.tsx";
const OWNER_HOME = "apps/frontend/src/pages/home/OwnerHome.tsx";

function analyze(src) {
  const { service, routes, api, expensesList, vendorSection, vendorDetail, ownerHome } = src;
  const errors = [];

  // The ONE definition: one function, one query shape, an optional additive vendor filter (never a
  // second WHERE-vendor_uuid query built independently).
  if (!/export async function listExpenseDuplicateGroups\(/.test(service)) errors.push("expense-duplicate.service.ts must export listExpenseDuplicateGroups");
  if (!/vendorId\?\s*:\s*string/.test(service)) errors.push("listExpenseDuplicateGroups must accept an optional vendorId");
  if (!/vendorFilter\s*=\s*vendorId \? "AND e\.vendor_uuid = \$2::uuid" : ""/.test(service)) errors.push("listExpenseDuplicateGroups' vendor scope must be additive (empty string when omitted), not a second query");
  if (!/GROUP BY e\.vendor_uuid, e\.transaction_date, e\.total_amount_cents\s*\n\s*HAVING COUNT\(\*\) > 1/.test(service)) errors.push("the group-count query's fingerprint (vendor + date + amount) must stay a single definition");

  if (!/vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) errors.push("GET /api/v1/expenses/duplicates must accept an optional vendor_id query param");
  if (!/listExpenseDuplicateGroups\(client, parsed\.data\.operating_company_id, parsed\.data\.limit, parsed\.data\.vendor_id\)/.test(routes)) errors.push("the route must pass vendor_id straight through to the one service function");

  if (!/export function listExpenseDuplicates\(operatingCompanyId: string, limit = 50, vendorId\?: string\)/.test(api)) errors.push("api/accounting.ts's listExpenseDuplicates must accept an optional vendorId");

  // Surface 1 — full list.
  if (!/listExpenseDuplicates\(companyId, 25\)/.test(expensesList)) errors.push("ExpensesListPage.tsx must call listExpenseDuplicates for its full-list panel");

  // Surface 2 — vendor-scoped sublist, wired into VendorDetail.tsx.
  if (!/listExpenseDuplicates\(operatingCompanyId, 25, vendorId\)/.test(vendorSection)) errors.push("VendorDuplicateExpensesSection.tsx must call listExpenseDuplicates with a vendor scope");
  if (!/<VendorDuplicateExpensesSection operatingCompanyId=\{companyId\} vendorId=\{vendor\.id\} \/>/.test(vendorDetail)) errors.push("VendorDetail.tsx must render VendorDuplicateExpensesSection");

  // Surface 3 — dashboard chip.
  if (!/value=\{expenseDuplicatesQuery\.data\?\.group_count\}/.test(ownerHome)) errors.push("OwnerHome.tsx's Duplicate expenses chip must read listExpenseDuplicates' own group_count");
  if (!/listExpenseDuplicates\(selectedCompanyId!, 1\)/.test(ownerHome)) errors.push("OwnerHome.tsx must call the same listExpenseDuplicates function for its chip");

  return errors;
}

const base = {
  service: fs.readFileSync(SERVICE, "utf8"),
  routes: fs.readFileSync(ROUTES, "utf8"),
  api: fs.readFileSync(API, "utf8"),
  expensesList: fs.readFileSync(EXPENSES_LIST, "utf8"),
  vendorSection: fs.readFileSync(VENDOR_SECTION, "utf8"),
  vendorDetail: fs.readFileSync(VENDOR_DETAIL, "utf8"),
  ownerHome: fs.readFileSync(OWNER_HOME, "utf8"),
};

function withField(field, transform) {
  return { ...base, [field]: transform(base[field]) };
}

if (process.argv.includes("--selftest")) {
  const clean = analyze(base);
  if (clean.length) {
    console.error(`SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["service drops the export", withField("service", (s) => s.replace("export async function listExpenseDuplicateGroups(", "async function goneListExpenseDuplicateGroups("))],
    ["service drops the optional vendorId param", withField("service", (s) => s.replace("vendorId?: string,", ""))],
    ["service's vendor filter stops being additive", withField("service", (s) => s.replace('const vendorFilter = vendorId ? "AND e.vendor_uuid = $2::uuid" : "";', 'const vendorFilter = "AND e.vendor_uuid = $2::uuid";'))],
    ["route drops the vendor_id param", withField("routes", (s) => s.replace("vendor_id: z.string().uuid().optional()", ""))],
    ["route stops passing vendor_id through", withField("routes", (s) => s.replace("listExpenseDuplicateGroups(client, parsed.data.operating_company_id, parsed.data.limit, parsed.data.vendor_id)", "listExpenseDuplicateGroups(client, parsed.data.operating_company_id, parsed.data.limit)"))],
    ["frontend api wrapper drops vendorId", withField("api", (s) => s.replace("export function listExpenseDuplicates(operatingCompanyId: string, limit = 50, vendorId?: string) {", "export function listExpenseDuplicates(operatingCompanyId: string, limit = 50) {"))],
    ["ExpensesListPage stops calling the shared function", withField("expensesList", (s) => s.replace("listExpenseDuplicates(companyId, 25)", "listGoneDuplicates(companyId, 25)"))],
    ["VendorDuplicateExpensesSection stops scoping to the vendor", withField("vendorSection", (s) => s.replace("listExpenseDuplicates(operatingCompanyId, 25, vendorId)", "listExpenseDuplicates(operatingCompanyId, 25)"))],
    ["VendorDetail stops rendering the section", withField("vendorDetail", (s) => s.replace("<VendorDuplicateExpensesSection operatingCompanyId={companyId} vendorId={vendor.id} />", ""))],
    ["OwnerHome chip stops reading group_count", withField("ownerHome", (s) => s.replace("value={expenseDuplicatesQuery.data?.group_count}", "value={5}"))],
    ["OwnerHome stops calling the shared function", withField("ownerHome", (s) => s.replace("listExpenseDuplicates(selectedCompanyId!, 1)", "listGoneExpenseDuplicates(selectedCompanyId!, 1)"))],
  ];
  let caught = 0;
  for (const [label, mutated] of mutations) {
    if (analyze(mutated).length > 0) { caught += 1; continue; }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`PASS verify-one-saved-query-three-surfaces --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = analyze(base);
if (failures.length) {
  console.error("FAIL verify-one-saved-query-three-surfaces");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-one-saved-query-three-surfaces — one listExpenseDuplicateGroups definition, published as full list + vendor sublist + dashboard chip");
