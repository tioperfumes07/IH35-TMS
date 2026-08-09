#!/usr/bin/env node
/** LST-F128 — AuditTrail/Events/LogViewer + Geofence unit: no UUID-slice chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/audit/AuditTrailPage.tsx",
  "apps/frontend/src/pages/audit/AuditEventsList.tsx",
  "apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx",
  "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx",
];
const LABEL = "verify-audit-geofence-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/actor_user_id\.slice\(0,\s*8\)/.test(src) || /subject_id\.slice\(0,\s*8\)/.test(src) || /unit_id\?\.slice\(0,\s*8\)/.test(src) || /id\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${file}: still UUID-slices`);
    }
    if (!/entityLabel\(/.test(src)) {
      problems.push(`${file}: missing entityLabel`);
    }
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[3]] = planted[FILES[3]].replace(
    /entityLabel\(null,\s*f\.unit_id,\s*"Unit"\)/,
    "f.unit_id?.slice(0, 8)",
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
