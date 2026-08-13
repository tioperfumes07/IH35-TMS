#!/usr/bin/env node
/**
 * Safety reverse_link — leaf-specific Built for list/detail surfaces with EntityLink.
 * Create-only modals/pages honesty-dropped in required.json. Lists without EntityLink stay Gap (WIRE).
 *
 * @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leafRe":"^(training_records\\.list|hos\\.list|hos_violations\\.list|idvr\\.list|safety_events\\.list|internal_fines\\.list|damage_reports\\.list|trailer_interchanges\\.list|cargo_claims\\.list|driver_files\\.list|safety\\.drawer\\.(accident_report|fine_detail|company_violation_detail|integrity_alert_detail)|safety\\.parity\\.(accident_report|fine_detail|company_violation_detail|integrity_alert_detail)|safety\\.drawer\\.anomaly_detail|safety\\.parity\\.anomaly_detail)$","task":"VERTICAL-REVERSE-LINK-safety-lists","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-safety-reverse-link-list-surfaces.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-reverse-link-list-surfaces";

const CHECKS = [
  { name: "TrainingRecords EntityLink", file: "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx", pattern: /EntityLink/ },
  { name: "HoursOfService EntityLink", file: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx", pattern: /EntityLink/ },
  { name: "HOSViolationsTab EntityLink", file: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx", pattern: /EntityLink/ },
  { name: "Idvr EntityLink", file: "apps/frontend/src/pages/safety/IdvrPage.tsx", pattern: /EntityLink/ },
  { name: "SafetyEvents EntityLink", file: "apps/frontend/src/pages/safety/SafetyEventsPage.tsx", pattern: /EntityLink/ },
  { name: "InternalFines EntityLink", file: "apps/frontend/src/pages/safety/InternalFinesPage.tsx", pattern: /EntityLink/ },
  { name: "AccidentReportDrawer EntityLink", file: "apps/frontend/src/components/safety/AccidentReportDrawer.tsx", pattern: /EntityLink/ },
  { name: "FineDetailDrawer EntityLink", file: "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx", pattern: /EntityLink/ },
  { name: "AnomalyDetailDrawer EntityLink", file: "apps/frontend/src/pages/safety/tabs/AnomalyDetailDrawer.tsx", pattern: /EntityLink/ },
  { name: "SafetyIncidentsCluster EntityLink", file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", pattern: /EntityLink/ },
  { name: "DriverFiles TrainingTable EntityLink", file: "apps/frontend/src/pages/safety/components/TrainingTable.tsx", pattern: /EntityLink/ },
  { name: "CompanyViolationDetailDrawer EntityLink", file: "apps/frontend/src/pages/safety/components/CompanyViolationDetailDrawer.tsx", pattern: /EntityLink/ },
  { name: "IntegrityAlertDetailDrawer EntityLink", file: "apps/frontend/src/pages/safety/components/IntegrityAlertDetailDrawer.tsx", pattern: /EntityLink/ },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(fs.readFileSync(abs, "utf8"))) fails.push(`${c.name}: no EntityLink`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".safety-reverse-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

const fails = run();
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — safety reverse_link list surfaces ratcheted`);
