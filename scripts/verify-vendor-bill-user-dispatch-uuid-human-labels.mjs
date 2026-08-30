#!/usr/bin/env node
/** LST-F137 — VendorBill claim / UserDetail load / assignment / factoring autocomplete / parts / customs / fleet / overview human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  "apps/frontend/src/pages/UserDetail.tsx",
  "apps/frontend/src/components/driver-profile/CurrentAssignmentSection.tsx",
  "apps/frontend/src/components/factoring/DriverAutocomplete.tsx",
  "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx",
  "apps/frontend/src/components/dispatch/drawer-tabs/CustomsTab.tsx",
  "apps/frontend/src/components/fleet/EditVehicleModal.tsx",
  "apps/frontend/src/pages/dispatch/DispatchOverview.tsx",
];
const LABEL = "verify-vendor-bill-user-dispatch-uuid-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/\.slice\(0,\s*8\)/.test(src)) problems.push(`${file}: still UUID-slices`);
    if (!/entityLabel\(|<EntityLinkOrTombstone\b/.test(src)) problems.push(`${file}: missing canonical human-label resolver`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[0]] = planted[FILES[0]].replace(
    /entityLabel\(null,\s*linkedClaimId,\s*"Claim"\)/,
    "linkedClaimId.slice(0, 8)",
  );
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const assignmentPlanted = { ...srcs, [FILES[2]]: "const label = assignment.unit_id;" };
  if (!assertAll(assignmentPlanted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted assignment resolver removal not caught`);
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
