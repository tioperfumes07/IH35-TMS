#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leafRe":"^(payments\.receive|accounting\.parity\.vendor_credits_page|accounting\.panel\.(trk_bulk_register|detail))$","task":"VERTICAL-REVERSE-LINK-ACCOUNTING-EXISTING-QUERIES"} */
import fs from "node:fs";

const customer = fs.readFileSync("apps/frontend/src/pages/CustomerDetail.tsx", "utf8");
const vendor = fs.readFileSync("apps/frontend/src/pages/VendorDetail.tsx", "utf8");
const unit = fs.readFileSync("apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx", "utf8");
const entityLink = fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8");

function failures(customerSource = customer, vendorSource = vendor, unitSource = unit, entityLinkSource = entityLink) {
  return [
    ["customer payment detail drill", customerSource.includes('kind="payment" id={p.id}')],
    ["vendor credit exact drill", vendorSource.includes('kind="vendor_credit"') && vendorSource.includes("id={c.id}") && /case "vendor_credit":[\s\S]{0,120}vendor-credits\?credit_id=/.test(entityLinkSource)],
    ["fixed asset exact drill", unitSource.includes('kind="fixed_asset"') && unitSource.includes("id={row.id}") && /case "fixed_asset":[\s\S]{0,120}fixed-assets\?asset_id=/.test(entityLinkSource)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    failures(customer.replace('kind="payment" id={p.id}', 'kind="customer" id={p.id}'), vendor, unit).includes("customer payment detail drill"),
    failures(customer, vendor.replace('kind="vendor_credit"', 'kind="vendor"'), unit).includes("vendor credit exact drill"),
    failures(customer, vendor, unit.replace('kind="fixed_asset"', 'kind="unit"')).includes("fixed asset exact drill"),
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
