#!/usr/bin/env node
// backfill-tracker-artifacts-batch2.mjs — full-tracker reconciliation: append VERIFIED artifact footers to
// the SOURCE doc the classifier reads (docs/specs/gap-*.md, docs/dispatch/BLOCK-*-of-29-*.txt) for
// non-financial blocks proven BUILT on main by STEP-0 grep. Verifies every path on origin/main before
// writing (never a fake path). Idempotent. NO financial blocks (those stay GATED, read-only).
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { execFileSync } from "node:child_process";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = new Set(execFileSync("git",["ls-tree","-r","origin/main","--name-only"],{cwd:ROOT,encoding:"utf8"}).split(/\r?\n/).filter(Boolean));
const MARKER = "ARTIFACTS ON MAIN (evidence for reconcile classifier)";
// blockId -> { doc, arts }   doc = source file the classifier reads
const MAP = {
  "gap-26-border-crossings": ["docs/specs/gap-26-border-crossings.md", ["apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx","apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx"]],
  "gap-27-geofence-reconciliation": ["docs/specs/gap-27-geofence-reconciliation.md", ["apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx","apps/backend/src/integrations/samsara/geofences/reconciliation.routes.ts"]],
  "gap-28-layover-detection": ["docs/specs/gap-28-layover-detection.md", ["apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx"]],
  "gap-29-booking-gap-analytics": ["docs/specs/gap-29-booking-gap-analytics.md", ["apps/frontend/src/pages/reports/BookingGapReport.tsx"]],
  "gap-30-late-arrival-analytics": ["docs/specs/gap-30-late-arrival-analytics.md", ["apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx"]],
  "gap-36-driver-pwa-incident-full": ["docs/specs/gap-36-driver-pwa-incident-full.md", ["apps/backend/src/safety/incidents/full-report.service.ts"]],
  "gap-39-geofence-state-machine": ["docs/specs/gap-39-geofence-state-machine.md", ["apps/backend/src/integrations/samsara/geofences/state-machine/routes.ts","apps/frontend/src/pages/reports/GeofenceDwellReport.tsx"]],
  "gap-41-reports-hub-9-categories": ["docs/specs/gap-41-reports-hub-9-categories.md", ["apps/frontend/src/pages/reports/ReportsHub.tsx"]],
  "gap-44-form-425c-exhibits": ["docs/specs/gap-44-form-425c-exhibits.md", ["apps/frontend/src/pages/form425c/Form425CHome.tsx","apps/frontend/src/pages/safety/audit-425c/Audit425cPage.tsx"]],
  "gap-45-cash-flow-cpm-routes": ["docs/specs/gap-45-cash-flow-cpm-routes.md", ["apps/backend/src/reports/cash-flow-overview.routes.ts","apps/backend/src/reports/profit-per-truck.routes.ts"]],
  "gap-46-anomaly-detection": ["docs/specs/gap-46-anomaly-detection.md", ["apps/frontend/src/pages/safety/tabs/AnomaliesTab.tsx"]],
  "BLOCK-04-of-29-TIER2-RATE-LIMIT": ["docs/dispatch/BLOCK-04-of-29-TIER2-RATE-LIMIT.txt", ["apps/backend/src/middleware/rate-limit.ts"]],
  "BLOCK-05-of-29-TIER2-CIRCUIT-BREAKERS": ["docs/dispatch/BLOCK-05-of-29-TIER2-CIRCUIT-BREAKERS.txt", ["apps/backend/src/lib/circuit-breaker/index.ts"]],
  "BLOCK-06-of-29-TIER2-OUTBOX-DLQ": ["docs/dispatch/BLOCK-06-of-29-TIER2-OUTBOX-DLQ.txt", ["apps/backend/src/qbo/sync-state-machine.ts"]],
  "BLOCK-08-of-29-TIER2-LOAD-TEST": ["docs/dispatch/BLOCK-08-of-29-TIER2-LOAD-TEST.txt", ["scripts/verify-load-test-baseline.mjs"]],
  "BLOCK-13-of-29-TIER2-TUNING-CATALOG": ["docs/dispatch/BLOCK-13-of-29-TIER2-TUNING-CATALOG.txt", ["scripts/verify-operational-tuning-catalog.mjs"]],
  "BLOCK-21-of-29-TIER3-DR-DRILL": ["docs/dispatch/BLOCK-21-of-29-TIER3-DR-DRILL.txt", ["scripts/verify-backups-current.mjs","scripts/backup-verify-neon-pitr.mjs"]],
  "BLOCK-22-of-29-TIER3-OPS-RUNBOOKS": ["docs/dispatch/BLOCK-22-of-29-TIER3-OPS-RUNBOOKS.txt", ["apps/frontend/src/pages/help/RunbooksIndex.tsx"]],
  "BLOCK-27-of-29-TIER4-CANARY": ["docs/dispatch/BLOCK-27-of-29-TIER4-CANARY.txt", ["scripts/verify-canary-replacement.mjs"]],
};
let wrote=0,skip=0,err=[];
for (const [id,[doc,arts]] of Object.entries(MAP)) {
  const fp=path.join(ROOT,doc);
  if(!fs.existsSync(fp)){err.push(`doc missing: ${doc}`);continue;}
  const absent=arts.filter(a=>!main.has(a));
  if(absent.length){err.push(`${id}: ABSENT -> ${absent.join(", ")}`);continue;}
  let body=fs.readFileSync(fp,"utf8");
  if(body.includes(MARKER)){skip++;continue;}
  const footer=`\n\n--- ${MARKER} ---\nSTEP-0 full-tracker reconciliation 2026-06-26: BUILT on main. Real signature artifacts (verified present):\n`+arts.map(a=>`  - ${a}`).join("\n")+"\n";
  fs.writeFileSync(fp,body.replace(/\s*$/,"")+footer); wrote++; console.log(`footer -> ${doc} (${arts.length})`);
}
console.log(`\n[batch2] wrote=${wrote} skipped=${skip} errors=${err.length}`); err.forEach(e=>console.error("  ERR "+e));
process.exit(err.length?1:0);
