#!/usr/bin/env node
/**
 * WAVE-B safety connectivity remainder C — dashboard/compliance tabs (mounted + data path).
 *
 * @matrix-built {"modules":["safety"],"cols":["connectivity"],"leafRe":"^(eld_audit\\.list$|driver_scoring\\.list$|csa_score\\.list$|dot_compliance\\.list$|cert_expiry\\.list$|geofence_alerts\\.list$|insurance_tab\\.list$|integrity_reports\\.list$|audit_425c\\.list$|safety_reports\\.list$|settings\\.list$)","task":"WAVE-B-safety-connectivity-remainder-c","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-b-safety-connectivity-remainder-c.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-b-safety-connectivity-remainder-c";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

const CHECKS = [
  { name: "ELD audit trail route", file: MANIFEST, pattern: /path="eld\/audit-trail"\s+element=\{<EldAuditTrailViewer/ },
  { name: "Driver scoring route", file: MANIFEST, pattern: /path="driver-scoring"\s+element=\{<DriverScoringTab/ },
  { name: "CSA score route", file: MANIFEST, pattern: /path="csa-score"\s+element=\{<CSAScoreTab/ },
  { name: "DOT compliance route", file: MANIFEST, pattern: /path="dot-compliance"\s+element=\{<DOTComplianceTab/ },
  { name: "Cert expiry route", file: MANIFEST, pattern: /path="cert-expiry"\s+element=\{<ExpiryDashboard/ },
  { name: "Geofence alerts route", file: MANIFEST, pattern: /path="geofence-alerts"\s+element=\{<GeofenceBreachesTab/ },
  { name: "Insurance tab route", file: MANIFEST, pattern: /path="insurance"\s+element=\{<InsuranceTab/ },
  { name: "Integrity reports route", file: MANIFEST, pattern: /path="integrity-reports"\s+element=\{<IntegrityReportsTab/ },
  { name: "425C audit route", file: MANIFEST, pattern: /path="audit-425c"\s+element=\{<Audit425cPage/ },
  { name: "Safety reports route", file: MANIFEST, pattern: /path="reports"\s+element=\{<SafetyReportsPage/ },
  { name: "Safety settings route", file: MANIFEST, pattern: /path="settings"\s+element=\{<SettingsTab/ },
  {
    name: "CSA FMCSA trend page data path",
    file: "apps/frontend/src/pages/safety/CSAScore.tsx",
    pattern: /useQuery|apiRequest/,
  },
  {
    name: "Cert expiry dashboard API",
    file: "apps/frontend/src/pages/safety/expiry-tracking/ExpiryDashboard.tsx",
    pattern: /\/api\/safety\/cert-expiry/,
  },
];

function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src == null) {
      failures.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(src)) failures.push(`${c.name}: shape missing in ${c.file}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const fail = checkAll(() => "POISON");
  if (!fail.length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (poison trips ${fail.length})`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
});
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — safety dashboard/compliance connectivity routes + data paths ratcheted`);
