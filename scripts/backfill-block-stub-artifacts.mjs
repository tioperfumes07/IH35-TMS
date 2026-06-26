#!/usr/bin/env node
// backfill-block-stub-artifacts.mjs — ROOT FIX for the false-PENDING class (block-10, DISP-OVERVIEW, the
// whole 17-module queue). The docs/blocks/*.txt stubs named NO real artifact paths, so the evidence
// classifier (reconcile-block-status.mjs, both pins removed in #1521) could not SEE the built feature and
// left the block PENDING/NEEDS-VERIFY. This appends a VERIFIED "ARTIFACTS ON MAIN" footer (only paths that
// actually exist on origin/main) to each stub so the classifier auto-promotes the truly-built ones to DONE.
//
// Idempotent (skips a stub that already has the footer). Verifies every path on origin/main BEFORE writing —
// never writes an absent path (that would make the block PARTIAL/NEEDS-VERIFY, not DONE). Read-the-result,
// then `npm run reconcile:blocks`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = new Set(execFileSync("git", ["ls-tree", "-r", "origin/main", "--name-only"], { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean));
const MARKER = "ARTIFACTS ON MAIN (evidence for reconcile classifier)";

// VERIFIED 2026-06-26 per-block real artifacts on main (STEP-0 evidence sweep of GUARD's 17-module queue).
const MAP = {
  "DISP-OVERVIEW-dispatch-overview": ["apps/frontend/src/pages/dispatch/DispatchOverview.tsx", "apps/backend/src/dispatch/arch-tabs.routes.ts"],
  "DISP-PROFIT-load-profitability": ["apps/frontend/src/pages/dispatch/TripProfitability.tsx", "apps/backend/src/dispatch/load-profitability.routes.ts"],
  "DISP-KANBAN-dispatch-kanban-board": ["apps/frontend/src/pages/dispatch/DispatchBoard.tsx", "apps/backend/src/dispatch/loads.routes.ts"],
  "SAFE-W3": ["apps/frontend/src/pages/home/roles/SafetyHome.tsx", "apps/backend/src/safety/dvir.routes.ts", "apps/backend/src/safety/foundation-kpis.routes.ts"],
  "SAFE-W4": ["apps/backend/src/safety/medical-cards.routes.ts", "apps/backend/src/safety/reminders.routes.ts", "apps/backend/src/telematics/hos-tracker.routes.ts"],
  "SAFE-W5": ["apps/frontend/src/pages/safety/DrugAlcoholDashboard.tsx", "apps/backend/src/safety/drug-program.routes.ts", "scripts/verify-drug-alcohol-program.mjs"],
  "MNT-SHOP": ["apps/backend/src/maintenance/parts.routes.ts", "apps/backend/src/maintenance/parts-inventory.routes.ts", "apps/backend/src/maintenance/severe-repair-estimate.routes.ts"],
  "RPT-MODULE": ["apps/frontend/src/pages/reports/ReportsHub.tsx", "apps/frontend/src/pages/safety/audit-425c/Audit425cPage.tsx", "apps/backend/src/reports/scheduled-reports.routes.ts"],
  "INS-MODULE": ["apps/frontend/src/pages/insurance/InsuranceLanding.tsx", "apps/backend/src/insurance/policy.routes.ts", "apps/backend/src/insurance/summary.routes.ts"],
  "MX-OPS": ["apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx", "apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx", "apps/backend/src/dispatch/dispatch-refinements.routes.ts"],
  "CAP-GPS": ["apps/frontend/src/pages/dispatch/MapView.tsx", "apps/backend/src/telematics/positions.routes.ts", "apps/backend/src/telematics/fleet-location-hos.routes.ts"],
  "CAP-AUTOSTATUS": ["apps/backend/src/driver/status-suggestions.routes.ts"],
  "CAP-ENGINEWO": ["apps/frontend/src/pages/maintenance/FaultRulesPage.tsx", "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx"],
  "CAP-FUELFRAUD": ["apps/frontend/src/pages/fuel/fraud-alerts/FraudAlertsList.tsx"],
  "CAP-CARGOTEMP": ["apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx", "scripts/verify-cap-14-cargo-sensors.mjs"],
  "CAP-PREDICTIVE": ["apps/frontend/src/pages/maintenance/TireProgramPage.tsx", "apps/backend/src/maintenance/tires.routes.ts"],
  "CAP-SCORING": ["apps/backend/src/safety/driver-scoring.routes.ts", "apps/frontend/src/pages/safety/CSAScore.tsx"],
  // Pre-existing -DONE stubs that self-claim completion but named no artifacts (caught by verify-block-stub-artifacts):
  "HOS-VIEWER-DONE": ["apps/frontend/src/pages/compliance/HosViewerSection.tsx", "apps/backend/src/telematics/hos-tracker.routes.ts", "scripts/verify-hos-viewer-picker.mjs"],
  "UX-A-table-alignment-DONE": ["apps/frontend/src/components/parity/ParityTable.tsx"],
};

let wrote = 0, skipped = 0, errors = [];
for (const [id, arts] of Object.entries(MAP)) {
  const stub = path.join(ROOT, "docs/blocks", `${id}.txt`);
  if (!fs.existsSync(stub)) { errors.push(`stub missing: docs/blocks/${id}.txt`); continue; }
  const absent = arts.filter((a) => !main.has(a));
  if (absent.length) { errors.push(`${id}: ABSENT on main -> ${absent.join(", ")}`); continue; } // never write an unverified path
  let body = fs.readFileSync(stub, "utf8");
  if (body.includes(MARKER)) { skipped++; continue; }
  const footer = `\n\n--- ${MARKER} ---\n` +
    `STEP-0 evidence sweep 2026-06-26: this block is BUILT on main. Real signature artifacts (verified present):\n` +
    arts.map((a) => `  - ${a}`).join("\n") + "\n";
  fs.writeFileSync(stub, body.replace(/\s*$/, "") + footer);
  wrote++;
  console.log(`wrote footer -> docs/blocks/${id}.txt (${arts.length} artifacts)`);
}
console.log(`\n[backfill] wrote=${wrote} skipped(existing)=${skipped} errors=${errors.length}`);
for (const e of errors) console.error("  ERR " + e);
process.exit(errors.length ? 1 : 0);
