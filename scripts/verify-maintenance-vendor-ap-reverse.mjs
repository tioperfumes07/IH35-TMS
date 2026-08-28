#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","vendors"],"cols":["vendor","connectivity","reverse_link","picker_law"],"leafRe":"^(vendors\\.create|md\\.vendor_details)$","task":"MAINTENANCE-VENDOR-AP-VENDOR-REVERSE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-maintenance-vendor-ap-reverse";
const paths = {
  page: "apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx",
  routes: "apps/backend/src/maintenance/vendors.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  reverse: "apps/frontend/src/pages/vendors/VendorMaintenanceCatalogReverseSection.tsx",
  vendor: "apps/frontend/src/pages/VendorDetail.tsx",
};
const sources = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

const checks = [
  ["page", /queryKey:\s*\["mdata", "vendors", "maint-vendor-link", companyId, apVendorSearch\][\s\S]{0,260}operating_company_id: companyId[\s\S]{0,180}enabled: Boolean\(companyId\) && \(createOpen \|\| Boolean\(editing\)\)/, "AP vendor picker query binds the selected company and modal state"],
  ["page", /<ReferenceSelect[\s\S]{0,260}value=\{draft\.mdata_vendor_id\}[\s\S]{0,260}onChange=\{\(value\) => setDraft\(\(p\) => \(\{ \.\.\.p, mdata_vendor_id: value \}\)\)\}[\s\S]{0,180}createKind="vendor"[\s\S]{0,120}operatingCompanyId=\{companyId\}/, "create picker writes the canonical AP vendor id and uses the canonical nested creator"],
  ["page", /onOptionCreated=\{\(opt\) => \{[\s\S]{0,220}setDraft\(\(p\) => \(\{ \.\.\.p, mdata_vendor_id: opt\.value \}\)\)/, "newly created AP vendor is selected by canonical id"],
  ["page", /createMaintenanceVendor\(\{[\s\S]{0,120}operating_company_id: input\.companyId[\s\S]{0,800}mdata_vendor_id: input\.draft\.mdata_vendor_id/, "maintenance vendor create submits the snapshotted company plus selected AP vendor FK"],
  ["routes", /mdata_vendor_id: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)[\s\S]{0,180}linked_vendor_id: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/, "writer validates both canonical AP vendor aliases as UUIDs"],
  ["routes", /SELECT id FROM mdata\.vendors WHERE id = \$1 AND operating_company_id = \$2::uuid AND deactivated_at IS NULL LIMIT 1[\s\S]{0,80}\[mdataVendorId, companyId\]/, "writer validates active same-company AP vendor ownership"],
  ["routes", /const linkedVendorId = resolveLinkedVendorId\(body\)[\s\S]{0,600}assertMdataVendorExists\(client, body\.operating_company_id, linkedVendorId\)[\s\S]{0,500}INSERT INTO catalogs\.maintenance_vendors[\s\S]{0,240}linked_vendor_id[\s\S]{0,240}VALUES \(\$1, \$2, \$3, \$4, \$5::jsonb, \$6::uuid/, "create validates and persists the selected AP vendor FK in one company-scoped write"],
  ["routes", /withCompany\(user\.uuid, parsed\.data\.operating_company_id[\s\S]{0,120}const values: unknown\[\] = \[parsed\.data\.operating_company_id\][\s\S]{0,120}const filters = \["mvendor\.operating_company_id = \$1::uuid"\]/, "reverse list seeds the selected-company predicate"],
  ["routes", /if \(parsed\.data\.mdata_vendor_id\) \{[\s\S]{0,100}values\.push\(parsed\.data\.mdata_vendor_id\)[\s\S]{0,120}filters\.push\(`mvendor\.linked_vendor_id = \$\$\{values\.length\}::uuid`\)/, "reverse list binds the AP vendor FK as a UUID query parameter"],
  ["routes", /FROM catalogs\.maintenance_vendors mvendor[\s\S]{0,700}WHERE \$\{filters\.join\(" AND "\)\}[\s\S]{0,180}values/, "reverse list executes the composed company and vendor predicates"],
  ["api", /listMaintenanceVendors\([\s\S]{0,140}operatingCompanyId: string,[\s\S]{0,160}mdata_vendor_id\?: string[\s\S]{0,220}operating_company_id: operatingCompanyId[\s\S]{0,320}q\.set\("mdata_vendor_id", params\.mdata_vendor_id\)[\s\S]{0,220}`\/api\/v1\/maintenance\/vendors\?\$\{q\.toString\(\)\}`/, "typed client serializes company and AP vendor filter into the canonical GET"],
  ["reverse", /queryKey: \["vendor-maintenance-catalog", operatingCompanyId, vendorId\][\s\S]{0,200}listMaintenanceVendors\(operatingCompanyId, \{ mdata_vendor_id: vendorId, include_archived: true \}\)[\s\S]{0,100}enabled: Boolean\(operatingCompanyId && vendorId\)/, "vendor reverse query identity, GET, and enablement share company plus vendor id"],
  ["reverse", /rows\.map\(\(row\) => \([\s\S]{0,180}<div key=\{row\.id\}[\s\S]{0,180}<EntityLink kind="maintenance_vendor" id=\{row\.id\} label=\{entityLabel\(row\.display_name, row\.id, "Maintenance vendor"\)\}/, "each returned maintenance vendor drills by canonical id with a human label"],
  ["reverse", /query\.isError[\s\S]{0,220}query\.refetch\(\)[\s\S]{0,260}No maintenance vendor catalog records link to this AP vendor/, "reverse surface exposes retryable error and honest empty states"],
  ["vendor", /<VendorMaintenanceCatalogReverseSection operatingCompanyId=\{companyId\} vendorId=\{vendor\.id\}/, "AP vendor profile mounts the reverse section with its company and row id"],
  ["page", /const highlightedVendorId = searchParams\.get\("maintenance_vendor_id"\)[\s\S]{0,20000}rowClassName=\{\(row\) => highlightedVendorId && row\.id === highlightedVendorId/, "reverse route highlights the exact persisted maintenance vendor row"],
  ["routes", /app\.get\("\/api\/v1\/maintenance\/vendors"[\s\S]{0,1800}ap_vendor\.vendor_name AS mdata_vendor_name[\s\S]{0,180}FROM catalogs\.maintenance_vendors mvendor[\s\S]{0,80}LEFT JOIN mdata\.vendors ap_vendor[\s\S]{0,500}ap_vendor\.operating_company_id = mvendor\.operating_company_id/, "maintenance vendor list resolves the AP vendor name through the same-company canonical join"],
  ["page", /kind="vendor"[\s\S]{0,100}id=\{row\.mdata_vendor_id\}[\s\S]{0,140}label=\{entityLabel\(row\.mdata_vendor_name, row\.mdata_vendor_id, "Vendor"\)\}/, "maintenance vendor list renders the canonical returned AP vendor human label"],
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
console.log(`${LABEL} PASS — ${checks.length} exact maintenance↔AP-vendor create/reverse invariants`);
