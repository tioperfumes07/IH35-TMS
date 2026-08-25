#!/usr/bin/env node
/**
 * Row 423 — enabled-job health must mirror each worker's real capability gate, and the FMCSA SAFER
 * writer must emit only values accepted by the live CHECK constraint.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HEALTH = "apps/backend/src/health/health.routes.ts";
const CSA = "apps/backend/src/compliance/csa-basic-pull.ts";
const SAFER = "apps/backend/src/compliance/fmcsa-safer-verifier.ts";
const ALERT_ROUTER = "apps/backend/src/reconciliation/alert-routing.service.ts";
const RECON_WORKER = "apps/backend/src/reconciliation/reconciliation-worker.service.ts";
const ERROR_DIGEST = "apps/backend/src/cron/error-digest.cron.ts";
const LABEL = "verify-background-job-source-readiness";

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function auditSources({ health, csa, safer, alertRouter, reconWorker, errorDigest }) {
  const failures = [];
  const healthCode = stripComments(health);
  const csaCode = stripComments(csa);
  const saferCode = stripComments(safer);

  if (!/case\s+["']fuel\.fraud_detector_worker["'][\s\S]{0,240}envEnabled\(["']ENABLE_FUEL_FRAUD_DETECTOR_WORKER["']\)/.test(healthCode)) {
    failures.push("fuel fraud health does not mirror its default-OFF worker flag");
  }
  if (!/case\s+["']compliance\.csa_basic_pull_cron["'][\s\S]{0,300}envEnabled\(["']ENABLE_CSA_BASIC_PULL_CRON["']\)/.test(healthCode)) {
    failures.push("CSA health does not mirror the authenticated-source opt-in flag");
  }
  if (!/process\.env\.ENABLE_CSA_BASIC_PULL_CRON\s*!==\s*["']true["']/.test(csaCode)) {
    failures.push("CSA worker is not explicit opt-in even though the public source has no BASIC measures");
  }

  for (const forbidden of ["'failed'", "\"failed\"", "'skipped'", "\"skipped\"", "'error'", "\"error\""]) {
    if (saferCode.includes(`safer_status = ${forbidden}`) || saferCode.includes(`safer_status: ${forbidden}`)) {
      failures.push(`FMCSA SAFER writer emits constraint-invalid status ${forbidden}`);
    }
  }
  for (const required of ["verified", "inactive", "revoked", "not_found", "missing_lookup", "lookup_failed"]) {
    if (!saferCode.includes(`\"${required}\"`)) failures.push(`FMCSA SAFER contract is missing ${required}`);
  }
  if (!/enqueueOutboxEvent\([\s\S]{0,500}dedupeKey/.test(alertRouter)) {
    failures.push("reconciliation alerts bypass the canonical partial-index-aware outbox enqueue");
  }
  if (/ON\s+CONFLICT\s*\(\s*dedupe_key\s*\)\s+DO\s+NOTHING/i.test(alertRouter)) {
    failures.push("reconciliation alerts use a conflict target that cannot infer the partial dedupe index");
  }
  if (!/SAVEPOINT reconciliation_company[\s\S]{0,2400}ROLLBACK TO SAVEPOINT reconciliation_company[\s\S]{0,200}updateStateOnFailure/.test(reconWorker)) {
    failures.push("reconciliation failure state can mask the originating SQL error with transaction-aborted 25P02");
  }
  const appendDigestBody = errorDigest.slice(
    errorDigest.indexOf("async function appendDigestAudit"),
    errorDigest.indexOf("export function initializeErrorDigestCron"),
  );
  if (/withLuciaBypass\([\s\S]*?\)\.catch\(\(\) => undefined\)/.test(appendDigestBody)) {
    failures.push("error digest swallows its durable audit-write failure and reports a false success");
  }
  if (!/await appendDigestAudit\([\s\S]{0,400}app\.log\.error/.test(errorDigest)) {
    failures.push("error digest must await its durable audit record before reporting elevated volume");
  }
  return failures;
}

function treeSources() {
  return {
    health: readFileSync(join(ROOT, HEALTH), "utf8"),
    csa: readFileSync(join(ROOT, CSA), "utf8"),
    safer: readFileSync(join(ROOT, SAFER), "utf8"),
    alertRouter: readFileSync(join(ROOT, ALERT_ROUTER), "utf8"),
    reconWorker: readFileSync(join(ROOT, RECON_WORKER), "utf8"),
    errorDigest: readFileSync(join(ROOT, ERROR_DIGEST), "utf8"),
  };
}

function selftest() {
  const clean = treeSources();
  const planted = [
    { name: "fuel health hard-enabled", value: { ...clean, health: clean.health.replace('envEnabled("ENABLE_FUEL_FRAUD_DETECTOR_WORKER")', "true") } },
    { name: "CSA worker default-enabled", value: { ...clean, csa: clean.csa.replace('process.env.ENABLE_CSA_BASIC_PULL_CRON !== "true"', 'process.env.ENABLE_CSA_BASIC_PULL_CRON === "false"') } },
    { name: "SAFER invalid skipped status", value: { ...clean, safer: clean.safer.replace("safer_status = 'missing_lookup'", "safer_status = 'skipped'") } },
    { name: "alert partial-index predicate bypass", value: { ...clean, alertRouter: clean.alertRouter.replace("enqueueOutboxEvent(", "enqueueOutboxEventMissing(") } },
    { name: "reconciliation error savepoint removed", value: { ...clean, reconWorker: clean.reconWorker.replace("ROLLBACK TO SAVEPOINT reconciliation_company", "SELECT 1") } },
    { name: "error digest audit failure swallowed", value: { ...clean, errorDigest: clean.errorDigest.replace("  });\n}\n\nexport function initializeErrorDigestCron", "  }).catch(() => undefined);\n}\n\nexport function initializeErrorDigestCron") } },
  ];
  const failures = [];
  for (const mutation of planted) {
    if (auditSources(mutation.value).length === 0) failures.push(`${mutation.name} was not caught`);
  }
  const actual = auditSources(clean);
  if (actual.length) failures.push(`real source rejected: ${actual.join(" | ")}`);
  if (failures.length) {
    for (const failure of failures) console.error(`${LABEL}: ${failure}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — 6/6 planted defects rejected`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const failures = auditSources(treeSources());
  if (failures.length) {
    for (const failure of failures) console.error(`${LABEL}: ${failure}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — worker gates and SAFER status constraint agree`);
}
