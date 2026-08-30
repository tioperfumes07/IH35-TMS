#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","inventory","vendors"],"cols":["vendor","connectivity","reverse_link","picker_law"],"leafRe":"^parts_inventory\\.record_purchase$|^detail\\.profile$","task":"THEATER-PARTS-INVENTORY-VENDOR-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-parts-inventory-vendor-reverse";
const paths = {
  table: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx",
  routes: "apps/backend/src/maintenance/parts-inventory.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  reverse: "apps/frontend/src/pages/vendors/VendorPartsInventoryReverseSection.tsx",
  vendor: "apps/frontend/src/pages/VendorDetail.tsx",
  home: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
};
const sources = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

const checks = [
  ["table", /mutationFn: \(input: \{ companyId: string; generation: number; draft: PurchaseForm \}\) =>[\s\S]{0,80}recordPartsPurchase\(input\.companyId, \{[\s\S]{0,180}part_description: input\.draft\.part_description[\s\S]{0,180}vendor_id: input\.draft\.vendor_id \|\| undefined/, "purchase submit binds the immutable selected-company snapshot and vendor FK"],
  ["table", /<EntityPicker[\s\S]{0,120}kind="vendor"[\s\S]{0,120}operatingCompanyId=\{companyId\}[\s\S]{0,120}value=\{form\.vendor_id \|\| null\}[\s\S]{0,160}onChange=\{\(next\) => setForm\(\(v\) => \(\{ \.\.\.v, vendor_id: next \?\? "" \}\)\)\}[\s\S]{0,180}allowCreate/, "purchase picker reads company and writes the canonical vendor id with Add-new"],
  ["table", /row\.vendor_id \? \([\s\S]{0,160}<EntityLink kind="vendor" id=\{row\.vendor_id\} label=\{entityLabel\(row\.vendor_name, row\.vendor_id, "Vendor"\)\}/, "inventory row drills its exact vendor id with a human label"],
  ["routes", /const querySchema = z\.object\(\{[\s\S]{0,100}operating_company_id: z\.string\(\)\.uuid\(\)[\s\S]{0,100}vendor_id: z\.string\(\)\.uuid\(\)\.optional\(\)/, "reverse GET validates company and vendor UUIDs"],
  ["routes", /withCompany\(user\.uuid, query\.data\.operating_company_id[\s\S]{0,120}const values: unknown\[\] = \[query\.data\.operating_company_id\][\s\S]{0,120}query\.data\.vendor_id \? "AND pi\.vendor_id = \$2::uuid"[\s\S]{0,100}values\.push\(query\.data\.vendor_id\)/, "inventory reverse read binds selected company and vendor filter"],
  ["routes", /COALESCE\(v\.vendor_name, mdata\.resolve_vendor_label_same_company\(pi\.vendor_id, pi\.operating_company_id\)\) AS vendor_name[\s\S]{0,180}v\.id = pi\.vendor_id[\s\S]{0,100}v\.operating_company_id = pi\.operating_company_id[\s\S]{0,140}pi\.operating_company_id = \$1::uuid[\s\S]{0,80}\$\{vendorFilter\}/, "reverse SQL resolves historical vendor labels within the inventory row company"],
  ["routes", /const purchaseSchema = z\.object\(\{[\s\S]{0,700}vendor_id: z\.string\(\)\.uuid\(\)\.optional\(\)/, "purchase writer validates vendor UUID"],
  ["routes", /assertCompanyMembership\(userId, companyId\)[\s\S]{0,160}set_config\('app\.operating_company_id', \$1::text, true\)[\s\S]{0,60}\[companyId\]/, "parts inventory reads and writes establish selected-company scope"],
  ["api", /listPartsInventory\(operatingCompanyId: string, filters: \{ vendor_id\?: string \} = \{\}\)[\s\S]{0,160}operating_company_id: operatingCompanyId[\s\S]{0,140}query\.set\("vendor_id", filters\.vendor_id\)[\s\S]{0,140}`\/api\/v1\/maintenance\/parts-inventory\?\$\{query\.toString\(\)\}`/, "typed client serializes company and vendor into canonical inventory GET"],
  ["reverse", /queryKey: \["vendor-parts-inventory", operatingCompanyId, vendorId\][\s\S]{0,180}listPartsInventory\(operatingCompanyId, \{ vendor_id: vendorId \}\)[\s\S]{0,100}enabled: Boolean\(operatingCompanyId && vendorId\)/, "vendor reverse query identity, GET, and enablement share company plus vendor id"],
  ["reverse", /rows\.map\(\(row\) => \([\s\S]{0,180}<div key=\{row\.id\}[\s\S]{0,180}<EntityLinkOrTombstone kind="parts_inventory" id=\{row\.id\} name=\{row\.part_description\} noun="Part"/, "each returned inventory row drills by canonical id with its part description"],
  ["reverse", /query\.isError[\s\S]{0,220}query\.refetch\(\)[\s\S]{0,260}No parts inventory purchases from this vendor/, "vendor reverse exposes retryable error and honest empty states"],
  ["vendor", /<VendorPartsInventoryReverseSection operatingCompanyId=\{companyId\} vendorId=\{vendor\.id\}/, "vendor profile mounts inventory reverse with company and exact vendor id"],
  ["home", /const partInventoryId = searchParams\.get\("part_inventory_id"\)\?\.trim\(\) \?\? ""/, "inventory reverse route extracts and trims the canonical row id"],
  ["home", /<PartsInventoryTable[\s\S]{0,500}companyId=\{companyId\}[\s\S]{0,500}highlightedRowId=\{partInventoryId\}/, "inventory reverse route feeds its exact row id into the mounted table"],
  ["table", /rowClassName=\{\(row\) => highlightedRowId && row\.id === highlightedRowId/, "inventory table highlights only the exact reverse-linked row"],
];

function failures(candidate) {
  return checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
}
const baseline = failures(sources);
if (baseline.length) {
  console.error(`${LABEL} FAIL:\n- ${baseline.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`${LABEL} SELFTEST FAIL — ${label}`);
      process.exit(1);
    }
    caught += 1;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${checks.length} production-source mutations rejected`);
  process.exit(0);
}
console.log(`${LABEL} PASS — ${checks.length} exact parts-inventory↔vendor create/reverse invariants`);
