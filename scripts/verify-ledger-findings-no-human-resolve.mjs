#!/usr/bin/env node
// LAUNCH-SAFE-LEDGER-MONITOR-DETECTORS -- guard
//
// CURSOR-VERIFY-MASTER-LAUNCH-PLAN-2026-08-28.md: "Ledger Health no human close" / "a guard that
// forbids human resolve on integration='ledger'". _system.reconciliation_findings rows with
// integration='ledger' must ONLY ever be resolved by the ledger-integrity detector's own rescan
// (apps/backend/src/reconciliation/ledger-integrity-detectors.service.ts), which always leaves
// resolved_by_user_id NULL. This guard fails if:
//   (A) the detector's own auto-resolve path stops leaving resolved_by_user_id NULL, or
//   (B) any backend route sets resolved_by_user_id to a bound value on
//       _system.reconciliation_findings without excluding integration='ledger' -- i.e. a future
//       human-resolve endpoint that would silently apply to ledger findings too.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const DETECTOR_FILE = "apps/backend/src/reconciliation/ledger-integrity-detectors.service.ts";
const ROUTES_ROOT = "apps/backend/src";

function walkRouteFiles(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRouteFiles(rel, out);
      continue;
    }
    if (!entry.name.endsWith(".routes.ts")) continue;
    out.push(rel);
  }
  return out;
}

export function check(detectorText, routeFiles) {
  const failures = [];

  if (!/resolved_by_user_id\s*=\s*NULL/.test(detectorText)) {
    failures.push(
      `${DETECTOR_FILE}: autoResolveLedgerFinding no longer leaves resolved_by_user_id NULL -- ledger findings would be attributable to a human, breaking "no human close"`
    );
  }
  if (!/status\s*=\s*'resolved'/.test(detectorText)) {
    failures.push(`${DETECTOR_FILE}: no auto-resolve path found (missing status = 'resolved' write)`);
  }

  for (const { rel, text } of routeFiles) {
    if (!text.includes("_system.reconciliation_findings")) continue;
    // A route that binds resolved_by_user_id to a placeholder ($N or a variable, not NULL/literal)
    // on this table must explicitly exclude integration='ledger', or it is a human-resolve path
    // that would silently apply to ledger findings too.
    const setsHumanResolver = /resolved_by_user_id\s*=\s*\$\d+/.test(text) || /resolved_by_user_id\s*=\s*[a-zA-Z_]/.test(text);
    if (!setsHumanResolver) continue;
    const excludesLedger = /integration\s*(<>|!=)\s*'ledger'/.test(text) || /integration\s*=\s*'(qbo|samsara|plaid|fmcsa)'/.test(text);
    if (!excludesLedger) {
      failures.push(
        `${rel}: sets resolved_by_user_id on _system.reconciliation_findings without excluding integration='ledger' -- this is a human-resolve path for ledger findings, forbidden`
      );
    }
  }

  return failures;
}

function loadRouteFiles() {
  return walkRouteFiles(ROUTES_ROOT).map((rel) => ({ rel, text: fs.readFileSync(path.join(root, rel), "utf8") }));
}

function run() {
  const detectorText = fs.readFileSync(path.join(root, DETECTOR_FILE), "utf8");
  const failures = check(detectorText, loadRouteFiles());
  if (failures.length > 0) {
    console.error("FAIL: ledger-findings-no-human-resolve");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: no route can human-resolve an integration='ledger' reconciliation finding; detector self-close leaves resolved_by_user_id NULL");
}

function selftest() {
  const detectorText = fs.readFileSync(path.join(root, DETECTOR_FILE), "utf8");

  // Offender A: detector stops leaving resolved_by_user_id NULL.
  const offenderA = detectorText.replace("resolved_by_user_id = NULL,", "resolved_by_user_id = $2,");
  if (offenderA === detectorText) {
    console.error("FAIL(selftest): offender A mutation did not change the source");
    process.exit(1);
  }
  const failuresA = check(offenderA, loadRouteFiles());
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): offender A (resolved_by_user_id no longer NULL) was NOT caught");
    process.exit(1);
  }

  // Offender B: a hypothetical route resolves _system.reconciliation_findings for a human without
  // excluding integration='ledger'.
  const offenderRoute = {
    rel: "apps/backend/src/__selftest__/fake.routes.ts",
    text: `
      await client.query(
        \`UPDATE _system.reconciliation_findings SET resolved_by_user_id = $2, status = 'resolved' WHERE id = $1\`,
        [id, user.uuid]
      );
    `,
  };
  const failuresB = check(detectorText, [...loadRouteFiles(), offenderRoute]);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): offender B (route resolves ledger findings for a human) was NOT caught");
    process.exit(1);
  }

  const baselineFailures = check(detectorText, loadRouteFiles());
  if (baselineFailures.length > 0) {
    console.error("FAIL(selftest): baseline (unmodified) source unexpectedly fails check()");
    for (const f of baselineFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS(selftest): both planted offenders correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
