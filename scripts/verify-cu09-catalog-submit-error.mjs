#!/usr/bin/env node
/** LST-F140 / CU-09 — Lists catalog modals use userFacingApiError (never data.error ?? data.message). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cu09-catalog-submit-error";
const SELFTEST = process.argv.includes("--selftest");

const FILES = [
  "apps/frontend/src/pages/lists/driver/DriverCatalogModal.tsx",
  "apps/frontend/src/pages/lists/accounting/PostingTemplateModal.tsx",
  "apps/frontend/src/pages/lists/accounting/AccountingCatalogModal.tsx",
  "apps/frontend/src/pages/lists/safety/DotViolationTypeModal.tsx",
  "apps/frontend/src/pages/lists/safety/CompanyViolationTypeModal.tsx",
  "apps/frontend/src/pages/lists/safety/ComplaintTypeModal.tsx",
  "apps/frontend/src/pages/lists/fuel/FuelCatalogModal.tsx",
  "apps/frontend/src/pages/lists/safety/CivilFineTypeModal.tsx",
  "apps/frontend/src/pages/lists/safety/CargoClaimReasonModal.tsx",
  "apps/frontend/src/pages/lists/safety/InternalFineReasonModal.tsx",
  // F139 cohort — keep drained
  "apps/frontend/src/pages/lists/fleet/FleetCatalogModal.tsx",
  "apps/frontend/src/pages/lists/maintenance/MaintenanceCatalogModal.tsx",
  "apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx",
];

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/data\.error\s*\?\?\s*data\.message/.test(src)) {
      problems.push(`${file}: still prefers data.error over message`);
    }
    if (!/userFacingApiError\(/.test(src)) problems.push(`${file}: missing userFacingApiError`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[0]] = planted[FILES[0]].replace(
    /userFacingApiError\(error,\s*"Save failed"\)/,
    "String(data.error ?? data.message ?? error.message)",
  );
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
