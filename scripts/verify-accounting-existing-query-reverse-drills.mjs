#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leafRe":"^(payments\.receive|accounting\.parity\.vendor_credits_page|accounting\.panel\.(trk_bulk_register|detail))$","task":"VERTICAL-REVERSE-LINK-ACCOUNTING-EXISTING-QUERIES"} */
import fs from "node:fs";

const customer = fs.readFileSync("apps/frontend/src/pages/CustomerDetail.tsx", "utf8");
const vendor = fs.readFileSync("apps/frontend/src/pages/VendorDetail.tsx", "utf8");
const unit = fs.readFileSync("apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx", "utf8");

function failures(customerSource = customer, vendorSource = vendor, unitSource = unit) {
  return [
    ["customer payment detail drill", customerSource.includes('kind="payment" id={p.id}')],
    ["vendor credit exact drill", vendorSource.includes('/accounting/vendor-credits?credit_id=${encodeURIComponent(c.id)}')],
    ["fixed asset exact drill", unitSource.includes('/accounting/fixed-assets?asset_id=${encodeURIComponent(row.id)}')],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    failures(customer.replace('kind="payment" id={p.id}', 'kind="customer" id={p.id}'), vendor, unit).includes("customer payment detail drill"),
    failures(customer, vendor.replace("credit_id=${encodeURIComponent(c.id)}", "vendor_id=${encodeURIComponent(id)}"), unit).includes("vendor credit exact drill"),
    failures(customer, vendor, unit.replace("asset_id=${encodeURIComponent(row.id)}", "unit_id=${encodeURIComponent(unitId)}")).includes("fixed asset exact drill"),
  ];
  if (mutations.some((ok) => !ok)) process.exit(1);
  console.log("verify-accounting-existing-query-reverse-drills selftest PASS — 3/3 target mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-accounting-existing-query-reverse-drills FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-accounting-existing-query-reverse-drills PASS — payment/credit/fixed-asset reverse rows target exact records");
