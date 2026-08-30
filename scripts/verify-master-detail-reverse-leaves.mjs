#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leaves":["md.transaction_list","md.customer_details","md.new_transaction"],"task":"CUST-F5871-MASTER-DETAIL-REVERSE-EXACT-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^(md\\.(transaction_list|vendor_details)|md\\.header\\.(edit|new_transaction))$","task":"MASTER-DETAIL-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leafRe":"^(customers|vendors)$","task":"MASTER-DETAIL-REVERSE-LEAVES","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-master-detail-reverse-leaves";
const CUSTOMER_LEAVES = ["md.transaction_list", "md.customer_details", "md.new_transaction"];
const CUSTOMER_HEADER = '/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leaves":["md.transaction_list","md.customer_details","md.new_transaction"],"task":"CUST-F5871-MASTER-DETAIL-REVERSE-EXACT-LEAVES","vertical":"column-wave"} */';
const source = {
  customers: fs.readFileSync("apps/frontend/src/pages/Customers.tsx", "utf8"),
  vendors: fs.readFileSync("apps/frontend/src/pages/Vendors.tsx", "utf8"),
  routes: fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8"),
  customerMatrix: fs.readFileSync("docs/specs/scoreboard/modules/customers.required.json", "utf8"),
  self: fs.readFileSync("scripts/verify-master-detail-reverse-leaves.mjs", "utf8"),
};

function audit(s) {
  const failures = [];
  if (!/listAllInvoices\(companyId, \{[\s\S]{0,100}customer_id: selectedCustomer!\.id/.test(s.customers)) failures.push("customer transaction scope missing");
  // Either bare EntityLink or the canonical EntityLinkOrTombstone (honest unresolved-record fallback,
  // ACCT-F5511 precedent) satisfy the drill; tolerate kind=/id= landing on separate JSX lines.
  if (
    !/<EntityLink(?:OrTombstone)?\s+kind="invoice"\s+id=\{r\.id\}/.test(s.customers) ||
    !/<EntityLink(?:OrTombstone)?[\s\S]{0,20}kind="load"[\s\S]{0,20}id=\{r\.source_load_id\}/.test(s.customers)
  ) {
    failures.push("customer transaction drills missing");
  }
  if (!/navigate\(`\/accounting\/invoices\?customer_id=\$\{selectedCustomer\.id\}`\)/.test(s.customers) || !/navigate\(`\/customers\/\$\{selectedCustomer\.id\}`\)/.test(s.customers)) failures.push("customer header routes missing");
  if (!/Couldn't load customer transactions/.test(s.customers) || !/No transactions for current filters\./.test(s.customers)) failures.push("customer transaction honest states missing");
  if (!/listBills\(companyId, \{[\s\S]{0,100}vendor_id: selectedVendor!\.id/.test(s.vendors)) failures.push("vendor transaction scope missing");
  if (!/navigate\(`\/accounting\/bills\?vendor_id=\$\{selectedVendor\.id\}`\)/.test(s.vendors) || !/navigate\(`\/vendors\/\$\{selectedVendor\.id\}`\)/.test(s.vendors)) failures.push("vendor header routes missing");
  if (!/Couldn't load vendor transactions/.test(s.vendors) || !/No transactions for current filters\./.test(s.vendors)) failures.push("vendor transaction honest states missing");
  for (const [path, target] of [["/accounting/customers", "/customers"], ["/accounting/vendors", "/vendors"]]) {
    if (!new RegExp(`path="${path}"[\\s\\S]{0,180}<Navigate to="${target}" replace`).test(s.routes)) failures.push(`${path} canonical redirect missing`);
  }
  try {
    const matrix = JSON.parse(s.customerMatrix);
    for (const id of CUSTOMER_LEAVES) {
      if (!matrix.leaves?.find((leaf) => leaf.id === id)?.required?.includes("reverse_link")) {
        failures.push(`customers:${id} must require reverse_link`);
      }
    }
  } catch {
    failures.push("customers Required matrix must parse");
  }
  if (!s.self.split("\n").includes(CUSTOMER_HEADER)) failures.push("exact customer Built header missing");
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
  let caught = mutations.length;
  for (const id of CUSTOMER_LEAVES) {
    const candidate = { ...source, customerMatrix: source.customerMatrix.replace(`"id": "${id}"`, `"id": "${id}.removed"`) };
    if (!audit(candidate).some((failure) => failure.includes(`customers:${id}`))) {
      console.error(`${LABEL} SELFTEST FAIL — Required mutation escaped: ${id}`);
      process.exit(1);
    }
    caught += 1;
  }
  const headerCandidate = { ...source, self: source.self.replace(CUSTOMER_HEADER, `${CUSTOMER_HEADER}.removed`) };
  if (!audit(headerCandidate).some((failure) => failure.includes("exact customer Built header missing"))) {
    console.error(`${LABEL} SELFTEST FAIL — customer header mutation escaped`);
    process.exit(1);
  }
  caught += 1;
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${mutations.length + CUSTOMER_LEAVES.length + 1} mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — customer/vendor master-detail reverse leaves are scoped, routed, and honest`);
