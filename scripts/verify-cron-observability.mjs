#!/usr/bin/env node
/**
 * verify-cron-observability.mjs  (G10-C3 / G10-C4 / G4-HEALTH)
 *
 * Static CI guard for cron reliability/observability wiring. Asserts:
 *   1. The standalone Render cron entrypoints (run-recon.ts, run-loves-card-import.ts) initialize
 *      Sentry and record a background-job run (via wrapBackgroundJobTick) — they must NOT bypass it.
 *   2. The qbo-sync + email queue drainers contain a stale-lock reclaim (5-minute window) so rows
 *      orphaned in-flight by a mid-flight crash/redeploy are requeued.
 *   3. The recon /healthz staleness rule has non-null rules for both recon passes.
 *   4. The frontend + driver-PWA bootstraps actually CALL their Sentry init functions.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const errors = [];

function check(cond, msg) {
  if (!cond) errors.push(msg);
}

// 1. Cron entrypoints init Sentry + record background job runs.
const cronEntrypoints = [
  "apps/backend/src/accounting/recon/run-recon.ts",
  "apps/backend/src/sync/run-loves-card-import.ts",
];
for (const f of cronEntrypoints) {
  const src = read(f);
  check(/initBackendSentry\s*\(\s*\)/.test(src), `${f}: must call initBackendSentry() to init Sentry at cron start.`);
  check(
    /wrapBackgroundJobTick\s*\(/.test(src),
    `${f}: must run through wrapBackgroundJobTick so each run records a _system.background_jobs row.`
  );
}

// 2a. qbo-sync drainer reclaims stale in_flight rows.
const qboSrc = read("apps/backend/src/integrations/qbo/qbo-sync.service.ts");
check(
  /sync_status\s*=\s*'in_flight'\s+AND\s+last_attempt_at\s*<\s*now\(\)\s*-\s*interval\s*'5 minutes'/.test(qboSrc),
  "qbo-sync.service.ts: processSyncQueueBatch must reclaim stale in_flight rows (last_attempt_at < now() - interval '5 minutes')."
);

// 2b. email drainer reclaims stale sending rows + wraps finalizeSuccess.
const emailSrc = read("apps/backend/src/email/cron.ts");
check(
  /status\s*=\s*'sending'\s+AND\s+updated_at\s*<\s*now\(\)\s*-\s*interval\s*'5 minutes'/.test(emailSrc),
  "email/cron.ts: claimQueuedEmailsBatch must reclaim stale 'sending' rows (updated_at < now() - interval '5 minutes')."
);
check(
  /try\s*\{[\s\S]*?finalizeSuccess\([\s\S]*?\}\s*catch/.test(emailSrc),
  "email/cron.ts: the finalizeSuccess call must be wrapped in try/catch."
);

// 3. Recon crons have a non-null /healthz staleness rule.
const healthSrc = read("apps/backend/src/health/health.routes.ts");
for (const job of ["accounting.recon_am_bank_count", "accounting.recon_pm_categorization_diff"]) {
  check(
    new RegExp(`case\\s*"${job.replace(/[.]/g, "\\.")}"`).test(healthSrc),
    `health.routes.ts: backgroundJobRule must have a non-null staleness rule for "${job}".`
  );
}

// 4. Frontend + PWA bootstraps call their Sentry init fn.
const feMain = read("apps/frontend/src/main.tsx");
check(/initFrontendSentry\s*\(\s*\)/.test(feMain), "apps/frontend/src/main.tsx: must call initFrontendSentry() at bootstrap.");
const pwaMain = read("apps/driver-pwa/src/main.tsx");
check(/initDriverPwaSentry\s*\(\s*\)/.test(pwaMain), "apps/driver-pwa/src/main.tsx: must call initDriverPwaSentry() at bootstrap.");
const pwaEb = read("apps/driver-pwa/src/components/ErrorBoundary.tsx");
check(/capturePwaError\s*\(/.test(pwaEb), "driver-pwa ErrorBoundary.tsx: componentDidCatch must report to Sentry via capturePwaError().");

if (errors.length > 0) {
  console.error("verify-cron-observability FAIL:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log("verify-cron-observability OK — cron entrypoints init Sentry + record jobs; qbo-sync/email reclaim stale locks; recon healthz rules + FE/PWA Sentry wired.");
