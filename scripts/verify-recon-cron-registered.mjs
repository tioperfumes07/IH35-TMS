#!/usr/bin/env node
/**
 * verify-recon-cron-registered.mjs
 * CI guard: the twice-daily QBO reconciler (and the daily audit hash-chain verifier) must stay WIRED into
 * the backend's IN-PROCESS scheduler so they run without depending on a Render cron service.
 *
 * Regression it prevents: runReconTick / runAuditChainVerifyTick were built and had standalone Render cron
 * entrypoints (run-recon.ts / run-audit-chain-verify.ts), but nothing scheduled them inside the running
 * backend the way ~50 other jobs are scheduled. If the Render cron services are not provisioned, the
 * reconciler silently never runs. This guard fails if the in-process wiring is ever severed.
 *
 * FAILS IF ANY OF:
 *   1. apps/backend/src/cron/recon.cron.ts does not export initializeReconCron.
 *   2. recon.cron.ts does not schedule BOTH passes via reconJobName + runReconTick("am"/"pm"),
 *      wrapped in wrapBackgroundJobTick (records _system.background_jobs → /healthz staleness).
 *   3. The reconJobName job-name constants are missing from recon-cron.service.ts.
 *   4. index.ts does not IMPORT and CALL initializeReconCron (bootstrap registration).
 *   5. The audit-chain-verify in-process cron (initializeAuditChainVerifyCron) is not exported and not
 *      imported+called in index.ts.
 *
 * Self-test (pure logic, no filesystem): node scripts/verify-recon-cron-registered.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The canonical _system.background_jobs job names returned by reconJobName(pass). Kept in sync with
// apps/backend/src/accounting/recon/recon-cron.service.ts.
const RECON_JOB_AM = "accounting.recon_am_bank_count";
const RECON_JOB_PM = "accounting.recon_pm_categorization_diff";

/** Pure evaluation of the wiring, given the relevant file contents. Shared by the real run and --selftest. */
export function computeReconCronFailures(files) {
  const reconCron = files.reconCron ?? "";
  const reconService = files.reconService ?? "";
  const auditCron = files.auditCron ?? "";
  const index = files.index ?? "";
  const errors = [];

  // 1 — recon.cron.ts exports initializeReconCron
  if (!/export\s+function\s+initializeReconCron\b/.test(reconCron)) {
    errors.push("apps/backend/src/cron/recon.cron.ts must export initializeReconCron");
  }
  // 2 — both passes scheduled via the shared helpers, wrapped for the job ledger
  if (!reconCron.includes("reconJobName") || !reconCron.includes("runReconTick")) {
    errors.push("recon.cron.ts must schedule the recon tick via reconJobName + runReconTick");
  }
  if (!reconCron.includes('runReconTick("am")') || !reconCron.includes('runReconTick("pm")')) {
    errors.push('recon.cron.ts must schedule BOTH passes: runReconTick("am") and runReconTick("pm")');
  }
  if (!reconCron.includes("wrapBackgroundJobTick")) {
    errors.push("recon.cron.ts must wrap each tick in wrapBackgroundJobTick (records _system.background_jobs)");
  }
  // 3 — job-name constants present in the service
  if (!reconService.includes(RECON_JOB_AM) || !reconService.includes(RECON_JOB_PM)) {
    errors.push(
      `recon-cron.service.ts is missing the reconJobName constants ("${RECON_JOB_AM}" / "${RECON_JOB_PM}")`,
    );
  }
  // 4 — index.ts imports AND calls initializeReconCron
  const reconImported = /import\s*\{[^}]*\binitializeReconCron\b[^}]*\}\s*from\s*["'][^"']*recon\.cron/.test(index);
  const reconCalled = /initializeReconCron\s*\(\s*app\s*\)/.test(index);
  if (!reconImported) errors.push("index.ts must import initializeReconCron from ./cron/recon.cron.js");
  if (!reconCalled) errors.push("index.ts must call initializeReconCron(app) in the bootstrap");
  // 5 — audit-chain-verify in-process cron exported + wired
  if (auditCron && !/export\s+function\s+initializeAuditChainVerifyCron\b/.test(auditCron)) {
    errors.push("apps/backend/src/cron/audit-chain-verify.cron.ts must export initializeAuditChainVerifyCron");
  }
  const auditImported = /import\s*\{[^}]*\binitializeAuditChainVerifyCron\b[^}]*\}\s*from/.test(index);
  const auditCalled = /initializeAuditChainVerifyCron\s*\(\s*app\s*\)/.test(index);
  if (!auditImported) errors.push("index.ts must import initializeAuditChainVerifyCron from ./cron/audit-chain-verify.cron.js");
  if (!auditCalled) errors.push("index.ts must call initializeAuditChainVerifyCron(app) in the bootstrap");

  return errors;
}

function readIf(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

if (process.argv.includes("--selftest")) {
  const goodReconCron =
    'export function initializeReconCron(app){ wrapBackgroundJobTick(reconJobName("am"), async()=>{ await runReconTick("am"); }); wrapBackgroundJobTick(reconJobName("pm"), async()=>{ await runReconTick("pm"); }); }';
  const goodService = `const a="${RECON_JOB_AM}"; const b="${RECON_JOB_PM}";`;
  const goodAudit = "export function initializeAuditChainVerifyCron(app){}";
  const goodIndex =
    'import { initializeReconCron } from "./cron/recon.cron.js";\n' +
    'import { initializeAuditChainVerifyCron } from "./cron/audit-chain-verify.cron.js";\n' +
    "initializeReconCron(app);\ninitializeAuditChainVerifyCron(app);";

  const pass = computeReconCronFailures({
    reconCron: goodReconCron,
    reconService: goodService,
    auditCron: goodAudit,
    index: goodIndex,
  });
  // Negative cases: drop the pm pass, and an index that never calls the initializer.
  const failMissingPm = computeReconCronFailures({
    reconCron: goodReconCron.replace('runReconTick("pm")', "noop()"),
    reconService: goodService,
    auditCron: goodAudit,
    index: goodIndex,
  });
  const failUnwired = computeReconCronFailures({
    reconCron: goodReconCron,
    reconService: goodService,
    auditCron: goodAudit,
    index: 'import { initializeReconCron } from "./cron/recon.cron.js";', // imported, never called; audit absent
  });

  const checks = [
    ["fully-wired inputs produce zero failures", pass.length === 0],
    ["missing pm pass is flagged", failMissingPm.length > 0],
    ["uncalled initializer is flagged", failUnwired.some((e) => e.includes("call initializeReconCron"))],
    ["missing audit cron wiring is flagged", failUnwired.some((e) => e.includes("initializeAuditChainVerifyCron"))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:recon-cron-registered --selftest FAIL:");
    for (const [n] of failed) console.error("  x " + n);
    process.exit(1);
  }
  console.log(`verify:recon-cron-registered --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const failures = computeReconCronFailures({
  reconCron: readIf("apps/backend/src/cron/recon.cron.ts"),
  reconService: readIf("apps/backend/src/accounting/recon/recon-cron.service.ts"),
  auditCron: readIf("apps/backend/src/cron/audit-chain-verify.cron.ts"),
  index: readIf("apps/backend/src/index.ts"),
});

if (failures.length) {
  console.error("verify:recon-cron-registered FAIL — the reconciler is not wired into the in-process scheduler:");
  for (const f of failures) console.error("  x " + f);
  process.exit(1);
}
console.log("verify:recon-cron-registered PASS (recon + audit-chain-verify wired into the in-process scheduler)");
