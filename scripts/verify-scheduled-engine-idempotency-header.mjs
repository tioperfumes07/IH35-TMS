#!/usr/bin/env node
/**
 * OWNER STANDARD ROUND 329 (docs/specs/ENGINE-HEADER-TEMPLATE.md): every scheduled engine takes its idempotency from the
 * DATABASE — UNIQUE(...) ON CONFLICT, a SAME-STATEMENT WHERE compare-and-set, an ADVISORY LOCK, or a DETERMINISTIC
 * OVERWRITE — never a read-then-write in application code. FAILS IF a swept engine lacks the header or names no
 * accepted form. SWEPT grows lane by lane as each lane is swept; it never shrinks (no baseline).
 * Run: node scripts/verify-scheduled-engine-idempotency-header.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";

export const SWEPT = [
  // CC-3 lane (telematics / Samsara / dispatch / geofence) — swept ROUND 329.
  "apps/backend/src/cron/draft-crew-status-selfheal.cron.ts",
  "apps/backend/src/telematics/load-real-driven-miles.cron.ts",
  "apps/backend/src/border-crossing/cbp-wait-times-refresh.job.ts",
  "apps/backend/src/cron/geofence-auto-delivery.cron.ts",
  "apps/backend/src/cron/geofence-breach-detector.cron.ts",
  "apps/backend/src/cron/geofence-odometer-captures.cron.ts",
  "apps/backend/src/cron/load-stop-geofence-sync.cron.ts",
  "apps/backend/src/cron/samsara-documents.cron.ts",
  "apps/backend/src/cron/samsara-driver-replies.cron.ts",
  "apps/backend/src/cron/samsara-fuel-reports.cron.ts",
  "apps/backend/src/cron/samsara-hos-pull.cron.ts",
  "apps/backend/src/cron/samsara-master-sync.cron.ts",
  "apps/backend/src/cron/samsara-remote-count-collector.cron.ts",
  "apps/backend/src/cron/samsara-webhook-projection.cron.ts",
  "apps/backend/src/cron/telematics-preservation.cron.ts",
  "apps/backend/src/cron/unit-stop-events.cron.ts",
  "apps/backend/src/drivers/document-alerts.cron.ts",
  "apps/backend/src/integrations/samsara/fault-poll.cron.ts",
  "apps/backend/src/integrations/samsara/fuel-purchase-push.cron.ts",
  "apps/backend/src/integrations/samsara/messaging/driver-prompts.cron.ts",
  "apps/backend/src/integrations/samsara/routes-push.cron.ts",
  "apps/backend/src/safety/samsara-dvir-poll.cron.ts",
  "apps/backend/src/safety/harsh-events-poll.cron.ts",
  "apps/backend/src/telematics/odometer-snapshot.cron.ts",
];

const FORMS = /IDEMPOTENCY:[^\n]*\b(UNIQUE\([^)]*\)\s*ON CONFLICT|SAME-STATEMENT WHERE|ADVISORY LOCK|DETERMINISTIC OVERWRITE)/;

export function audit(read) {
  const f = [];
  for (const file of SWEPT) {
    const src = read(file);
    if (src == null) { f.push(`${file}: missing (swept engines never leave the list)`); continue; }
    const head = src.slice(0, 4000);
    for (const key of ["ENGINE:", "SCHEDULE:", "WRITES:", "IDEMPOTENCY:", "OVERLAP:"]) if (!head.includes(key)) f.push(`${file}: header lacks ${key}`);
    if (!FORMS.test(head)) f.push(`${file}: IDEMPOTENCY names no database-level form (UNIQUE(..) ON CONFLICT / SAME-STATEMENT WHERE / ADVISORY LOCK / DETERMINISTIC OVERWRITE)`);
    if (/IDEMPOTENCY:[^\n]*\b(checks first|skips if|already done|in-memory)/i.test(head)) f.push(`${file}: application-level check named as idempotency`);
  }
  return f;
}

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
const fails = audit(read);
if (fails.length) { console.error(`verify-scheduled-engine-idempotency-header: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const good = "/**\n * ENGINE: x\n * SCHEDULE: 5m\n * WRITES: a.b\n * IDEMPOTENCY: SAME-STATEMENT WHERE status = 'draft'\n * OVERLAP: second run matches 0 rows\n */";
  const cases = [
    ["app-level", good.replace("SAME-STATEMENT WHERE status = 'draft'", "checks first, skips if already done")],
    ["no header", "export const x = 1;"],
  ];
  SWEPT.push("x.ts");
  for (const [n, src] of cases) if (audit((p) => (p === "x.ts" ? src : read(p))).length === 0) { console.error(`selftest FAIL: ${n}`); process.exit(1); }
  if (audit((p) => (p === "x.ts" ? good : read(p))).length) { console.error("selftest FAIL: good header flagged"); process.exit(1); }
  SWEPT.pop();
  console.log("verify-scheduled-engine-idempotency-header selftest 3/3");
}
console.log(`verify-scheduled-engine-idempotency-header: OK — ${SWEPT.length} swept engine(s) declare database-level idempotency`);
