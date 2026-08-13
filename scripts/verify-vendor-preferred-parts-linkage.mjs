#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-vendor-preferred-parts-linkage";
const files = {
  route: "apps/backend/src/maintenance/parts.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  reverse: "apps/frontend/src/pages/vendors/VendorPreferredPartsReverseSection.tsx",
  profile: "apps/frontend/src/pages/VendorDetail.tsx",
  inventory: "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route) || !/filters\.push\(`vendor_id = \$\$\{values\.length\}::uuid`\)/.test(s.route)) failures.push("list must expose exact vendor_id predicate");
  if (!/FROM mdata\.vendors[\s\S]{0,220}operating_company_id = \$2::uuid[\s\S]{0,120}deactivated_at IS NULL/.test(s.route)) failures.push("writer must validate active tenant vendor");
  if ((s.route.match(/vendorBelongsToCompany\(/g) ?? []).length < 3 || !/linked_entity_not_in_operating_company/.test(s.route)) failures.push("create and update must reject invalid vendor before write");
  if (!/SELECT \* FROM maintenance\.parts_inventory WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/.test(s.route)) failures.push("update lookup must be tenant scoped");
  if (!/params: \{ search\?: string; include_voided\?: boolean; vendor_id\?: string \}/.test(s.api) || !/q\.set\("vendor_id", params\.vendor_id\)/.test(s.api)) failures.push("client must forward vendor reverse filter");
  if (!/listMaintenanceParts\(operatingCompanyId, \{ vendor_id: vendorId \}\)/.test(s.reverse)) failures.push("vendor profile section must request exact reverse set");
  if (!/ListErrorBanner/.test(s.reverse) || !/No inventory parts use this preferred vendor/.test(s.reverse)) failures.push("reverse surface must preserve honest states");
  if (!/to=\{`\/inventory\?part_id=\$\{encodeURIComponent\(part\.id\)\}`\}/.test(s.reverse)) failures.push("reverse rows must deep-link exact part");
  if (!/VendorPreferredPartsReverseSection/.test(s.profile)) failures.push("vendor profile must mount reverse section");
  if (!/searchParams\.get\("part_id"\)/.test(s.inventory) || !/setEditingPart\(requestedPart\)/.test(s.inventory)) failures.push("inventory route must resolve exact part deep-link");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["filter", "route", /filters\.push\(`vendor_id = \$\$\{values\.length\}::uuid`\)/, "filters.push(`TRUE`)"] ,
    ["validation", "route", /deactivated_at IS NULL/, "TRUE"],
    ["reject", "route", /linked_entity_not_in_operating_company/g, "invalid_link"],
    ["api", "api", /q\.set\("vendor_id", params\.vendor_id\)/g, 'q.set("status", params.vendor_id)'],
    ["reverse", "reverse", /listMaintenanceParts\(operatingCompanyId, \{ vendor_id: vendorId \}\)/, "listMaintenanceParts(operatingCompanyId)"],
    ["drill", "reverse", /\/inventory\?part_id=/, "/inventory?missing="],
    ["mount", "profile", /VendorPreferredPartsReverseSection/g, "MissingPreferredParts"],
    ["resolve", "inventory", /searchParams\.get\("part_id"\)/, 'searchParams.get("missing")'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation escaped or was inert`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} linkage mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — part vendor picker→tenant writer→exact reverse→part drill`);
