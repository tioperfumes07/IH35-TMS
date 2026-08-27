#!/usr/bin/env node
import fs from "node:fs";

const files = [
  "apps/backend/src/maintenance/parts-invoice-links.routes.ts",
  "apps/frontend/src/api/maintenance.ts",
  "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
  "apps/frontend/src/pages/vendors/VendorPartsHistorySection.tsx",
  "apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx",
];

function verify(routes, api, list, vendor, unit) {
  const errors = [];
  const need = (source, pattern, message) => { if (!pattern.test(source)) errors.push(message); };
  const getStart = routes.indexOf('app.get(\n    "/api/v1/maintenance/parts-invoice-links"');
  const unitStart = routes.indexOf('"/api/v1/maintenance/units/:unitId/parts-history"');
  const createStart = routes.indexOf('app.post("/api/v1/maintenance/work-orders/:id/parts-invoice-links"');
  const listRoute = routes.slice(getStart, unitStart);
  const unitRoute = routes.slice(unitStart, createStart);
  need(routes, /unit_linked_only: z\.coerce\.boolean\(\)\.optional\(\)[\s\S]*limit: z\.coerce\.number\(\).*max\(300\)\.default\(50\)[\s\S]*offset: z\.coerce\.number\(\).*default\(0\)/, "route must validate exact list ranges and the linked-unit filter");
  need(listRoute, /SELECT COUNT\(\*\)::text AS total_count[\s\S]*WHERE \$\{filters\.join\(" AND "\)\} AND pil\.voided_at IS NULL/, "assignment list needs an identical scoped count");
  need(listRoute, /LIMIT \$\$\{values\.length \+ 1\}[\s\S]*OFFSET \$\$\{values\.length \+ 2\}/, "assignment list needs bound paging after dynamic filters");
  need(listRoute, /unit_linked_only[\s\S]*wo\.unit_id IS NOT NULL/, "unit-linked filter must execute on the server");
  need(unitRoute, /SELECT COUNT\(\*\)::text AS total_count[\s\S]*wo\.unit_id = \$2::uuid[\s\S]*pil\.voided_at IS NULL/, "unit reverse needs an exact scoped count");
  need(unitRoute, /LIMIT \$3 OFFSET \$4/, "unit reverse needs bound paging");
  if (/LIMIT 500/.test(listRoute + unitRoute)) errors.push("silent 500 caps must stay removed from both mounted routes");
  const apiStart = api.indexOf("export function getPartsAssignmentsPage");
  const apiEnd = api.indexOf("export function adjustPartsInventory");
  api = api.slice(apiStart, apiEnd);
  need(api, /unit_linked_only\?: boolean; limit\?: number; offset\?: number/, "typed list client must carry server filters and range");
  need(api, /query\.set\("limit", String\(filters\?\.limit \?\? 50\)\)[\s\S]*query\.set\("offset", String\(filters\?\.offset \?\? 0\)\)/, "list client must send range");
  need(api, /getUnitPartsHistoryPage[\s\S]*limit: String\(range\.limit \?\? 50\)[\s\S]*offset: String\(range\.offset \?\? 0\)/, "unit client must send range");
  need(list, /queryKey: \["maintenance", "parts-assignments", companyId, unitId, vendorId, unitLinkedOnly, page\]/, "canonical list query identity must include scope, filters, and page");
  need(list, /vendor_id: vendorId \|\| undefined[\s\S]*unit_linked_only: unitLinkedOnly \|\| undefined[\s\S]*offset: page \* PAGE_SIZE/, "canonical list must send staged filters before server paging");
  need(list, /EntityPicker kind="vendor"[\s\S]*allowCreate=\{false\}/, "vendor filter must use the canonical scoped picker without create");
  need(vendor, /queryKey: \["vendor-parts-history", operatingCompanyId, vendorId, page\][\s\S]*offset: page \* PAGE_SIZE/, "vendor reverse must page the exact filtered relationship");
  need(unit, /queryKey: \["unit-parts-history", unitId, companyId, page\][\s\S]*offset: page \* PAGE_SIZE/, "unit reverse must page the exact filtered relationship");
  need(unit, /hidePager[\s\S]*Previous[\s\S]*Next/, "unit reverse must have one authoritative server pager");
  return errors;
}

const sources = files.map((file) => fs.readFileSync(file, "utf8"));
if (process.argv.includes("--selftest")) {
  const mutations = [
    [sources[0].replace("COUNT(*)::text AS total_count", "COUNT(*) AS removed"), ...sources.slice(1)],
    [sources[0].replace("LIMIT $${values.length + 1}", "LIMIT 500"), ...sources.slice(1)],
    [sources[0].replace("wo.unit_id IS NOT NULL", "TRUE"), ...sources.slice(1)],
    [sources[0].replaceAll("LIMIT $3 OFFSET $4", "LIMIT 500"), ...sources.slice(1)],
    [sources[0], sources[1].replaceAll('query.set("offset", String(filters?.offset ?? 0))', 'query.set("offset", "0")'), ...sources.slice(2)],
    [sources[0], sources[1].replace("offset: String(range.offset ?? 0)", 'offset: "0"'), ...sources.slice(2)],
    [sources[0], sources[1], sources[2].replace(", page]", "]"), sources[3], sources[4]],
    [sources[0], sources[1], sources[2].replace("offset: page * PAGE_SIZE", "offset: 0"), sources[3], sources[4]],
    [sources[0], sources[1], sources[2].replace("allowCreate={false}", "allowCreate"), sources[3], sources[4]],
    [sources[0], sources[1], sources[2], sources[3].replace(", page]", "]"), sources[4]],
    [sources[0], sources[1], sources[2], sources[3].replace("offset: page * PAGE_SIZE", "offset: 0"), sources[4]],
    [sources[0], sources[1], sources[2], sources[3], sources[4].replace(", page]", "]")],
    [sources[0], sources[1], sources[2], sources[3], sources[4].replace("offset: page * PAGE_SIZE", "offset: 0")],
    [sources[0], sources[1], sources[2], sources[3], sources[4].replace("hidePager", "")],
  ];
  const survived = mutations.filter((args) => verify(...args).length === 0).length;
  if (survived) { console.error(`verify-parts-assignment-history-exact-range-vertical selftest FAIL: ${survived}/${mutations.length} survived`); process.exit(1); }
  console.log(`verify-parts-assignment-history-exact-range-vertical selftest PASS: ${mutations.length}/${mutations.length} rejected`);
  process.exit(0);
}
const errors = verify(...sources);
if (errors.length) { console.error(errors.map((error) => `- ${error}`).join("\n")); process.exit(1); }
console.log("verify-parts-assignment-history-exact-range-vertical PASS");
