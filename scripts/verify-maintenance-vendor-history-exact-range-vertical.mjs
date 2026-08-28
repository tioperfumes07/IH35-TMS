#!/usr/bin/env node
import fs from "node:fs";

const paths = [
  "apps/backend/src/maintenance/vendors.routes.ts",
  "apps/frontend/src/api/maintenance.ts",
  "apps/frontend/src/pages/maintenance/VendorDetailPage.tsx",
];
const sources = paths.map((path) => fs.readFileSync(path, "utf8"));

function verify(routes, api, page) {
  const errors = [];
  const need = (source, pattern, message) => { if (!pattern.test(source)) errors.push(message); };
  need(routes, /detailQuerySchema[\s\S]*wo_page:[\s\S]*invoice_page:[\s\S]*page_size:/, "detail route must validate both independent ranges");
  need(routes, /count\(\*\)::int AS wo_total[\s\S]*count\(\*\) FILTER[\s\S]*invoice_total/, "both histories need exact counts from the shared company/vendor predicate");
  need(routes, /LIMIT \$5 OFFSET \$6/g, "both histories need bound range queries");
  if ((routes.match(/LIMIT \$5 OFFSET \$6/g) ?? []).length !== 2) errors.push("both mounted histories must be ranged");
  if (/LIMIT 100/.test(routes.slice(routes.indexOf("async function fetchVendorDetail"), routes.indexOf("export async function registerMaintenanceVendorsRoutes")))) errors.push("silent 100 caps must stay removed");
  need(api, /woPage\?: number; invoicePage\?: number; pageSize\?: number/, "typed client must expose both ranges");
  need(api, /wo_total_count: number;[\s\S]*invoice_total_count: number/, "typed client must retain both exact counts");
  need(page, /queryKey: \["maintenance", "vendor-detail", companyId, vendorId, woPage, invoicePage\]/, "query identity must include both pages");
  need(page, /maintenance-vendor-wo-history-pager[\s\S]*maintenance-vendor-invoice-history-pager/, "both mounted histories need controlled pagers");
  need(page, /const detail = detailQ\.isError \? undefined : detailQ\.data;/, "failed aggregate reads must suppress retained vendor and history data");
  need(page, /\{!detailQ\.isError \? \([\s\S]*Work Order History[\s\S]*Invoice History[\s\S]*\) : null\}/, "failed aggregate reads must hide both histories and their pagers together");
  need(page, /EntityLinkOrTombstone kind="work_order"/, "work-order forward drills must remain mounted");
  need(page, /EntityLink[\s\S]*kind="vendor"/, "canonical AP vendor drill must remain mounted");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [sources[0].replaceAll("wo_page", "wopage"), sources[1], sources[2]],
    [sources[0].replaceAll("invoice_page", "invoicepage"), sources[1], sources[2]],
    [sources[0].replace("count(*)::int AS wo_total", "count(*) AS removed"), sources[1], sources[2]],
    [sources[0].replace("LIMIT $5 OFFSET $6", "LIMIT 100"), sources[1], sources[2]],
    [sources[0].replaceAll("LIMIT $5 OFFSET $6", "LIMIT 100"), sources[1], sources[2]],
    [sources[0], sources[1].replace("wo_total_count: number;", ""), sources[2]],
    [sources[0], sources[1], sources[2].replace(", woPage, invoicePage]", "]")],
    [sources[0], sources[1], sources[2].replace("maintenance-vendor-wo-history-pager", "removed")],
    [sources[0], sources[1], sources[2].replace("maintenance-vendor-invoice-history-pager", "removed")],
    [sources[0], sources[1], sources[2].replace("detailQ.isError ? undefined : detailQ.data", "detailQ.data")],
    [sources[0], sources[1], sources[2].replace("{!detailQ.isError ? (", "{true ? (")],
    [sources[0], sources[1], sources[2].replaceAll('EntityLinkOrTombstone kind="work_order"', "span")],
    [sources[0], sources[1], sources[2].replaceAll('kind="vendor"', 'kind="unknown"')],
  ];
  const survivedIndexes = mutations.map((args, index) => verify(...args).length === 0 ? index + 1 : null).filter(Boolean);
  if (survivedIndexes.length) { console.error(`selftest FAIL: ${survivedIndexes.length}/${mutations.length} survived (${survivedIndexes.join(",")})`); process.exit(1); }
  console.log(`verify-maintenance-vendor-history-exact-range-vertical selftest PASS: ${mutations.length}/${mutations.length} rejected`);
  process.exit(0);
}
const errors = verify(...sources);
if (errors.length) { console.error(errors.map((error) => `- ${error}`).join("\n")); process.exit(1); }
console.log("verify-maintenance-vendor-history-exact-range-vertical PASS");
