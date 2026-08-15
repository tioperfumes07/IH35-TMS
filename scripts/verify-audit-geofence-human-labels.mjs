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
const SERVICE = "apps/backend/src/integrations/samsara/geofences/reconciliation.service.ts";

function assertAll(srcs, service = fs.readFileSync(path.join(ROOT, SERVICE), "utf8")) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/actor_user_id\.slice\(0,\s*8\)/.test(src) || /subject_id\.slice\(0,\s*8\)/.test(src) || /unit_id\?\.slice\(0,\s*8\)/.test(src) || /id\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${file}: still UUID-slices`);
    }
    if (!/entityLabel\(/.test(src)) {
      problems.push(`${file}: missing entityLabel`);
    }
  }
  const report = srcs[FILES[3]];
  if (!/entityLabel\(f\.unit_number, f\.unit_id, "Unit"\)/.test(report)) problems.push(`${FILES[3]}: unit link must consume unit_number`);
  if (!/entityLabel\(f\.geofence_label, f\.geofence_id, "Geofence"\)/.test(report)) problems.push(`${FILES[3]}: geofence link must consume geofence_label`);
  if (!/g\.operating_company_id = f\.operating_company_id/.test(service) || !/u\.operating_company_id = f\.operating_company_id/.test(service)) {
    problems.push(`${SERVICE}: unit/geofence label joins must remain same-company scoped`);
  }
  if (!/g\.label AS geofence_label/.test(service) || !/u\.unit_number/.test(service)) {
    problems.push(`${SERVICE}: report projection must expose both human labels`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const service = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const mutations = [
    [{ ...srcs, [FILES[3]]: srcs[FILES[3]].replace("f.unit_number, f.unit_id", "null, f.unit_id") }, service],
    [{ ...srcs, [FILES[3]]: srcs[FILES[3]].replace("f.geofence_label, f.geofence_id", "null, f.geofence_id") }, service],
    [srcs, service.replace("g.operating_company_id = f.operating_company_id", "TRUE")],
    [srcs, service.replace("u.operating_company_id = f.operating_company_id", "TRUE")],
    [srcs, service.replace("g.label AS geofence_label", "NULL AS geofence_label")],
  ];
  if (mutations.some(([planted, changedService]) => !assertAll(planted, changedService).length)) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} label/scope mutations caught`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
