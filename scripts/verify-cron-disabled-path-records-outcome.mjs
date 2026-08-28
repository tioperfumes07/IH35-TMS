#!/usr/bin/env node
/**
 * GO-0017-L3-CRON-WRITES-OUTCOME — every cron path writes success OR failure on every run,
 * including early returns. An early return is an outcome, not an absence.
 *
 * Confirmed live via Render logs (INFRA-F9935, GO-0016): email.queue_processor,
 * chat.confirmation_escalation, and samsara.webhook_projection_cron were all disabled via env var
 * in the same 2026-08-21 deploy-storm window as INFRA-F6350, and their _system.background_jobs
 * rows have been frozen at their pre-disable timestamps ever since — indistinguishable from a
 * silently crashed process. fuel.fraud_detector_worker (default OFF by design, 81 days stale) has
 * the identical shape: an early return before cron.schedule that never wrote an outcome.
 *
 * Fix: each disabled-via-env-var early return now calls recordBackgroundJobDisabled(jobName) — the
 * SAME _system.record_job_run RPC a real successful tick uses (success=true, no error) — so
 * last_successful_run_at refreshes on every process boot (this repo deploys frequently) instead of
 * freezing forever. QBO jobs are explicitly LOG ONLY this GO (0 active connections since 08-21) —
 * not wired here, not this guard's scope.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const TARGETS = [
  {
    file: "apps/backend/src/email/cron.ts",
    disabledCheck: 'process.env.EMAIL_CRON_ENABLED !== "true"',
    jobName: "email.queue_processor",
  },
  {
    file: "apps/backend/src/cron/chat-confirmation-escalation.cron.ts",
    disabledCheck: 'process.env.ENABLE_CHAT_CONFIRMATION_ESCALATION_CRON === "false"',
    jobName: "chat.confirmation_escalation",
  },
  {
    file: "apps/backend/src/cron/samsara-webhook-projection.cron.ts",
    disabledCheck: '(process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON ?? "true").trim() === "false"',
    jobName: "samsara.webhook_projection_cron",
  },
  {
    file: "apps/backend/src/jobs/fuel-fraud-detector-worker.ts",
    disabledCheck: '(process.env.ENABLE_FUEL_FRAUD_DETECTOR_WORKER ?? "false").trim() !== "true"',
    jobName: "fuel.fraud_detector_worker",
  },
];

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function check(sources) {
  const failures = [];

  for (const target of TARGETS) {
    const raw = sources[target.file];
    if (raw === undefined) {
      failures.push(`${target.file}: source not provided to check() — guard out of sync`);
      continue;
    }
    const src = stripLineComments(raw);

    if (!src.includes(target.disabledCheck)) {
      failures.push(`${target.file}: expected disabled-check condition not found — guard out of sync (env var polarity changed?)`);
      continue;
    }

    if (!src.includes("recordBackgroundJobDisabled")) {
      failures.push(`${target.file}: recordBackgroundJobDisabled(...) import/call is missing — disabled early-return no longer records an outcome (GO-0017-L3)`);
      continue;
    }

    // The disabled-check block must actually CALL recordBackgroundJobDisabled with this job's name
    // before its return — anchor on the check condition and look within a bounded window after it.
    const checkIdx = src.indexOf(target.disabledCheck);
    const windowAfter = src.slice(checkIdx, checkIdx + 600);
    if (!windowAfter.includes(`recordBackgroundJobDisabled(${JSON.stringify(target.jobName)}`) && !windowAfter.includes(`recordBackgroundJobDisabled(CRON_NAME)`)) {
      failures.push(`${target.file}: recordBackgroundJobDisabled call not found near the disabled-check for job "${target.jobName}" — guard out of sync or fix reverted`);
    }
  }

  return failures;
}

function readSources() {
  const sources = {};
  for (const target of TARGETS) {
    sources[target.file] = fs.readFileSync(path.join(root, target.file), "utf8");
  }
  return sources;
}

function run() {
  const failures = check(readSources());
  if (failures.length > 0) {
    console.error("FAIL: cron-disabled-path-records-outcome");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: all 4 GO-0017-L3 cron disabled-paths record an outcome instead of vanishing silently");
}

function selftest() {
  const sources = readSources();
  const baseline = check(sources);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Offender: strip the recordBackgroundJobDisabled call from the email cron file only.
  const emailFile = "apps/backend/src/email/cron.ts";
  const offenderSrc = sources[emailFile].replace(
    /recordBackgroundJobDisabled\("email\.queue_processor"\)\.catch\([\s\S]*?\);\n/,
    ""
  );
  if (offenderSrc === sources[emailFile]) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const offenderSources = { ...sources, [emailFile]: offenderSrc };
  const failures = check(offenderSources);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (email.queue_processor's disabled-outcome call removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
