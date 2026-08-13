#!/usr/bin/env node
/**
 * Reports reverse_link — Built for EntityLink report pages.
 *
 * @matrix-built {"modules":["reports"],"cols":["reverse_link"],"leafRe":"^(report\\.dispatch_margin|report\\.fuel_reconciliation|report\\.geofence_dwell|report\\.geofence_reconciliation|report\\.management|report\\.per_truck_cpm|report\\.profit_per_truck)$","task":"VERTICAL-REVERSE-LINK-reports-batch","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-reports-reverse-link-batch.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reports-reverse-link-batch";

const CHECKS = [
  { name: "DispatchMarginPage", file: "apps/frontend/src/pages/reports/DispatchMarginPage.tsx" },
  { name: "FuelReconciliationPage", file: "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx" },
  { name: "GeofenceDwellReport", file: "apps/frontend/src/pages/reports/GeofenceDwellReport.tsx" },
  { name: "GeofenceReconciliationReport", file: "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx" },
  { name: "ManagementReportPackagePage", file: "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx" },
  { name: "PerTruckCpmReport", file: "apps/frontend/src/pages/reports/PerTruckCpmReport.tsx" },
  { name: "ProfitPerTruckPage", file: "apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx" },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) { fails.push(`${c.name}: missing`); continue; }
    if (!/EntityLink/.test(fs.readFileSync(abs, "utf8"))) fails.push(`${c.name}: no EntityLink`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".reports-reverse-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) { console.error(`${LABEL} SELFTEST FAIL`); process.exit(1); }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) { console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`); process.exit(1); }
  process.exit(0);
}

const fails = run();
if (fails.length) { console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — reports reverse_link batch ratcheted`);
