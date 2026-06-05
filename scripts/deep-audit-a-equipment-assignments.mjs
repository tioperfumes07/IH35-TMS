#!/usr/bin/env node
/**
 * CLOSURE-14-DEEP-AUDIT-A — static guard for Driver Detail Equipment Assignments tab actions.
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

if (!source.includes('"Equipment Assignments"')) {
  failures.push('DriverDetail tabs must include "Equipment Assignments"');
}
if (!source.includes('activeTab === "Equipment Assignments"')) {
  failures.push("Equipment Assignments tab panel must be conditional on activeTab");
}
if (!source.includes("createDriverQualification")) {
  failures.push("Equipment Assignments must wire + Create Equipment Qualification");
}
if (!source.includes("deactivateDriverQualification")) {
  failures.push("Equipment Assignments must wire Deactivate qualification");
}
if (!source.includes("reactivateQualification")) {
  failures.push("Equipment Assignments must wire Reactivate qualification");
}
if (!source.includes("changeDriverQualificationRate")) {
  failures.push("Equipment Assignments must wire rate change (pencil) action");
}
if (!source.includes("setRateModalOpen(true)")) {
  failures.push("Equipment Assignments must open rate change modal");
}
if (!source.includes("setHistoryModalOpen(true)")) {
  failures.push("Equipment Assignments must open rate history modal");
}
if (!source.includes("showInactiveQualifications")) {
  failures.push("Equipment Assignments must retain Show inactive qualifications toggle");
}

if (!audit.includes("Equipment Assignments")) {
  failures.push("audit doc must document Equipment Assignments tab");
}

if (failures.length > 0) {
  console.error("deep-audit-a-equipment-assignments — FAILED");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("deep-audit-a-equipment-assignments — OK (qualification CRUD + rate actions retained)");
