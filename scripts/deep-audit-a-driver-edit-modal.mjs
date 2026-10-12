#!/usr/bin/env node
/**
 * CLOSURE-14-DEEP-AUDIT-A — static guard for Driver Detail Edit flow (Profile tab).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const driverDetailPath = path.join(repoRoot, "apps/frontend/src/pages/DriverDetail.tsx");
const auditPath = path.join(repoRoot, "docs/audits/DEEP-AUDIT-A-DRIVER-DETAIL.md");

const source = fs.readFileSync(driverDetailPath, "utf8");
const audit = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, "utf8") : "";
const failures = [];

if (!source.includes('setEditMode(true)')) {
  failures.push("DriverDetail must expose green Edit button → setEditMode(true)");
}
if (!source.includes("updateDriver(id")) {
  failures.push("DriverDetail Save must call updateDriver");
}
if (!source.includes("setEditMode(false)")) {
  failures.push("DriverDetail must exit editMode after successful save");
}

const requiredFields = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "cdl_number",
  "cdl_expires_at",
  "hire_date",
  "dot_medical_expires_at",
  "hazmat_endorsement_expires_at",
];
for (const field of requiredFields) {
  if (!source.includes(`"${field}"`)) {
    failures.push(`DriverDetail edit form missing field: ${field}`);
  }
}

if (!source.includes("saveDriverQboMutation")) {
  failures.push("DriverDetail must retain the separate vendor & class save mutation");
}
// 443.137 9e (CC-2), guard change — OLD: DriverDetail had to retain the QboCombobox QBO-vendor picker.
// NEW: it must NOT — the driver's vendor is the native A/P payee, an EntityPicker kind="vendor" over
// mdata.vendors, saved on mdata.vendors.driver_id. WHY: QBO is a read-only archive ("USMCA is
// entirely our TMS ERP"); the QBO picker wrote a QuickBooks id onto the native driver row.
// 443.137 9e part 2: the QBO Mapping tab is read-only — the QBO vendor-link routes answer 409
// QBO_NATIVE_WRITE_REFUSED (#26732), so no "Edit Linkage" / VendorLinkageModal may come back.
if (/VendorLinkageModal|setQboModalOpen/.test(source)) {
  failures.push("DriverDetail QBO Mapping tab must stay read-only (no VendorLinkageModal / Edit Linkage)");
}
if (/QboCombobox/.test(source)) {
  failures.push("DriverDetail Profile must not use the QBO-mirror QboCombobox (QBO is a read-only archive)");
}
if (!/<EntityPicker\s+kind="vendor"[\s\S]{0,200}value=\{apVendorPickId\}/.test(source) || !/updateVendor\(apVendorPickId, \{ driver_id: id \}\)/.test(source)) {
  failures.push("DriverDetail Profile vendor must be the native A/P payee EntityPicker saved on mdata.vendors.driver_id");
}

for (const section of ["Edit Modal", "QBO", "CRITICAL", "HIGH"]) {
  if (!audit.includes(section)) {
    failures.push(`audit doc missing required section: ${section}`);
  }
}

if (failures.length > 0) {
  console.error("deep-audit-a-driver-edit-modal — FAILED");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("deep-audit-a-driver-edit-modal — OK (Edit/Save/updateDriver + QBO split retained)");
