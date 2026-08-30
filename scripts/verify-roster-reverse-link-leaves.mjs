#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leaves":["customers","vendors"],"task":"CLASS-F5870-ROSTER-REVERSE-EXACT-APPLICABLE-LEAVES","vertical":"class-sweep"} */
/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leaves":["home.roster","list.view_list","list.view_master_detail","list.segment.preferred","list.segment.watch","list.segment.factored"],"task":"CLASS-F5870-ROSTER-REVERSE-EXACT-APPLICABLE-LEAVES","vertical":"class-sweep"} */
import fs from "node:fs";

const LABEL = "verify-roster-reverse-link-leaves";
const files = {
  routes: "apps/frontend/src/routes/manifest.tsx",
  customers: "apps/frontend/src/pages/Customers.tsx",
  customerList: "apps/frontend/src/pages/customers/CustomersListView.tsx",
  customerSidebar: "apps/frontend/src/pages/customers/CustomerListSidebar.tsx",
  vendors: "apps/frontend/src/pages/Vendors.tsx",
  vendorList: "apps/frontend/src/pages/vendors/VendorsListView.tsx",
  vendorSidebar: "apps/frontend/src/pages/vendors/VendorListSidebar.tsx",
  names: "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx",
  accountingMatrix: "docs/specs/scoreboard/modules/accounting.required.json",
  customersMatrix: "docs/specs/scoreboard/modules/customers.required.json",
  self: "scripts/verify-roster-reverse-link-leaves.mjs",
};
const REQUIRED = {
  accountingMatrix: ["customers", "vendors"],
  customersMatrix: ["home.roster", "list.view_list", "list.view_master_detail", "list.segment.preferred", "list.segment.watch", "list.segment.factored"],
};
const HEADERS = [
  '/** @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leaves":["customers","vendors"],"task":"CLASS-F5870-ROSTER-REVERSE-EXACT-APPLICABLE-LEAVES","vertical":"class-sweep"} */',
  '/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leaves":["home.roster","list.view_list","list.view_master_detail","list.segment.preferred","list.segment.watch","list.segment.factored"],"task":"CLASS-F5870-ROSTER-REVERSE-EXACT-APPLICABLE-LEAVES","vertical":"class-sweep"} */',
];
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  for (const [path, target] of [["/accounting/customers", "/customers"], ["/accounting/vendors", "/vendors"]]) {
    const route = new RegExp(`path="${path}"[\\s\\S]{0,180}<Navigate to="${target}" replace`);
    if (!route.test(s.routes)) failures.push(`${path} canonical roster redirect missing`);
  }
  if (!/listAllCustomers\(\{ operating_company_id: companyId, active_company_only: true \}\)/.test(s.customers)) failures.push("customer roster complete company scope missing");
  if (!/listAllVendors\(\{ operating_company_id: companyId, active_company_only: true \}\)/.test(s.vendors)) failures.push("vendor roster company scope missing");
  if (!/onRowClick=\{\(row\) => onSelectCustomer\?\.\(row\.id\)\}/.test(s.customerList)) failures.push("customer list row drill missing");
  if (!/onRowClick=\{\(row\) => onSelectVendor\?\.\(row\.id\)\}/.test(s.vendorList)) failures.push("vendor list row drill missing");
  if (!/<CardLink href=\{`\/customers\/\$\{customer\.id\}`\}/.test(s.customerSidebar)) failures.push("customer profile anchor missing");
  if (!/<CardLink href=\{`\/vendors\/\$\{vendor\.id\}`\}/.test(s.vendorSidebar)) failures.push("vendor profile anchor missing");
  if (!/qualitySegment[\s\S]{0,240}"preferred"[\s\S]{0,120}"watch"[\s\S]{0,120}"factored"/.test(s.customers)) failures.push("customer segment routing missing");
  if (!/customersQuery\.isError/.test(s.customers) || !/No customers found\./.test(s.customerSidebar) || !/No customers match this filter\./.test(s.customerList)) failures.push("customer honest states missing");
  if (!/atRiskQuery\.isError[\s\S]{0,220}<ListErrorState[\s\S]{0,220}onRetry=\{\(\) => void atRiskQuery\.refetch\(\)\}/.test(s.customerList)) failures.push("customer relationship reverse-read failure must be visible and retryable");
  if (!/vendorsQuery\.isError/.test(s.vendors) || !/No vendors found\./.test(s.vendorSidebar) || !/No vendors found\./.test(s.vendorList)) failures.push("vendor honest states missing");
  if (!/searchNamesMaster\(\{[\s\S]{0,100}operatingCompanyId: companyId/.test(s.names)) failures.push("names roster company scope missing");
  // label={label} (a local var computed via entityLabel(row.display_name, row.entity_id, noun) a few
  // lines above the tag) is the same honest-fallback-via-local-variable class fixed repeatedly this
  // session (e.g. ACCT-F5460/F5465) — equally valid to the literal label={row.display_name} shape.
  if (
    !/<EntityLink[\s\S]{0,160}kind=\{kind\}[\s\S]{0,120}id=\{row\.entity_id\}[\s\S]{0,120}label=\{(?:row\.display_name|label)\}/.test(
      s.names,
    ) ||
    !/navigate\(row\.link_to_module_page\)/.test(s.names)
  ) {
    failures.push("names canonical entity drills missing");
  }
  if (!/searchQuery\.isError/.test(s.names) || !/emptyText="No results\. Try a search term\."/.test(s.names)) failures.push("names honest states missing");
  for (const [key, ids] of Object.entries(REQUIRED)) {
    try {
      const matrix = JSON.parse(s[key]);
      for (const id of ids) if (!matrix.leaves?.find((leaf) => leaf.id === id)?.required?.includes("reverse_link")) failures.push(`${key}:${id} must require reverse_link`);
    } catch { failures.push(`${key} must parse`); }
  }
  for (const header of HEADERS) if (!s.self.split("\n").includes(header)) failures.push(`exact Built header missing: ${header}`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["customer-alias", "routes", /<Navigate to="\/customers" replace/g, '<Navigate to="/wrong" replace'],
    ["vendor-alias", "routes", /<Navigate to="\/vendors" replace/g, '<Navigate to="/wrong" replace'],
    ["customer-scope", "customers", /operating_company_id: companyId/g, "operating_company_id: ''"],
    ["vendor-scope", "vendors", /operating_company_id: companyId/g, "operating_company_id: ''"],
    ["customer-row", "customerList", /onSelectCustomer\?\.\(row\.id\)/g, "undefined"],
    ["vendor-row", "vendorList", /onSelectVendor\?\.\(row\.id\)/g, "undefined"],
    ["customer-anchor", "customerSidebar", /\/customers\/\$\{customer\.id\}/g, "/customers"],
    ["vendor-anchor", "vendorSidebar", /\/vendors\/\$\{vendor\.id\}/g, "/vendors"],
    ["customer-empty", "customerSidebar", /No customers found\./g, "Loading"],
    ["customer-health-error", "customerList", /onRetry=\{\(\) => void atRiskQuery\.refetch\(\)\}/g, "onRetry={undefined}"],
    ["vendor-empty", "vendorSidebar", /No vendors found\./g, "Loading"],
    ["names-scope", "names", /operatingCompanyId: companyId/g, "operatingCompanyId: ''"],
    ["names-drill", "names", /id=\{row\.entity_id\}/g, "id={undefined}"],
    ["names-empty", "names", /No results\. Try a search term\./g, "Loading"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const candidate = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (candidate[key] === source[key] || audit(candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  let caught = mutations.length;
  for (const [key, ids] of Object.entries(REQUIRED)) for (const id of ids) {
    const candidate = { ...source, [key]: source[key].replace(`"id": "${id}"`, `"id": "${id}.removed"`) };
    if (!audit(candidate).some((failure) => failure.includes(`${key}:${id}`))) throw new Error(`Required mutation escaped: ${key}:${id}`);
    caught += 1;
  }
  for (const header of HEADERS) {
    const candidate = { ...source, self: source.self.replace(header, `${header}.removed`) };
    if (!audit(candidate).some((failure) => failure.includes("exact Built header missing"))) throw new Error("header mutation escaped");
    caught += 1;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${mutations.length + 10} runtime/matrix/header mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accounting/customer/vendor roster reverse leaves are scoped, canonical, and honest`);
