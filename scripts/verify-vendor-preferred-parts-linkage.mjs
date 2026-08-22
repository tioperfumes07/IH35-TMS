#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-vendor-preferred-parts-linkage";
const files = {
  route: "apps/backend/src/maintenance/parts.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  reverse: "apps/frontend/src/pages/vendors/VendorPreferredPartsReverseSection.tsx",
  profile: "apps/frontend/src/pages/VendorDetail.tsx",
  inventory: "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx",
  create: "apps/frontend/src/pages/inventory/PartCreateDrawer.tsx",
  edit: "apps/frontend/src/pages/inventory/PartEditDrawer.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

const checks = [
  ["route accepts company-scoped vendor UUID", "route", /operating_company_id:\s*z\.string\(\)\.uuid\(\)[\s\S]{0,180}vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/],
  ["route establishes membership and company GUC", "route", /assertCompanyMembership\(userId, companyId\)[\s\S]{0,180}set_config\('app\.operating_company_id', \$1::text, true\)/],
  ["list starts from selected company", "route", /const values: unknown\[\] = \[query\.data\.operating_company_id\];[\s\S]{0,100}pi\.operating_company_id = \$1::uuid/],
  ["list binds vendor filter instead of interpolating it", "route", /values\.push\(query\.data\.vendor_id\);\s*filters\.push\(`pi\.vendor_id = \$\$\{values\.length\}::uuid`\)/],
  ["list resolves vendor labels inside the same company", "route", /COALESCE\(v\.vendor_name, mdata\.resolve_vendor_label_same_company\(pi\.vendor_id, pi\.operating_company_id\)\) AS vendor_name[\s\S]{0,700}v\.operating_company_id = pi\.operating_company_id/],
  ["writer accepts only an active same-company vendor", "route", /FROM mdata\.vendors[\s\S]{0,100}id = \$1::uuid[\s\S]{0,100}operating_company_id = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL/],
  ["create rejects foreign-company vendor", "route", /app\.post\("\/api\/v1\/maintenance\/parts"[\s\S]{0,700}if \(body\.data\.vendor_id && !\(await vendorBelongsToCompany\(client, body\.data\.vendor_id, companyId\)\)\)[\s\S]{0,100}linked_entity_not_in_operating_company/],
  ["create persists canonical vendor FK", "route", /INSERT INTO maintenance\.parts_inventory \([\s\S]{0,800}vendor_id,[\s\S]{0,1800}body\.data\.vendor_id \?\? null/],
  ["update loads and writes only the selected company's part", "route", /SELECT \* FROM maintenance\.parts_inventory WHERE id = \$1::uuid AND operating_company_id = \$2::uuid[\s\S]{0,1400}add\("vendor_id", body\.data\.vendor_id \?\? null\)[\s\S]{0,1000}WHERE id = \$\$\{values\.length - 1\}::uuid AND operating_company_id = \$\$\{values\.length\}::uuid/],
  ["client serializes both company and vendor filters", "api", /new URLSearchParams\(\{ operating_company_id: operatingCompanyId \}\)[\s\S]{0,180}q\.set\("vendor_id", params\.vendor_id\)[\s\S]{0,140}\/api\/v1\/maintenance\/parts\?\$\{q\.toString\(\)\}/],
  ["reverse cache identity contains company and vendor", "reverse", /queryKey: \["vendor-preferred-parts", operatingCompanyId, vendorId\]/],
  ["reverse GET and enablement use the same identities", "reverse", /listMaintenanceParts\(operatingCompanyId, \{ vendor_id: vendorId \}\)[\s\S]{0,100}enabled: Boolean\(operatingCompanyId && vendorId\)/],
  ["reverse renders each returned part as its exact human-labeled drill", "reverse", /rows\.map\(\(part\) =>[\s\S]{0,180}<div key=\{part\.id\}[\s\S]{0,220}<EntityLink kind="inventory_part" id=\{part\.id\} label=\{entityLabel\(part\.name, part\.id, "Part"\)\}/],
  ["reverse keeps retryable error and honest empty states", "reverse", /ListErrorBanner[\s\S]{0,220}query\.refetch\(\)[\s\S]{0,220}No inventory parts use this preferred vendor/],
  ["vendor profile passes selected company and exact vendor", "profile", /<VendorPreferredPartsReverseSection operatingCompanyId=\{companyId\} vendorId=\{vendor\.id\} \/>/],
  ["inventory deep link resolves exact returned part", "inventory", /searchParams\.get\("part_id"\)[\s\S]{0,140}rawParts\.find\(\(part\) => part\.id === requestedPartId\)[\s\S]{0,80}setEditingPart\(requestedPart\)/],
  ["creator reload identity is the persisted returned ID", "inventory", /onCreated=\{\(id\) => \{[\s\S]{0,140}next\.set\("part_id", id\)[\s\S]{0,120}operatingCompanyId=\{operatingCompanyId\}/],
  ["creator scopes vendor picker and submits canonical FK", "create", /vendor_id: data\.vendor_id\.trim\(\) \|\| undefined[\s\S]{0,5000}<EntityPicker[\s\S]{0,160}kind="vendor"[\s\S]{0,160}operatingCompanyId=\{operatingCompanyId\}/],
  ["editor reloads, scopes, and persists canonical vendor FK", "edit", /vendor_id: part\.vendor_id \?\? ""[\s\S]{0,900}vendor_id: data\.vendor_id\.trim\(\) \|\| null[\s\S]{0,6000}<EntityPicker[\s\S]{0,160}kind="vendor"[\s\S]{0,160}operatingCompanyId=\{operatingCompanyId\}/],
];

function audit(sources) {
  return checks.filter(([, key, pattern]) => !pattern.test(sources[key])).map(([message]) => message);
}

if (process.argv.includes("--selftest")) {
  for (const [message, key, pattern] of checks) {
    const changedSource = source[key].replace(pattern, "/* planted preferred-parts linkage defect */");
    if (changedSource === source[key]) {
      console.error(`${LABEL} SELFTEST FAIL — planted mutation was inert: ${message}`);
      process.exit(1);
    }
    if (!audit({ ...source, [key]: changedSource }).includes(message)) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${message}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length} production-source mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — company-scoped picker/create/edit→vendor FK→human reverse row→exact part drill`);
