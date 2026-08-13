#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leafRe":"^md\\.(transaction_list|customer_details|new_transaction)$","task":"MASTER-DETAIL-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^(md\\.(transaction_list|vendor_details)|md\\.header\\.(edit|new_transaction))$","task":"MASTER-DETAIL-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leafRe":"^(customers|vendors)$","task":"MASTER-DETAIL-REVERSE-LEAVES","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-master-detail-reverse-leaves";
const source = {
  customers: fs.readFileSync("apps/frontend/src/pages/Customers.tsx", "utf8"),
  vendors: fs.readFileSync("apps/frontend/src/pages/Vendors.tsx", "utf8"),
  routes: fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8"),
};

function audit(s) {
  const failures = [];
  if (!/listInvoices\(companyId, \{[\s\S]{0,100}customer_id: selectedCustomer!\.id/.test(s.customers)) failures.push("customer transaction scope missing");
  if (!/<EntityLink kind="invoice" id=\{r\.id\}/.test(s.customers) || !/<EntityLink kind="load" id=\{r\.source_load_id\}/.test(s.customers)) failures.push("customer transaction drills missing");
  if (!/navigate\(`\/accounting\/invoices\?customer_id=\$\{selectedCustomer\.id\}`\)/.test(s.customers) || !/navigate\(`\/customers\/\$\{selectedCustomer\.id\}`\)/.test(s.customers)) failures.push("customer header routes missing");
  if (!/Couldn't load customer transactions/.test(s.customers) || !/No transactions for current filters\./.test(s.customers)) failures.push("customer transaction honest states missing");
  if (!/listBills\(companyId, \{[\s\S]{0,100}vendor_id: selectedVendor!\.id/.test(s.vendors)) failures.push("vendor transaction scope missing");
  if (!/navigate\(`\/accounting\/bills\?vendor_id=\$\{selectedVendor\.id\}`\)/.test(s.vendors) || !/navigate\(`\/vendors\/\$\{selectedVendor\.id\}`\)/.test(s.vendors)) failures.push("vendor header routes missing");
  if (!/Couldn't load vendor transactions/.test(s.vendors) || !/No transactions for current filters\./.test(s.vendors)) failures.push("vendor transaction honest states missing");
  for (const [path, target] of [["/accounting/customers", "/customers"], ["/accounting/vendors", "/vendors"]]) {
    if (!new RegExp(`path="${path}"[\\s\\S]{0,180}<Navigate to="${target}" replace`).test(s.routes)) failures.push(`${path} canonical redirect missing`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["customer-scope", "customers", /customer_id: selectedCustomer!\.id/g, "customer_id: ''"],
    ["customer-invoice", "customers", /kind="invoice"/g, 'kind="customer"'],
    ["customer-load", "customers", /kind="load"/g, 'kind="customer"'],
    ["customer-new", "customers", /\/accounting\/invoices\?customer_id=/g, "/accounting/invoices?wrong="],
    ["customer-error", "customers", /Couldn't load customer transactions/g, "Loading"],
    ["vendor-scope", "vendors", /vendor_id: selectedVendor!\.id/g, "vendor_id: ''"],
    ["vendor-new", "vendors", /\/accounting\/bills\?vendor_id=/g, "/accounting/bills?wrong="],
    ["vendor-edit", "vendors", /\/vendors\/\$\{selectedVendor\.id\}/g, "/vendors"],
    ["vendor-error", "vendors", /Couldn't load vendor transactions/g, "Loading"],
    ["alias", "routes", /<Navigate to="\/customers" replace/g, '<Navigate to="/wrong" replace'],
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
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — customer/vendor master-detail reverse leaves are scoped, routed, and honest`);
