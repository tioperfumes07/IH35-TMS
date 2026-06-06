#!/usr/bin/env node
/**
 * PASS-8-RUNTIME HEALTHZ PROBE
 *
 * Spec: docs/trackers/PASS-8-RUNTIME-TIER1-DISPATCH.md §2
 *   - Probe GET /api/v1/healthz every 30 s for 5 minutes (10 samples)
 *   - Require zero 503 responses
 *   - p95 latency ≤ 500 ms (from docs/perf-budgets.json api_p95_read_ms)
 *   - Record each sample {t, status, latency_ms}; compute p50/p95/max
 *
 * Usage: node scripts/pass-8-runtime-healthz-probe.mjs
 */

import https from "node:https";
import { performance } from "node:perf_hooks";

const HEALTHZ_URL = "https://api.ih35dispatch.com/api/v1/healthz";
const SAMPLES     = 10;
const INTERVAL_MS = 30_000;  // 30 s between samples
const P95_BUDGET_MS = 500;   // from docs/perf-budgets.json api_p95_read_ms
const TIMEOUT_MS = 10_000;   // 10 s request timeout

const RUN_TS    = new Date().toISOString();
const RUN_DATE  = RUN_TS.slice(0, 10);

// ──────────────────────────────────────────────────────────────────────────────
// HTTP helper
// ──────────────────────────────────────────────────────────────────────────────
function probeHealthz() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const req = https.get(HEALTHZ_URL, { timeout: TIMEOUT_MS }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        const latency_ms = Math.round(performance.now() - t0);
        resolve({ t: new Date().toISOString(), status: res.statusCode, latency_ms, body });
      });
    });
    req.on("timeout", () => {
      req.destroy();
      const latency_ms = Math.round(performance.now() - t0);
      resolve({ t: new Date().toISOString(), status: 0, latency_ms, error: "timeout" });
    });
    req.on("error", (err) => {
      const latency_ms = Math.round(performance.now() - t0);
      resolve({ t: new Date().toISOString(), status: 0, latency_ms, error: err.message });
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Percentile computation
// ──────────────────────────────────────────────────────────────────────────────
function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.min(idx, sortedArr.length - 1)];
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  PASS-8-RUNTIME HEALTHZ PROBE`);
  console.log(`  ${SAMPLES} samples @ ${INTERVAL_MS / 1000}s intervals`);
  console.log(`  Target: ${HEALTHZ_URL}`);
  console.log(`  p95 budget: ${P95_BUDGET_MS} ms  (source: docs/perf-budgets.json api_p95_read_ms)`);
  console.log(`  Started: ${RUN_TS}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  const samples = [];

  for (let i = 0; i < SAMPLES; i++) {
    if (i > 0) {
      process.stdout.write(`  Waiting ${INTERVAL_MS / 1000}s …`);
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      process.stdout.write("\r                          \r");
    }

    const sample = await probeHealthz();
    samples.push(sample);

    const icon = sample.status === 200 ? "✓" : "✗";
    const tag  = sample.error ? ` [${sample.error}]` : "";
    console.log(
      `  [${String(i + 1).padStart(2, "0")}/${SAMPLES}] ${sample.t}  ` +
      `HTTP ${sample.status}  ${sample.latency_ms}ms${tag}  ${icon}`
    );

    // Hard-stop on 503
    if (sample.status === 503) {
      console.error(`\n  ╔══════════════════════════════════╗`);
      console.error(`  ║  HARD STOP: 503 on sample ${i + 1}/${SAMPLES}`);
      console.error(`  ║  Exact response: HTTP 503`);
      console.error(`  ╚══════════════════════════════════╝\n`);
      process.exitCode = 1;
    }
  }

  // ── Statistics ──
  const latencies = samples.map((s) => s.latency_ms).sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const pMax = latencies[latencies.length - 1];
  const count503 = samples.filter((s) => s.status === 503).length;
  const countNon200 = samples.filter((s) => s.status !== 200).length;

  const budgetOk   = p95 <= P95_BUDGET_MS;
  const zeroFiveOhThree = count503 === 0;
  const classification = budgetOk && zeroFiveOhThree ? "PASS" : "FAIL";

  console.log(`\n  ─── Statistics ──────────────────────────────────────`);
  console.log(`  p50 latency: ${p50} ms`);
  console.log(`  p95 latency: ${p95} ms  (budget: ${P95_BUDGET_MS} ms  → ${budgetOk ? "WITHIN" : "OVER BUDGET"})`);
  console.log(`  max latency: ${pMax} ms`);
  console.log(`  503 count:   ${count503}  (required: 0  → ${zeroFiveOhThree ? "OK" : "FAIL"})`);
  console.log(`  non-200:     ${countNon200}`);
  console.log(`  ────────────────────────────────────────────────────`);
  console.log(`  HEALTHZ CLASSIFICATION: ${classification}`);
  console.log(`  ────────────────────────────────────────────────────\n`);

  const result = {
    run_label:   `PASS-8-RUNTIME-${RUN_DATE}`,
    generated_at: RUN_TS,
    target:       HEALTHZ_URL,
    samples_requested: SAMPLES,
    samples_taken:     samples.length,
    interval_ms:       INTERVAL_MS,
    p95_budget_ms:     P95_BUDGET_MS,
    p95_budget_source: "docs/perf-budgets.json api_p95_read_ms",
    stats: { p50, p95, max: pMax },
    count_503:   count503,
    count_non200: countNon200,
    classification,
    budget_ok:   budgetOk,
    zero_503:    zeroFiveOhThree,
    samples,
  };

  process.stdout.write(JSON.stringify(result) + "\n");

  if (classification !== "PASS") process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exitCode = 1;
});
