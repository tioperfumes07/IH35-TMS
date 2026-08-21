import fs from "node:fs";

// PROD-OUTAGE-SCHEDULED-REPORTS-PUPPETEER-ROOT-CAUSE-CONFIRMED — a stuck reporting.scheduled_reports
// row drove htmlToPdfBuffer's Puppeteer call into killing the whole Node process rather than
// throwing a catchable exception. The worker's next_run_at bookkeeping only ever advanced on a
// JS-catchable outcome (success or the catch block), so a poisoned row retried on every tick,
// forever, on every restart — that was the live production outage this session. Two files, two
// independent guards:
//   1. report-file-builder.ts: container-safe Puppeteer launch args + a hard generation timeout.
//   2. scheduled-reports-worker.ts: a pessimistic next_run_at backoff set BEFORE the risky call,
//      so a process-killing crash still bounds the retry to once per 10 minutes instead of once
//      per tick.

const builderFile = "apps/backend/src/scheduled-reports/report-file-builder.ts";
const workerFile = "apps/backend/src/scheduled-reports/scheduled-reports-worker.ts";
const builderSource = fs.readFileSync(builderFile, "utf8");
const workerSource = fs.readFileSync(workerFile, "utf8");

function builderFailures(text) {
  const errors = [];
  if (!/args:\s*\[[^\]]*"--disable-dev-shm-usage"[^\]]*\]/.test(text)) {
    errors.push("puppeteer.launch is missing --disable-dev-shm-usage (common container-crash cause)");
  }
  if (!/args:\s*\[[^\]]*"--no-sandbox"[^\]]*\]/.test(text)) {
    errors.push("puppeteer.launch is missing --no-sandbox (common container-crash cause)");
  }
  if (!/Promise\.race\(\[generate,\s*timeout\]\)/.test(text)) {
    errors.push("htmlToPdfBuffer does not race the generation against a timeout");
  }
  if (!/PDF_GENERATION_TIMEOUT_MS/.test(text)) {
    errors.push("no PDF_GENERATION_TIMEOUT_MS constant found — hard timeout removed?");
  }
  return errors;
}

function workerFailures(text) {
  const errors = [];
  // The pessimistic backoff must be in the SAME UPDATE that runs before the try block (i.e. before
  // deliverScheduledReportToEmail is ever called), not bolted on somewhere unrelated.
  const bumpMatch = text.match(/UPDATE reporting\.scheduled_reports\s*SET last_run_at = now\(\)[\s\S]{0,300}?RETURNING id/);
  if (!bumpMatch) {
    errors.push("could not locate the pre-generation bump UPDATE (file restructured?)");
    return errors;
  }
  const block = bumpMatch[0];
  if (!/next_run_at\s*=\s*now\(\)\s*\+\s*interval\s*'10 minutes'/.test(block)) {
    errors.push("bump UPDATE does not push next_run_at forward before the risky generation call");
  }
  // The bump must run strictly before the try block that calls the generator, not after.
  const bumpIdx = text.indexOf(bumpMatch[0]);
  const tryIdx = text.indexOf("try {");
  if (bumpIdx < 0 || tryIdx < 0 || bumpIdx > tryIdx) {
    errors.push("bump UPDATE does not precede the try block that calls deliverScheduledReportToEmail");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const regressedBuilder = builderSource
    .replace('args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],\n  }', "}")
    .replace(/return await Promise\.race\(\[generate, timeout\]\);/, "return await generate;");
  const regressedWorker = workerSource.replace(
    /,\s*\n\s*next_run_at = now\(\) \+ interval '10 minutes'/,
    "",
  );
  const ok = builderFailures(builderSource).length === 0 && workerFailures(workerSource).length === 0;
  const catchesBuilderRegression = builderFailures(regressedBuilder).length > 0;
  const catchesWorkerRegression = workerFailures(regressedWorker).length > 0;
  if (!ok || !catchesBuilderRegression || !catchesWorkerRegression) {
    console.error("verify-scheduled-reports-crash-resilience selftest FAIL", {
      ok,
      catchesBuilderRegression,
      catchesWorkerRegression,
    });
    process.exit(1);
  }
  console.log("verify-scheduled-reports-crash-resilience selftest PASS — dropping either hardening turns it red");
  process.exit(0);
}

const errors = [...builderFailures(builderSource).map((e) => `[builder] ${e}`), ...workerFailures(workerSource).map((e) => `[worker] ${e}`)];
if (errors.length) {
  console.error(`verify-scheduled-reports-crash-resilience FAIL:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(
  "verify-scheduled-reports-crash-resilience PASS — Puppeteer launch is container-safe with a hard timeout, and next_run_at backs off before the risky call so a process crash can't retry-loop the same poisoned row every tick",
);
