#!/usr/bin/env node
/**
 * VEND-F5822 — vendor profile must reverse-read both WO vendor storage paths through the resolved FK.
 * @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leaves":["detail.ap"],"task":"VEND-F5822","vertical":"column-wave"}
 */
import fs from "node:fs";

const LABEL = "verify-vendor-work-orders-canonical-reverse";
const F = {
  route: "apps/backend/src/maintenance/work-orders.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  section: "apps/frontend/src/pages/vendors/VendorWorkOrdersReverseSection.tsx",
  detail: "apps/frontend/src/pages/VendorDetail.tsx",
  matrix: "docs/specs/scoreboard/modules/vendors.required.json",
};
const checks = [
  ["route", /const listQuerySchema[\s\S]{0,700}vendor_id: z\.string\(\)\.uuid\(\)\.optional\(\)/, "list schema accepts canonical vendor reverse"],
  ["route", /q\.equipment_id \|\| q\.load_id \|\| q\.driver_id \|\| q\.vendor_id[\s\S]{0,180}w\.voided_at IS NULL/, "vendor reverse includes completed non-void history"],
  ["route", /if \(q\.vendor_id\)[\s\S]{0,180}COALESCE\(w\.external_vendor_id, w\.vendor_id\) = \$\$\{values\.length\}::uuid/, "route filters resolved canonical vendor FK"],
  ["api", /listWorkOrdersFiltered\([\s\S]{0,260}vendor_id\?: string/, "client types vendor_id"],
  ["api", /if \(params\.vendor_id\) qs\.set\("vendor_id", params\.vendor_id\)/, "client serializes vendor_id"],
  ["section", /listWorkOrdersFiltered\(operatingCompanyId, \{ vendor_id: vendorId \}\)/, "profile reads exact vendor reverse"],
  ["section", /kind="work_order"[\s\S]{0,120}id=\{workOrder\.id\}[\s\S]{0,120}name=\{workOrder\.display_id\}/, "row drills exact human work order"],
  ["detail", /<VendorWorkOrdersReverseSection operatingCompanyId=\{companyId\} vendorId=\{vendor\.id\}/, "vendor profile mounts scoped reverse section"],
  ["matrix", /"id": "detail\.ap"[\s\S]{0,280}"reverse_link"/, "exact vendor detail.ap owns reverse_link"],
];
const live = Object.fromEntries(Object.entries(F).map(([k, file]) => [k, fs.readFileSync(file, "utf8")]));
const audit = (src) => checks.filter(([k, re]) => !re.test(src[k])).map(([, , msg]) => msg);
const failures = audit(live);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  for (const [k, re, msg] of checks) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const planted = live[k].replace(new RegExp(re.source, flags), "/* planted VEND-F5822 defect */");
    if (planted === live[k] || !audit({ ...live, [k]: planted }).includes(msg)) {
      console.error(`${LABEL} SELFTEST FAIL — plant escaped: ${msg}`); process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} production/matrix defects rejected`); process.exit(0);
}
console.log(`${LABEL} PASS — vendor profile returns both canonical WO vendor storage paths`);
