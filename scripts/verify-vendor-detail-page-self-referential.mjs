#!/usr/bin/env node
/** @matrix-built {"modules":["vendors"],"cols":["vendor"],"leafRe":"^detail\\.(profile|profile\\.(edit|driver_link|vendor_type_picker|default_expense_account|payment_terms|category_save)|inactivate|reactivate|safer_verify|ap|ap\\.(record_bill_payment|bills|expenses|vendor_credits|bill_payments)|documents|audit_history|tasks|w9_1099)$","task":"LINK-F5166-VENDOR-DETAIL-SELF-REFERENTIAL"} */
/** @matrix-built {"modules":["vendors"],"cols":["vendor"],"leafRe":"^vendors\\.panel\\.vendors_sync$","task":"LINK-F5166-VENDORS-SYNC-PANEL"} */
/**
 * OWNER-EXECUTION-PLAN vertical vendor-column sweep (2026-08-14): VendorDetail.tsx's 20 tabs/
 * actions are all genuinely self-referential to THIS vendor (the page's own :id route param) —
 * each queryKey/mutation is keyed on `id`. vendors.panel.vendors_sync is the real QBO vendor sync
 * panel mounted from Vendors.tsx.
 *
 * Self-test: node scripts/verify-vendor-detail-page-self-referential.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/VendorDetail.tsx";
const SYNC_FILE = "apps/frontend/src/pages/vendors/VendorsSyncPanel.tsx";
const LABEL = "verify-vendor-detail-page-self-referential";

const CHECKS = [
  ["profile", /queryKey: \["vendor", id\]/],
  ["profile.edit", /return updateVendor\(id, \{/],
  // kind="driver" and id={vendor.driver_id} can land on the same line or wrap onto their own
  // JSX-prop lines (2026-08-20, CC-3: VendorDetail.tsx's reverse EntityLink reformatted multi-line).
  ["profile.driver_link", /kind="driver"\s+id=\{vendor\.driver_id\}/],
  ["profile.vendor_type_picker", /vendorTypesQuery = useCatalogQuery/],
  ["profile.default_expense_account", /defaultExpenseAccountId: string \| null/],
  ["profile.payment_terms", /paymentTermsId: string \| null/],
  ["profile.category_save", /patchVendorAccountingCategory\(id, \{/],
  ["inactivate", /updateVendor\(id, \{ deactivated_at: new Date\(\)\.toISOString\(\) \}\)/],
  ["reactivate", /updateVendor\(id, \{ deactivated_at: null \}\)/],
  ["safer_verify", /"fmcsa-safer-status", "vendor", id,/],
  ["ap.record_bill_payment", /recordVendorBillPayment\(id, \{/],
  ["ap.bills", /listVendorBills\(companyId, \{ vendor_id: id,/],
  ["ap.expenses", /listExpenses\(companyId, \{ vendor_uuid: id,/],
  ["ap.vendor_credits", /listVendorCredits\(companyId, \{ vendor_id: id \}\)/],
  ["ap.bill_payments", /listVendorBillPayments\(id, \{ operating_company_id: companyId/],
  ["documents", /<DocumentsTab entityType="vendor" entityId=\{vendor\.id\}/],
  ["audit_history", /<EntityAuditHistoryTab operatingCompanyId=\{companyId\} entityType="vendor" entityId=\{vendor\.id\}/],
  ["tasks", /<TasksTab operatingCompanyId=\{companyId\} targetType="vendor" targetId=\{vendor\.id\}/],
  ["w9_1099", /vendor\.eligible_1099 \? "Eligible \(Form 1099-NEC\)"/],
];

export function audit(src) {
  const failures = [];
  for (const [name, pattern] of CHECKS) {
    if (!pattern.test(src.detail)) failures.push(`${FILE}: ${name} tab is missing its self-referential vendor scoping`);
  }
  if (!/\/api\/v1\/qbo-sync\/vendors\/status/.test(src.sync) || !/\/api\/v1\/qbo-sync\/vendors\/(pull-now|reconcile-now)/.test(src.sync)) {
    failures.push(`${SYNC_FILE}: vendors sync panel must hit the real qbo-sync/vendors endpoints`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    detail: fs.readFileSync(path.join(root, FILE), "utf8"),
    sync: fs.readFileSync(path.join(root, SYNC_FILE), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [name, pattern] of CHECKS) {
    const mutated = { ...good, detail: good.detail.replace(new RegExp(pattern.source, `${pattern.flags}g`), "REMOVED") };
    if (mutated.detail === good.detail) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    const failures = audit(mutated);
    if (!failures.some((f) => f.includes(name))) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  const mutatedSync = { ...good, sync: good.sync.replace(/\/api\/v1\/qbo-sync\/vendors\/status/, "/api/v1/qbo-sync/vendors/unused") };
  if (!audit(mutatedSync).some((f) => f.includes("sync panel"))) {
    console.error(`${LABEL} SELFTEST FAIL — sync-endpoint: mutation escaped`);
    process.exit(1);
  }
  caught++;
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — VendorDetail's ${CHECKS.length} tabs/actions + the sync panel are real, self-referential vendor wiring`);
