#!/usr/bin/env node
/**
 * LV-SYSTEM-BACKGROUND-JOBS-STALE-DOWN-REGRESSION + SYSTEM-BACKGROUND-JOB-LEDGER-STALE-AFTER-SUCCESSFUL-TICKS
 * Reconciliation worker and in-process sibling crons must catch up overdue ticks on startup
 * (node-cron does not backfill after deploy), using the same maxStaleMinutes as health.routes
 * backgroundJobRule. Do not hide DOWN; do not catch-up QBO push / money posters.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CRON = "apps/backend/src/cron/reconciliation-worker.cron.ts";
const IN_PROCESS = "apps/backend/src/cron/in-process-startup-catchup.ts";
const INDEX = "apps/backend/src/index.ts";
const HEALTH = "apps/backend/src/health/health.routes.ts";
const LABEL = "verify-reconciliation-startup-catchup";

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function auditSources({ cron, health, inProcess, index }) {
  const failures = [];
  const cronCode = stripComments(cron);
  const healthCode = stripComments(health);
  const inProcessCode = stripComments(inProcess);
  const indexCode = stripComments(index);

  if (!/catchUpOverdueReconciliationTicks/.test(cronCode)) {
    failures.push("reconciliation cron missing catchUpOverdueReconciliationTicks");
  }
  if (!/void\s+catchUpOverdueReconciliationTicks\s*\(/.test(cronCode)) {
    failures.push("initializeReconciliationWorkerCron does not fire-and-forget catch-up on boot");
  }
  if (!/isReconciliationJobOverdue/.test(cronCode)) {
    failures.push("catch-up does not gate on isReconciliationJobOverdue");
  }
  if (!/reconciliation\.qbo_transactional[\s\S]{0,80}maxStaleMinutes:\s*120/.test(cronCode)) {
    failures.push("qbo_transactional catch-up window is not 120m (health two-period window)");
  }
  if (!/case\s+["']reconciliation\.qbo_transactional["'][\s\S]{0,200}maxStaleMinutes:\s*120/.test(healthCode)) {
    failures.push("health.routes qbo_transactional window drifted from 120m");
  }

  if (!/catchUpOverdueInProcessJobTicks/.test(inProcessCode)) {
    failures.push("in-process catch-up missing catchUpOverdueInProcessJobTicks");
  }
  if (!/startInProcessJobCatchup/.test(inProcessCode)) {
    failures.push("in-process catch-up missing startInProcessJobCatchup");
  }
  if (!/void\s+catchUpOverdueInProcessJobTicks\s*\(/.test(inProcessCode)) {
    failures.push("startInProcessJobCatchup does not fire-and-forget catch-up");
  }
  if (!/samsara\.webhook_projection_cron[\s\S]{0,80}maxStaleMinutes:\s*15/.test(inProcessCode)) {
    failures.push("webhook projection catch-up window is not 15m (health two-period window)");
  }
  if (!/idempotency\.cleanup_cron[\s\S]{0,80}maxStaleMinutes:\s*2880/.test(inProcessCode)) {
    failures.push("idempotency cleanup catch-up window is not 2880m");
  }
  if (!/email\.queue_processor[\s\S]{0,80}maxStaleMinutes:\s*5/.test(inProcessCode)) {
    failures.push("email.queue_processor catch-up window is not 5m (health two-period window)");
  }
  if (!/chat\.confirmation_escalation[\s\S]{0,80}maxStaleMinutes:\s*5/.test(inProcessCode)) {
    failures.push("chat.confirmation_escalation catch-up window is not 5m (health two-period window)");
  }
  if (!/case\s+["']email\.queue_processor["'][\s\S]{0,200}maxStaleMinutes:\s*5/.test(healthCode)) {
    failures.push("health.routes email.queue_processor window drifted from 5m");
  }
  if (!/case\s+["']chat\.confirmation_escalation["'][\s\S]{0,200}maxStaleMinutes:\s*5/.test(healthCode)) {
    failures.push("health.routes chat.confirmation_escalation window drifted from 5m");
  }
  if (/sync\.qbo_/.test(inProcessCode) || /qbo_vendors_push/.test(inProcessCode)) {
    failures.push("in-process catch-up must not run TMS→QBO push jobs");
  }
  if (/collections_sync_cron/.test(inProcessCode) || /factoring_default_interest/.test(inProcessCode)) {
    failures.push("in-process catch-up must not run money poster crons");
  }
  if (!/startInProcessJobCatchup\s*\(\s*app\s*\)/.test(indexCode)) {
    failures.push("index.ts does not arm startInProcessJobCatchup(app) on boot");
  }
  return failures;
}

function treeSources() {
  return {
    cron: readFileSync(join(ROOT, CRON), "utf8"),
    health: readFileSync(join(ROOT, HEALTH), "utf8"),
    inProcess: readFileSync(join(ROOT, IN_PROCESS), "utf8"),
    index: readFileSync(join(ROOT, INDEX), "utf8"),
  };
}

function selftest() {
  const clean = treeSources();
  const planted = [
    {
      name: "catch-up function removed",
      value: {
        ...clean,
        cron: clean.cron.replaceAll("catchUpOverdueReconciliationTicks", "catchUpMissing"),
      },
    },
    {
      name: "boot call removed",
      value: {
        ...clean,
        cron: clean.cron.replace(/void\s+catchUpOverdueReconciliationTicks\s*\([^)]*\)/, "void Promise.resolve()"),
      },
    },
    {
      name: "transactional window widened to hide DOWN",
      value: {
        ...clean,
        cron: clean.cron.replace(
          'jobName: "reconciliation.qbo_transactional", maxStaleMinutes: 120',
          'jobName: "reconciliation.qbo_transactional", maxStaleMinutes: 9999'
        ),
      },
    },
    {
      name: "in-process catch-up function removed",
      value: {
        ...clean,
        inProcess: clean.inProcess.replaceAll("catchUpOverdueInProcessJobTicks", "catchUpMissingInProcess"),
      },
    },
    {
      name: "in-process boot arm removed",
      value: {
        ...clean,
        index: clean.index.replace(/startInProcessJobCatchup\s*\(\s*app\s*\)/, "void 0"),
      },
    },
    {
      name: "webhook window widened to hide DOWN",
      value: {
        ...clean,
        inProcess: clean.inProcess.replace(
          'jobName: "samsara.webhook_projection_cron", maxStaleMinutes: 15',
          'jobName: "samsara.webhook_projection_cron", maxStaleMinutes: 9999'
        ),
      },
    },
    {
      name: "email queue catch-up window widened to hide DOWN",
      value: {
        ...clean,
        inProcess: clean.inProcess.replace(
          'jobName: "email.queue_processor", maxStaleMinutes: 5',
          'jobName: "email.queue_processor", maxStaleMinutes: 9999'
        ),
      },
    },
    {
      name: "chat escalation catch-up window widened to hide DOWN",
      value: {
        ...clean,
        inProcess: clean.inProcess.replace(
          'jobName: "chat.confirmation_escalation", maxStaleMinutes: 5',
          'jobName: "chat.confirmation_escalation", maxStaleMinutes: 9999'
        ),
      },
    },
  ];
  const failures = [];
  for (const mutation of planted) {
    if (auditSources(mutation.value).length === 0) failures.push(`${mutation.name} was not caught`);
  }
  if (auditSources(clean).length !== 0) failures.push(`clean tree failed: ${auditSources(clean).join("; ")}`);
  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = auditSources(treeSources());
  if (failures.length) {
    console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
