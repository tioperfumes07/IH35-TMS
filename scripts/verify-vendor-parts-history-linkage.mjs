#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-vendor-parts-history-linkage";
const files = {
  route: "apps/backend/src/maintenance/parts-invoice-links.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  creator: "apps/frontend/src/components/maintenance/AddPartsLinkModal.tsx",
  reverse: "apps/frontend/src/pages/vendors/VendorPartsHistorySection.tsx",
  link: "apps/frontend/src/components/shared/EntityLink.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/kind=["']vendor["']/.test(s.creator) || !/allowCreate/.test(s.creator) || !/vendor_id:\s*vendorId/.test(s.creator)) failures.push("creator must pick and submit canonical vendor FK");
  if (!/EntityPicker/.test(s.creator)) failures.push("creator must use EntityPicker for vendor");
  if (!/EXISTS \([\s\S]{0,160}FROM mdata\.vendors[\s\S]{0,160}deactivated_at IS NULL/.test(s.route)) failures.push("writer must validate active tenant vendor");
  if (!/FROM maintenance\.parts_inventory[\s\S]{0,100}operating_company_id = \$2::uuid/.test(s.route)) failures.push("writer must validate optional tenant part FK");
  if (!/linked_entity_not_in_operating_company/.test(s.route)) failures.push("invalid links must fail before insert");
  if (!/vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route) || !/pil\.vendor_id = \$\$\{values\.length\}::uuid/.test(s.route)) failures.push("list route must apply exact vendor predicate");
  if (!/filters\?: \{ vendor_id\?: string; work_order_id\?: string \}/.test(s.api) || !/query\.set\("vendor_id", filters\.vendor_id\)/.test(s.api)) failures.push("client must forward vendor reverse filter");
  if (!/getPartsAssignmentsPage\(operatingCompanyId, \{ vendor_id: vendorId \}\)/.test(s.reverse)) failures.push("vendor profile must request exact reverse page");
  if (/\.filter\(\(row\) => row\.vendor_id === vendorId\)/.test(s.reverse)) failures.push("vendor profile must not browser-filter capped company response");
  if (!/ListErrorBanner/.test(s.reverse) || !/No parts invoices are linked/.test(s.reverse)) failures.push("reverse surface must preserve honest states");
  if (!/<EntityLinkOrTombstone kind="work_order" id=\{row\.work_order_id\} name=\{row\.work_order_display_id\} noun="Work order"/.test(s.reverse)) failures.push("reverse rows must drill to canonical work order or show its tombstone");
  if (!/kind="inventory_part"[\s\S]{0,140}parts_inventory_id[\s\S]{0,140}part_description/.test(s.reverse)) failures.push("reverse rows must drill to canonical part or show its tombstone");
  if (!/kind="unit"[\s\S]{0,140}unit_id[\s\S]{0,140}unit_number/.test(s.reverse)) failures.push("reverse rows must drill to canonical unit or show its tombstone");
  if (!/totalCount > rows\.length/.test(s.reverse) || !/Showing \{rows\.length\} of \{totalCount\} parts invoices/.test(s.reverse)) failures.push("capped vendor reverse must disclose exact range");
  if (!/case "work_order":[\s\S]{0,100}maintenance\/work-orders/.test(s.link)) failures.push("work order route must be canonical");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /kind=["']vendor["']/, 'kind="customer"'],
    ["payload", "creator", /vendor_id:\s*vendorId/, "vendor_id: undefined"],
    ["vendor validation", "route", /deactivated_at IS NULL/, "TRUE"],
    ["part validation", "route", /FROM maintenance\.parts_inventory/, "FROM maintenance.parts_catalog"],
    ["reject", "route", /linked_entity_not_in_operating_company/, "invalid_link"],
    ["schema", "route", /vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/, ""],
    ["filter", "route", /pil\.vendor_id = \$\$\{values\.length\}::uuid/, "TRUE"],
    ["api", "api", /query\.set\("vendor_id", filters\.vendor_id\)/g, 'query.set("status", filters.vendor_id)'],
    ["reverse", "reverse", /getPartsAssignmentsPage\(operatingCompanyId, \{ vendor_id: vendorId \}\)/, "getPartsAssignmentsPage(operatingCompanyId)"],
    ["error", "reverse", /ListErrorBanner/g, "MissingError"],
    ["drill", "reverse", /<EntityLinkOrTombstone kind="work_order" id=\{row\.work_order_id\} name=\{row\.work_order_display_id\} noun="Work order"/, '<EntityLinkOrTombstone kind="vendor" id={row.work_order_id} name={null} noun="Vendor"'],
    ["part drill", "reverse", /kind="inventory_part"/, 'kind="vendor"'],
    ["unit drill", "reverse", /kind="unit"/, 'kind="vendor"'],
    ["route", "link", /case "work_order":/, 'case "work_order_missing":'],
    ["range", "reverse", /totalCount > rows\.length/, "false"],
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
console.log(`${LABEL} PASS — canonical vendor create→tenant validation→exact vendor reverse→WO drill`);
