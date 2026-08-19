#!/usr/bin/env node
/** @matrix-built {"modules":["vendors"],"cols":["vendor"],"leafRe":"^(home\\.roster|list\\.(view_list|view_master_detail|segment\\.(all|active|inactive|by_category)|filters|filter_chips|create|sync|bulk|export_csv)|md\\.(transaction_list|vendor_details|notes|header\\.(edit|new_transaction)|txn\\.filters))$","task":"LINK-F5166-VENDORS-LIST-MASTER-DETAIL"} */
/**
 * OWNER-EXECUTION-PLAN vertical vendor-column sweep (2026-08-14): the vendors module's own list/
 * master-detail surfaces (Vendors.tsx + VendorsListView.tsx + VendorsSyncPanel.tsx) are all
 * genuinely vendor-record-scoped — real deactivated_at/vendor_type segment filters over the real
 * vendor roster, a real createVendor modal, bulk actions scoped to mdata.vendors, and real
 * vendor_id-keyed sub-tab queries/navigation.
 *
 * Self-test: node scripts/verify-vendors-list-master-detail.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  vendors: "apps/frontend/src/pages/Vendors.tsx",
  listView: "apps/frontend/src/pages/vendors/VendorsListView.tsx",
};
const LABEL = "verify-vendors-list-master-detail";

export function audit(src) {
  const failures = [];
  if (!/listVendors\(\{ operating_company_id: companyId/.test(src.vendors)) {
    failures.push(`${FILES.vendors}: home.roster must query the real vendor roster`);
  }
  if (!/vendor\.deactivated_at != null/.test(src.vendors) || !/vendor\.deactivated_at == null/.test(src.vendors)) {
    failures.push(`${FILES.vendors}: active/inactive segments must filter real vendor.deactivated_at`);
  }
  // CC-2 GUARD 2026-08-19: re-anchored — LV-VENDORS-BY-CATEGORY-NATIVE-SELECT-NO-CREATOR was fixed
  // since this guard's original check: the by_category filter now does a case-insensitive match
  // against both the selected category's code and its resolved catalog label (more robust than a
  // strict === on vendor_type alone), and the filter control itself was upgraded from a native
  // <select> to the canonical ReferenceSelect with createKind="vendor_type" (real catalog-backed
  // + "+ Add new vendor type" inline creator).
  if (!/accepted\.has\(String\(vendor\.vendor_type \?\? ""\)\.toLowerCase\(\)\)/.test(src.vendors)) {
    failures.push(`${FILES.vendors}: by_category segment must filter real vendor_type`);
  }
  if (!/<ReferenceSelect[\s\S]{0,300}createKind="vendor_type"/.test(src.vendors)) {
    failures.push(`${FILES.vendors}: by_category filter must use the canonical ReferenceSelect with an inline vendor_type creator`);
  }
  if (!/<VendorCreateModal/.test(src.vendors)) {
    failures.push(`${FILES.vendors}: list.create must mount the real VendorCreateModal`);
  }
  if (!/<VendorsSyncPanel operatingCompanyId=\{companyId\} \/>/.test(src.vendors)) {
    failures.push(`${FILES.vendors}: list.sync must mount the real sync panel`);
  }
  if (!/onClick=\{\(\) => navigate\(`\/vendors\/\$\{selectedVendor\.id\}`\)\}\s*data-testid="vendor-header-edit"/.test(src.vendors)) {
    failures.push(`${FILES.vendors}: md.header.edit must navigate to the real selected vendor's own record`);
  }
  if (!/vendor_id=\$\{selectedVendor\.id\}/.test(src.vendors)) {
    failures.push(`${FILES.vendors}: md.header.new_transaction must navigate with the real selected vendor's id`);
  }
  if (!/bulkUpdate\(\{ domain: "mdata", resource: "vendors"/.test(src.listView)) {
    failures.push(`${FILES.listView}: list.bulk must target the real mdata.vendors resource`);
  }
  if (!/function exportVendorsCsv/.test(src.listView)) {
    failures.push(`${FILES.listView}: list.export_csv must build a real vendor CSV export`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    vendors: fs.readFileSync(path.join(root, FILES.vendors), "utf8"),
    listView: fs.readFileSync(path.join(root, FILES.listView), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["roster-query", "vendors", /listVendors\(\{ operating_company_id: companyId/, "listSomethingElse({ operating_company_id: companyId"],
    ["inactive-filter", "vendors", /vendor\.deactivated_at != null/g, "false"],
    ["category-filter", "vendors", /accepted\.has\(String\(vendor\.vendor_type \?\? ""\)\.toLowerCase\(\)\)/g, "false"],
    ["category-picker-law", "vendors", /createKind="vendor_type"/, 'createKind="__PLANTED_REMOVED__"'],
    ["create-modal", "vendors", /<VendorCreateModal/g, "<div"],
    ["sync-panel", "vendors", /<VendorsSyncPanel operatingCompanyId=\{companyId\} \/>/, "null"],
    ["header-edit-nav", "vendors", /onClick=\{\(\) => navigate\(`\/vendors\/\$\{selectedVendor\.id\}`\)\}\s*data-testid="vendor-header-edit"/, 'onClick={() => navigate(`/vendors`)} data-testid="vendor-header-edit"'],
    ["header-new-tx-nav", "vendors", /vendor_id=\$\{selectedVendor\.id\}/, "vendor_id=none"],
    ["bulk-resource", "listView", /bulkUpdate\(\{ domain: "mdata", resource: "vendors"/, 'bulkUpdate({ domain: "mdata", resource: "units"'],
    ["export-fn", "listView", /function exportVendorsCsv/, "function exportSomethingElse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — vendors list/master-detail surfaces are genuinely vendor-record-scoped`);
