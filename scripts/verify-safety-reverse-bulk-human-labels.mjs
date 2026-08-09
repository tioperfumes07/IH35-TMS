#!/usr/bin/env node
/** LST-F135 — Safety reverse sections / accident drawer / WO reverse / bulk / audit / damage human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx",
  "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx",
  "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx",
  "apps/frontend/src/components/safety/AccidentReportDrawer.tsx",
  "apps/frontend/src/components/dispatch/LoadWorkOrdersReverseSection.tsx",
  "apps/frontend/src/components/bulk/BulkProgressDialog.tsx",
  "apps/frontend/src/components/audit/AuditEventCard.tsx",
  "apps/frontend/src/pages/maintenance/components/MaintenanceDamageRegisterTab.tsx",
];
const LABEL = "verify-safety-reverse-bulk-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/\.slice\(0,\s*8\)/.test(src)) problems.push(`${file}: still UUID-slices`);
    if (!/entityLabel\(/.test(src)) problems.push(`${file}: missing entityLabel`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[4]] = planted[FILES[4]].replace(
    /entityLabel\(row\.display_id \|\| null,\s*row\.id,\s*"Work order"\)/,
    "row.display_id || `WO ${row.id.slice(0, 8)}`",
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
