#!/usr/bin/env node
/**
 * WAVE-C-gl_je-system-qbo-recon — system module "GL / JE" column, VERTICAL-WIRING-LAW-2026-08-12.
 * Leaves: home, tab.overview, tab.qbo_recon, tab.qbo_sync, law.no_tms_qbo_writeback — all five
 * are tabs on the same page (SystemModulePage.tsx at /system), already real, never tagged
 * @matrix-built.
 *
 * SystemModulePage.tsx's own subtitle: "Daily tie-out of what the TMS posted against
 * QuickBooks (system-of-record)." qbo-reconcile-read.service.ts backs it with real counts from
 * accounting.qbo_remote_counts, qbo.reconciliation_alerts, and views.qbo_sync_health — comparing
 * what the TMS actually posted (the GL) against QuickBooks. This is aggregate tie-out reporting,
 * not a per-row journal_entry EntityLink, but the underlying comparison IS the GL-vs-QBO state,
 * not fabricated. The no-write-back law itself (QBO_JE_PUSH_ENABLED default OFF) is displayed on
 * the same page.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["system"],"cols":["gl_je"],"leafRe":"^(home|tab\\.overview|tab\\.qbo_recon|tab\\.qbo_sync|law\\.no_tms_qbo_writeback)$","task":"WAVE-C-gl_je-system-qbo-recon","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-system-qbo-recon.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-system-qbo-recon";

const CHECKS = [
  {
    name: "SystemModulePage.tsx wires the real getQboReconciliation API",
    file: "apps/frontend/src/pages/system/SystemModulePage.tsx",
    pattern: /getQboReconciliation/,
  },
  {
    name: "SystemModulePage.tsx renders the real TMS-vs-QuickBooks tie-out subtitle",
    file: "apps/frontend/src/pages/system/SystemModulePage.tsx",
    pattern: /Daily tie-out of what the TMS posted against QuickBooks/,
  },
  {
    name: "qbo-reconcile-read.service.ts sources real accounting.qbo_remote_counts",
    file: "apps/backend/src/integrations/qbo/qbo-reconcile-read.service.ts",
    pattern: /FROM accounting\.qbo_remote_counts/,
  },
  {
    name: "qbo-reconcile-read.service.ts sources real qbo.reconciliation_alerts",
    file: "apps/backend/src/integrations/qbo/qbo-reconcile-read.service.ts",
    pattern: /FROM qbo\.reconciliation_alerts/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/frontend/src/pages/system/SystemModulePage.tsx":
      'getQboReconciliation ... sub="Daily tie-out of what the TMS posted against QuickBooks (system-of-record). ..."',
    "apps/backend/src/integrations/qbo/qbo-reconcile-read.service.ts":
      "FROM accounting.qbo_remote_counts ... FROM qbo.reconciliation_alerts",
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — system home/overview/qbo_recon/qbo_sync/no_tms_qbo_writeback gl_je wiring present`);
