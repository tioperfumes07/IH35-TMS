#!/usr/bin/env node
/**
 * RPT-F3524 / LV-REPORTS-GEOFENCE-RECON-GROUPED-TABLES-MISSING-SURFACE-BAR
 * Geofence reconciliation must always mount one ParityTable (Search+Range+gear),
 * including the honest 0-row empty state — never a green-only bypass that skips the table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "GeofenceReconciliationReport: must use ParityTable");
  assert(src.includes('storageKey="geofence-recon"'), "GeofenceReconciliationReport: must use one always-mounted storageKey=geofence-recon");
  assert(!/Object\.entries\(\s*byClass\s*\)/.test(src), "GeofenceReconciliationReport: must not group into multiple ParityTables (missing surface bar on empty)");
  assert(!/bg-green-50[\s\S]*No anomalies found/.test(src), "GeofenceReconciliationReport: must not green-only bypass that skips ParityTable");
  assert(
    /emptyText=\{`No anomalies found for \$\{(appliedDate|formatDateUS\(appliedDate\))\}\.`\}/.test(src),
    "GeofenceReconciliationReport: honest emptyText on ParityTable",
  );
  assert(/exportFilename=\{`geofence-recon-\$\{appliedDate\}`\}/.test(src) || src.includes("geofence-recon-${appliedDate}"), "GeofenceReconciliationReport: exportFilename for surface Export");
  assert(
    src.includes("appliedDate") && /setAppliedDate\((date|next\.reportDate)\)/.test(src),
    "GeofenceReconciliationReport: keep Apply-staged date",
  );
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  // Plant old defect: green-only empty + grouped tables, no always-mounted table.
  const bad = good
    .replace(/storageKey="geofence-recon"/, 'storageKey={`geofence-recon-${cls}`}')
    .replace(
      /\{!isError && \(\s*<ParityTable[\s\S]*?\/>\s*\)\}/,
      `{!isLoading && !isError && findings.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-sm p-4 text-green-700">
          No anomalies found for {appliedDate}.
        </div>
      )}
      {Object.entries(byClass).map(([cls, items]) => (
        <ParityTable key={cls} rows={items} columns={findingColumns} rowKey={(f) => f.uuid} storageKey={\`geofence-recon-\${cls}\`} />
      ))}`,
    );
  assert(bad.includes("bg-green-50"), "selftest fixture must include green bypass");
  assert(bad.includes("Object.entries(byClass)"), "selftest fixture must include grouped tables");
  fs.writeFileSync(filePath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on green-only/grouped bypass");
  console.log("verify-geofence-recon-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-geofence-recon-surface-bar PASS");
}
