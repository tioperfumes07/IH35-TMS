#!/usr/bin/env node
/**
 * verify-stalled-queue-reaper.mjs
 * CI guard for G10-C4 / G10-M: the two work-queue drainers must keep their stale-lock reaper so rows
 * orphaned mid-flight by a crash/redeploy are reclaimed instead of stranded forever.
 *
 * Regression it prevents: a claim query that only picks `pending`/`queued` rows (dropping the
 * `in_flight`/`sending` + stale-timestamp reclaim clause) silently strands every row a worker was
 * holding when it died — QBO entities never sync again, queued emails never send, with no error.
 *
 * FAILS IF:
 *   1. integrations/qbo/qbo-sync.service.ts loses its `sync_status = 'in_flight' AND ... < now() - interval`
 *      reclaim clause.
 *   2. email/cron.ts loses its `status = 'sending' AND ... < now() - interval` reclaim clause.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const errors = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    errors.push(`MISSING FILE: ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

// Normalize whitespace so the guard matches regardless of SQL formatting/line-wrapping.
const flat = (s) => s.replace(/\s+/g, " ");

// --- 1: QBO sync-queue in_flight reaper ----------------------------------------------------------
const QBO = "apps/backend/src/integrations/qbo/qbo-sync.service.ts";
const qbo = flat(read(QBO));
// e.g. `sync_status = 'in_flight' AND last_attempt_at < now() - interval '5 minutes'`
const qboReaper = /sync_status\s*=\s*'in_flight'\s+AND\s+\w+\s*<\s*now\(\)\s*-\s*interval\s*'[^']+'/i;
if (qbo && !qboReaper.test(qbo)) {
  errors.push(
    `${QBO} no longer reclaims stale in_flight rows (expected a "sync_status = 'in_flight' AND <ts> < now() - interval '...'" clause in the claim query) — G10-C4 reaper regression.`,
  );
}

// --- 2: email queue 'sending' reaper -------------------------------------------------------------
const EMAIL = "apps/backend/src/email/cron.ts";
const email = flat(read(EMAIL));
// e.g. `status = 'sending' AND updated_at < now() - interval '5 minutes'`
const emailReaper = /status\s*=\s*'sending'\s+AND\s+\w+\s*<\s*now\(\)\s*-\s*interval\s*'[^']+'/i;
if (email && !emailReaper.test(email)) {
  errors.push(
    `${EMAIL} no longer reclaims stale 'sending' rows (expected a "status = 'sending' AND <ts> < now() - interval '...'" clause in the claim query) — G10-C4 reaper regression.`,
  );
}

if (errors.length > 0) {
  console.error("verify-stalled-queue-reaper: FAIL");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log("verify-stalled-queue-reaper: OK (qbo in_flight + email 'sending' stale-lock reclaim present)");
