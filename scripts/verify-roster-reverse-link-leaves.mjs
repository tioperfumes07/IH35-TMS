#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leafRe":"^(customers|vendors)$","task":"ROSTER-REVERSE-LINK-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leafRe":"^(home\\.roster|list\\.view_(list|master_detail)|list\\.segment\\.(preferred|watch|factored))$","task":"ROSTER-REVERSE-LINK-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^(home\\.roster|list\\.view_(list|master_detail))$","task":"ROSTER-REVERSE-LINK-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["lists"],"cols":["reverse_link"],"leafRe":"^hub\\.names_search$","task":"ROSTER-REVERSE-LINK-LEAVES","vertical":"column-wave"} */
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
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  for (const [path, target] of [["/accounting/customers", "/customers"], ["/accounting/vendors", "/vendors"]]) {
    const route = new RegExp(`path="${path}"[\\s\\S]{0,180}<Navigate to="${target}" replace`);
    if (!route.test(s.routes)) failures.push(`${path} canonical roster redirect missing`);
  }
  if (!/listCustomers\(\{ operating_company_id: companyId, limit: 5000, active_company_only: true \}\)/.test(s.customers)) failures.push("customer roster company scope missing");
  if (!/listVendors\(\{ operating_company_id: companyId, limit: 5000, active_company_only: true \}\)/.test(s.vendors)) failures.push("vendor roster company scope missing");
  if (!/onRowClick=\{\(row\) => onSelectCustomer\?\.\(row\.id\)\}/.test(s.customerList)) failures.push("customer list row drill missing");
  if (!/onRowClick=\{\(row\) => onSelectVendor\?\.\(row\.id\)\}/.test(s.vendorList)) failures.push("vendor list row drill missing");
  if (!/<CardLink href=\{`\/customers\/\$\{customer\.id\}`\}/.test(s.customerSidebar)) failures.push("customer profile anchor missing");
  if (!/<CardLink href=\{`\/vendors\/\$\{vendor\.id\}`\}/.test(s.vendorSidebar)) failures.push("vendor profile anchor missing");
  if (!/qualitySegment[\s\S]{0,240}"preferred"[\s\S]{0,120}"watch"[\s\S]{0,120}"factored"/.test(s.customers)) failures.push("customer segment routing missing");
  if (!/customersQuery\.isError/.test(s.customers) || !/No customers found\./.test(s.customerSidebar) || !/No customers match this filter\./.test(s.customerList)) failures.push("customer honest states missing");
  if (!/vendorsQuery\.isError/.test(s.vendors) || !/No vendors found\./.test(s.vendorSidebar) || !/No vendors found\./.test(s.vendorList)) failures.push("vendor honest states missing");
  if (!/searchNamesMaster\(\{[\s\S]{0,100}operatingCompanyId: companyId/.test(s.names)) failures.push("names roster company scope missing");
  if (!/<EntityLink[\s\S]{0,160}kind=\{kind\}[\s\S]{0,120}id=\{row\.entity_id\}[\s\S]{0,120}label=\{row\.display_name\}/.test(s.names) || !/navigate\(row\.link_to_module_page\)/.test(s.names)) failures.push("names canonical entity drills missing");
  if (!/searchQuery\.isError/.test(s.names) || !/emptyText="No results\. Try a search term\."/.test(s.names)) failures.push("names honest states missing");
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
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accounting/customer/vendor roster reverse leaves are scoped, canonical, and honest`);
