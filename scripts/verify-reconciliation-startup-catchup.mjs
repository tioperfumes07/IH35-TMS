#!/usr/bin/env node
/**
 * LV-SYSTEM-BACKGROUND-JOBS-STALE-DOWN-REGRESSION — reconciliation worker must catch up overdue
 * ticks on startup (node-cron does not backfill after deploy), using the same maxStaleMinutes as
 * health.routes backgroundJobRule. Do not hide DOWN; do not remove the catch-up call.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CRON = "apps/backend/src/cron/reconciliation-worker.cron.ts";
const HEALTH = "apps/backend/src/health/health.routes.ts";
const LABEL = "verify-reconciliation-startup-catchup";

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function auditSources({ cron, health }) {
  const failures = [];
  const cronCode = stripComments(cron);
  const healthCode = stripComments(health);

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
  return failures;
}

function treeSources() {
  return {
    cron: readFileSync(join(ROOT, CRON), "utf8"),
    health: readFileSync(join(ROOT, HEALTH), "utf8"),
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
