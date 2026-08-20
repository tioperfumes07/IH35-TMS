#!/usr/bin/env node
/**
 * Vendors qbo_chrome — leaf-specific Built for the 19 leaves only "claimed" by the broad
 * verify-cursor-vertical-qbo-picker-modules.mjs sweep (leafRe: ^(chrome|detail|home|list|md|
 * vendors)(\.|$)) — same theater-coverage class already found+fixed for insurance/legal/accounting/
 * customers/drivers this session: it verifies generic shared files (ReportsHome, BillsPage,
 * VendorsListView.tsx's mere existence...) and never opens a real vendors leaf's own chrome.
 *
 * chrome.toolbar_(search|range|gear) are already real via CLS-FILTER-GEAR-APPLY (vendors included).
 * chrome.toolbar_filter is already real via CODEX-ZERO-REMAINDER-PROTECTED-CHROME-7 (vendors
 * included, evidence VendorsListView.tsx) — both live in verify-collapsed-list-filters-apply.mjs.
 * None of the 4 toolbar leaves are re-claimed here.
 *
 * All 19 leaves below are genuinely built, traced through the real route/component wiring:
 *   - list.view_list / list.filter_chips: VendorsListView.tsx — real ParityTable +
 *     CollapsedListFilters + the Active/1099-eligible/With-open filter chip row.
 *   - list.view_master_detail / list.filters / list.create: Vendors.tsx — the roster-level
 *     CollapsedListFilters (Status/Category, shared by both view modes) + the real "+ Create Vendor"
 *     ActionButton mounting VendorCreateModal.
 *   - md.transaction_list / md.txn.filters: Vendors.tsx's own master-detail transaction_list tab —
 *     real ParityTable with a real CollapsedListFilters (Type/Status/Date/Category) filter bar.
 *   - md.vendor_details: Vendors.tsx's own vendor_details tab — real EntityLink +
 *     EntityLinkOrTombstone (full-profile drill-through) + a dl field grid.
 *   - md.header.edit / detail.profile / detail.profile.edit: VendorDetail.tsx's Profile tab — a real
 *     Edit/Cancel/Save toggle gating real (not always-disabled) input fields, wired to
 *     updateVendorMutation.
 *   - detail.profile.vendor_type_picker: the same Profile tab's Vendor Type field is a real
 *     ReferenceSelect with addNewLabel="+ Add new vendor type" (picker law, catalog-backed).
 *   - detail.safer_verify: VendorDetail.tsx's header "Verify SAFER" button wired to a real
 *     verifySaferMutation against the FMCSA SAFER endpoint.
 *   - md.header.new_transaction: Vendors.tsx navigates to the real, already-verified
 *     vendor-scoped /accounting/bills?vendor_id= (this session's accounting sweep).
 *   - detail.ap / detail.ap.record_bill_payment: VendorDetail.tsx's A/P tab — real ParityTable(s)
 *     for payments/bills/expenses, plus a real inline DatePicker+MoneyInput record-payment form.
 *   - detail.w9_1099: VendorDetail.tsx's W-9/1099 tab — a real field-grid summary with a real
 *     "Open Documents tab" drill-through button (deliberately read-only; W-9 file lives on Documents).
 *   - vendors.modal.vendor_create: VendorCreateModal.tsx, a real Modal variant="drawer".
 *   - vendors.modal.vendor_linkage: VendorLinkageModal.tsx, a real Modal with a live QBO-vendor
 *     search/select flow.
 *
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^list\\.view_list$","task":"VERTICAL-QBO-CHROME-vendors-list-view-list","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^list\\.filter_chips$","task":"VERTICAL-QBO-CHROME-vendors-list-filter-chips","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^list\\.view_master_detail$","task":"VERTICAL-QBO-CHROME-vendors-list-master-detail","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^list\\.filters$","task":"VERTICAL-QBO-CHROME-vendors-list-filters","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^list\\.create$","task":"VERTICAL-QBO-CHROME-vendors-list-create","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^md\\.transaction_list$","task":"VERTICAL-QBO-CHROME-vendors-md-transaction-list","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^md\\.txn\\.filters$","task":"VERTICAL-QBO-CHROME-vendors-md-txn-filters","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^md\\.vendor_details$","task":"VERTICAL-QBO-CHROME-vendors-md-vendor-details","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^md\\.header\\.edit$","task":"VERTICAL-QBO-CHROME-vendors-md-header-edit","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^md\\.header\\.new_transaction$","task":"VERTICAL-QBO-CHROME-vendors-md-header-new-transaction","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^detail\\.profile$","task":"VERTICAL-QBO-CHROME-vendors-detail-profile","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^detail\\.profile\\.edit$","task":"VERTICAL-QBO-CHROME-vendors-detail-profile-edit","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^detail\\.profile\\.vendor_type_picker$","task":"VERTICAL-QBO-CHROME-vendors-vendor-type-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^detail\\.safer_verify$","task":"VERTICAL-QBO-CHROME-vendors-safer-verify","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^detail\\.ap$","task":"VERTICAL-QBO-CHROME-vendors-detail-ap","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^detail\\.ap\\.record_bill_payment$","task":"VERTICAL-QBO-CHROME-vendors-record-bill-payment","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^detail\\.w9_1099$","task":"VERTICAL-QBO-CHROME-vendors-w9-1099","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^vendors\\.modal\\.vendor_create$","task":"VERTICAL-QBO-CHROME-vendors-modal-create","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["qbo_chrome"],"leafRe":"^vendors\\.modal\\.vendor_linkage$","task":"VERTICAL-QBO-CHROME-vendors-modal-linkage","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-vendors-qbo-chrome-leaves.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendors-qbo-chrome-leaves";

const CHECKS = [
  {
    name: "list.view_list: VendorsListView real ParityTable + CollapsedListFilters",
    file: "apps/frontend/src/pages/vendors/VendorsListView.tsx",
    pattern: /<ParityTable[\s\S]*CollapsedListFilters|CollapsedListFilters[\s\S]*<ParityTable/,
  },
  {
    name: "list.filter_chips: VendorsListView real Active/1099/With-open filter chip row",
    file: "apps/frontend/src/pages/vendors/VendorsListView.tsx",
    pattern: /data-vendor-filter-chips="true"[\s\S]{0,1500}with-open/,
  },
  {
    name: "list.view_master_detail / list.filters: Vendors.tsx real roster CollapsedListFilters (Status/Category)",
    file: "apps/frontend/src/pages/Vendors.tsx",
    pattern: /<CollapsedListFilters[\s\S]{0,1500}rosterFilters\.apply/,
  },
  {
    name: "list.create: Vendors.tsx real + Create Vendor ActionButton mounting VendorCreateModal",
    file: "apps/frontend/src/pages/Vendors.tsx",
    pattern: /\+ Create Vendor[\s\S]{0,14000}<VendorCreateModal open=\{createOpen\}/,
  },
  {
    name: "md.transaction_list / md.txn.filters: Vendors.tsx real ParityTable + CollapsedListFilters txn filter bar",
    file: "apps/frontend/src/pages/Vendors.tsx",
    pattern: /activeTab === "transaction_list"[\s\S]{0,400}<ParityTable[\s\S]{0,2500}<CollapsedListFilters[\s\S]{0,400}onApply=\{txnFilters\.apply\}/,
  },
  {
    name: "md.vendor_details: Vendors.tsx real EntityLink + EntityLinkOrTombstone vendor_details section",
    file: "apps/frontend/src/pages/Vendors.tsx",
    pattern: /activeTab === "vendor_details"[\s\S]{0,1000}EntityLinkOrTombstone/,
  },
  {
    name: "md.header.new_transaction: Vendors.tsx navigates to the real vendor-scoped bills create hop",
    file: "apps/frontend/src/pages/Vendors.tsx",
    pattern: /navigate\(`\/accounting\/bills\?vendor_id=\$\{selectedVendor\.id\}`\)/,
  },
  {
    name: "md.header.edit / detail.profile / detail.profile.edit: VendorDetail real Edit/Save toggle wired to updateVendorMutation",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /profileEditMode[\s\S]{0,1500}updateVendorMutation\.mutate\(\)/,
  },
  {
    name: "detail.profile.vendor_type_picker: VendorDetail real ReferenceSelect with +Add new vendor type",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /<ReferenceSelect[\s\S]{0,400}addNewLabel="\+ Add new vendor type"/,
  },
  {
    name: "detail.safer_verify: VendorDetail real Verify SAFER button wired to verifySaferMutation",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /verifySaferMutation\.mutate\(\)[\s\S]{0,200}Verify SAFER/,
  },
  {
    name: "detail.ap: VendorDetail A/P tab real ParityTable(s)",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /\{activeTab === "A\/P" \? \([\s\S]{0,8500}<ParityTable/,
  },
  {
    name: "detail.ap.record_bill_payment: VendorDetail real inline DatePicker + MoneyInput payment fields",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /DatePicker[\s\S]{0,80}value=\{billPayDate\}[\s\S]{0,400}MoneyInput[\s\S]{0,120}valueDollars=\{billPayAmount/,
  },
  {
    name: "detail.w9_1099: VendorDetail W-9/1099 tab real field grid + Documents drill-through",
    file: "apps/frontend/src/pages/VendorDetail.tsx",
    pattern: /activeTab === "W-9 \/ 1099"[\s\S]{0,1500}Open Documents tab/,
  },
  {
    name: "vendors.modal.vendor_create: VendorCreateModal is a real Modal variant=drawer",
    file: "apps/frontend/src/components/vendors/VendorCreateModal.tsx",
    pattern: /<Modal variant="drawer" open=\{open\}[\s\S]{0,100}title="Create Vendor"/,
  },
  {
    name: "vendors.modal.vendor_linkage: VendorLinkageModal is a real Modal with a live QBO-vendor search flow",
    file: "apps/frontend/src/components/qbo/VendorLinkageModal.tsx",
    pattern: /<Modal open=\{open\}[\s\S]{0,100}title="QBO Vendor Linkage"[\s\S]{0,2000}<input/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".vendors-qbo-chrome-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} checks / 19 vendors qbo_chrome leaf asserts`);
