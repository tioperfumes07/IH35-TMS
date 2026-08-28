#!/usr/bin/env node
/** @matrix-built {"modules":["vendors"],"cols":["vendor","connectivity","reverse_link","qbo_chrome"],"leaves":["home.roster"],"task":"VEND-F6924-NONMONEY-VENDOR-COMPLETE-ROSTERS","vertical":"class-sweep"} */
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity","qbo_chrome"],"leaves":["parts.vendor_suggestions"],"task":"VEND-F6924-NONMONEY-VENDOR-COMPLETE-ROSTERS","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const live = {
  api: read("apps/frontend/src/api/mdata.ts"),
  backend: read("apps/backend/src/mdata/vendors.routes.ts"),
  vendors: read("apps/frontend/src/pages/Vendors.tsx"),
  parts: read("apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx"),
};

function verify(s) {
  const helper = s.api.slice(s.api.indexOf("export async function listAllVendors"), s.api.indexOf("export function getVendor"));
  const checks = [
    ["exhaustive helper", helper.startsWith("export async function listAllVendors")],
    ["stable authoritative total", /expectedTotal = page\.total/.test(helper) && /page\.total !== expectedTotal/.test(helper)],
    ["deduplicated IDs", /seen\.has\(vendor\.id\)/.test(helper) && /seen\.add\(vendor\.id\)/.test(helper)],
    ["progress-safe offset", /offset \+= page\.vendors\.length/.test(helper) && /page\.vendors\.length === 0/.test(helper)],
    ["deterministic vendor order", /ORDER BY created_at DESC, id DESC/.test(s.backend)],
    ["active master complete", /listAllVendors\(\{ operating_company_id: companyId, active_company_only: true \}\)/.test(s.vendors)],
    ["inactive master complete", /listAllVendors\(\{ operating_company_id: companyId, status: "inactive" \}\)/.test(s.vendors)],
    ["parts suggestions complete", /listAllVendors\(\{ operating_company_id: companyId \}\)\.then\(\(r\) => r\.vendors\)/.test(s.parts)],
    ["parts suggestions remain denormalized", /vendor_default is a denormalized text label, not a[\s\S]*vendor_id FK/.test(s.parts)],
  ];
  return checks.filter(([, ok]) => !ok).map(([label]) => label);
}

const failures = verify(live);
if (failures.length) {
  console.error(`verify-nonmoney-vendor-complete-rosters FAILED: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["total drift accepted", { ...live, api: live.api.replace('if (page.total !== expectedTotal) throw new Error("Vendor roster changed during pagination. Retry.");', 'if (false) throw new Error("Vendor roster changed during pagination. Retry.");') }],
    ["early empty accepted", { ...live, api: live.api.replace('if (page.vendors.length === 0) throw new Error("Vendor roster pagination stopped before the reported total.");', 'if (false) throw new Error("Vendor roster pagination stopped before the reported total.");') }],
    ["unstable SQL", { ...live, backend: live.backend.replace(", id DESC", "") }],
    ["active first page", { ...live, vendors: live.vendors.replace("listAllVendors({ operating_company_id: companyId, active_company_only: true })", "listVendors({ operating_company_id: companyId, limit: 5000, active_company_only: true })") }],
    ["inactive first page", { ...live, vendors: live.vendors.replace("listAllVendors({ operating_company_id: companyId, status: \"inactive\" })", "listVendors({ operating_company_id: companyId, limit: 5000, status: \"inactive\" })") }],
    ["parts first page", { ...live, parts: live.parts.replace("listAllVendors({ operating_company_id: companyId })", "listVendors({ operating_company_id: companyId })") }],
  ];
  for (const [label, mutation] of mutations) {
    if (verify(mutation).length === 0) {
      console.error(`verify-nonmoney-vendor-complete-rosters SELFTEST FAILED: mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-nonmoney-vendor-complete-rosters SELFTEST PASS — ${mutations.length} planted defects rejected`);
}

console.log("verify-nonmoney-vendor-complete-rosters PASS — Vendors master and Maintenance parts suggestions exhaust the scoped canonical vendor population");
