#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["vendor"],"leafRe":"^(wo\\.console\\.list|wo\\.create|wo\\.source\\.(is|es|ac|et|rt|it|rs))$","task":"LINK-F5166-MAINTENANCE-WO-LIST-VENDOR"} */
/** @matrix-built {"modules":["maintenance"],"cols":["vendor"],"leafRe":"^(wo\\.create_bill|maintenance\\.modal\\.create_bill|wo\\.create_expense|maintenance\\.modal\\.create_expense)$","task":"LINK-F5166-MAINTENANCE-BILL-EXPENSE-VENDOR"} */
/** @matrix-built {"modules":["maintenance"],"cols":["vendor"],"leafRe":"^(road_service\\.active|maintenance\\.modal\\.road_service_ticket)$","task":"LINK-F5166-MAINTENANCE-ROAD-SERVICE-VENDOR"} */
/** @matrix-built {"modules":["maintenance"],"cols":["vendor"],"leafRe":"^(parts_inventory\\.record_purchase|maintenance\\.modal\\.add_parts_link)$","task":"LINK-F5166-MAINTENANCE-PARTS-VENDOR"} */
/** @matrix-built {"modules":["maintenance"],"cols":["vendor"],"leafRe":"^vendors\\.create$","task":"LINK-F5166-MAINTENANCE-VENDORS-HUB"} */
/** @matrix-built {"modules":["maintenance"],"cols":["vendor"],"leafRe":"^warranty\\.create_claim$","task":"LINK-F5166-MAINTENANCE-WARRANTY-VENDOR"} */
/** @matrix-built {"modules":["maintenance"],"cols":["vendor"],"leafRe":"^(maintenance\\.modal\\.work_order_detail|maintenance\\.modal\\.create_work_order)$","task":"LINK-F5166-MAINTENANCE-WO-MODAL-VENDOR"} */
/**
 * OWNER-EXECUTION-PLAN vertical vendor-column sweep (2026-08-14): 21 genuine maintenance leaves,
 * each confirmed live — real vendor_id/external_vendor_id/EntityLink kind="vendor" or a real
 * ReferenceSelect(createKind="vendor")/vendor picker, sourced from mdata.vendors.
 *
 * Self-test: node scripts/verify-maintenance-vendor-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  woTable: "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
  createWo: "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx",
  vendorBillForm: "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  recordExpenseForm: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
  roadServiceList: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx",
  roadServiceTicket: "apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx",
  partsInventory: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx",
  addPartsLink: "apps/frontend/src/components/maintenance/AddPartsLinkModal.tsx",
  vendorsHub: "apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx",
  warranty: "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx",
  woDetailModal: "apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx",
};
const LABEL = "verify-maintenance-vendor-wiring";

export function audit(src) {
  const failures = [];
  if (!/resolved_vendor_id(?!_)/.test(src.woTable) || !/kind="vendor"/.test(src.woTable)) {
    failures.push(`${FILES.woTable}: WO list/source tabs must render a real resolved_vendor_id EntityLink`);
  }
  if ((!/kind=["']vendor["']/.test(src.createWo) || !/allowCreate/.test(src.createWo)) || !/Vendor required for non in-house location/.test(src.createWo)) {
    failures.push(`${FILES.createWo}: WO create must require a real vendor EntityPicker for non in-house repairs`);
  }
  if (!/createKind="vendor"/.test(src.vendorBillForm)) {
    failures.push(`${FILES.vendorBillForm}: WO bill create must have a real vendor picker`);
  }
  if (!/createKind="vendor"/.test(src.recordExpenseForm) || !/vendorUuid/.test(src.recordExpenseForm)) {
    failures.push(`${FILES.recordExpenseForm}: WO expense create must have a real vendor picker`);
  }
  if (!/kind="vendor" id=\{row\.vendor_id\}/.test(src.roadServiceList)) {
    failures.push(`${FILES.roadServiceList}: road service list must render a real vendor EntityLink`);
  }
  if (!/vendor_id: vendorId/.test(src.roadServiceTicket)) {
    failures.push(`${FILES.roadServiceTicket}: road service ticket must submit a real vendor_id`);
  }
  if (!/kind="vendor" id=\{row\.vendor_id\}/.test(src.partsInventory) || !/EntityPicker[\s\S]*?kind=["']vendor["']/.test(src.partsInventory)) {
    failures.push(`${FILES.partsInventory}: parts record purchase must have a real vendor EntityLink and EntityPicker`);
  }
  if (!/Boolean\(vendorId\)/.test(src.addPartsLink) || !/EntityPicker[\s\S]*?kind=["']vendor["']/.test(src.addPartsLink)) {
    failures.push(`${FILES.addPartsLink}: add-parts-link must require a real vendor EntityPicker`);
  }
  if (!/mdata_vendor_id: string \| null/.test(src.vendorsHub)) {
    failures.push(`${FILES.vendorsHub}: maintenance vendors hub create must persist a real mdata_vendor_id link`);
  }
  if (!/EntityPicker[\s\S]*?kind=["']vendor["']/.test(src.warranty) || !/allowCreate/.test(src.warranty)) {
    failures.push(`${FILES.warranty}: warranty claim create must have a real vendor EntityPicker`);
  }
  const resolvedVendorLink = /kind="vendor"[\s\S]{0,100}id=\{asEntityId\(workOrder\.resolved_vendor_id\)\}[\s\S]{0,100}name=\{workOrder\.resolved_vendor_name\}/.test(src.woDetailModal);
  const partsVendorLink = /kind="vendor"[\s\S]{0,100}id=\{link\.vendor_id\}[\s\S]{0,100}name=\{link\.vendor_name\}/.test(src.woDetailModal);
  if (!resolvedVendorLink || !partsVendorLink) {
    failures.push(`${FILES.woDetailModal}: WO detail modal must render real vendor EntityLinks for the external vendor and linked parts`);
  }
  return failures;
}

function loadSrc(root) {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["wo-table-link", "woTable", /resolved_vendor_id/g, "resolved_vendor_id_unused"],
    ["create-wo-required", "createWo", /Vendor required for non in-house location/, "Vendor optional"],
    ["create-wo-picker", "createWo", /kind="vendor"/g, 'kind="unit"'],
    ["bill-form-picker", "vendorBillForm", /createKind="vendor"/g, 'createKind="unit"'],
    ["expense-form-picker", "recordExpenseForm", /createKind="vendor"/g, 'createKind="unit"'],
    ["road-service-list-link", "roadServiceList", /kind="vendor" id=\{row\.vendor_id\}/, 'kind="unit" id={row.unit_id}'],
    ["road-service-ticket-submit", "roadServiceTicket", /vendor_id: vendorId/, "vendor_id: undefined"],
    ["parts-inventory-link", "partsInventory", /kind="vendor" id=\{row\.vendor_id\}/, 'kind="unit" id={row.unit_id}'],
    ["add-parts-required", "addPartsLink", /Boolean\(vendorId\)/, "true"],
    ["vendors-hub-field", "vendorsHub", /mdata_vendor_id: string \| null/, "mdata_vendor_id_unused: string | null"],
    ["warranty-picker", "warranty", /kind="vendor"/g, 'kind="unit"'],
    ["wo-detail-resolved-id", "woDetailModal", /asEntityId\(workOrder\.resolved_vendor_id\)/, "undefined"],
    ["wo-detail-resolved-name", "woDetailModal", /name=\{workOrder\.resolved_vendor_name\}/, "name={null}"],
    ["wo-detail-parts-name", "woDetailModal", /name=\{link\.vendor_name\}/, "name={null}"],
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
console.log(`${LABEL} PASS — maintenance's vendor-scoped WO/bill/expense/road-service/parts/warranty leaves are real`);
