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
  failures.push("DriverDetail must retain separate Save QBO fields mutation");
}
if (!source.includes("QboCombobox")) {
  failures.push("DriverDetail Profile must retain QBO vendor combobox in edit context");
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
