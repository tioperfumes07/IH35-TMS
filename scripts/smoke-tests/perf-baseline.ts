/**
 * Performance baseline smoke (Block H — P7-PERF-RUN-001).
 *
 * Targets production/staging API latency with cookie-authenticated sessions.
 *
 * Env:
 * - PERF_BASE_URL (default https://api.ih35dispatch.com)
 * - PERF_OPERATING_COMPANY_ID (required uuid)
 * - PERF_COOKIE (preferred auth header for prod/staging)
 * - PERF_TEST_AUTH (+ PERF_TEST_USER_ID / PERF_TEST_ROLE) legacy header fallback
 * - PERF_RECORD_ONLY=true → write markdown + exit 0 even when requests fail / are slow
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = (process.env.PERF_BASE_URL ?? "https://api.ih35dispatch.com").replace(/\/$/, "");
const COMPANY_ID = process.env.PERF_OPERATING_COMPANY_ID?.trim();
const COOKIE_HEADER = process.env.PERF_COOKIE?.trim();
const RECORD_ONLY = process.env.PERF_RECORD_ONLY === "1" || process.env.PERF_RECORD_ONLY === "true";

const TEST_USER_ID = process.env.PERF_TEST_USER_ID?.trim() ?? "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const TEST_ROLE = process.env.PERF_TEST_ROLE?.trim() ?? "Owner";

const SLOW_P95_MS = 500;
const HARD_FAIL_P95_MS = 2000;
const RUNS = 10;
const OUTPUT_REL = path.join("tests", "results", "perf-baseline-2026-05-14.md");

function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[idx] ?? 0;
}

function buildAuthHeaders(): Record<string, string> {
  if (COOKIE_HEADER) return { cookie: COOKIE_HEADER };
  const payload = Buffer.from(JSON.stringify({ id: TEST_USER_ID, role: TEST_ROLE, email: "perf.smoke@test.invalid" }), "utf8").toString(
    "base64url"
  );
  return { "x-test-auth": payload };
}

type Endpoint = { label: string; path: string; method: "GET" | "POST"; auth: boolean; body?: string };

function buildEndpoints(companyId: string): Endpoint[] {
  const cid = encodeURIComponent(companyId);
  return [
    { label: "GET /api/v1/dispatch/loads", path: `/api/v1/dispatch/loads?operating_company_id=${cid}&limit=25&offset=0&view=loads`, method: "GET", auth: true },
    { label: "GET /api/v1/mdata/drivers", path: `/api/v1/mdata/drivers?operating_company_id=${cid}&limit=25&offset=0`, method: "GET", auth: true },
    { label: "GET /api/v1/mdata/customers", path: `/api/v1/mdata/customers?operating_company_id=${cid}&limit=25&offset=0`, method: "GET", auth: true },
    { label: "GET /api/v1/mdata/vendors", path: `/api/v1/mdata/vendors?operating_company_id=${cid}&limit=25&offset=0`, method: "GET", auth: true },
    {
      label: "GET /api/v1/driver-finance/settlements",
      path: `/api/v1/driver-finance/settlements?operating_company_id=${cid}&limit=25&offset=0`,
      method: "GET",
      auth: true,
    },
    { label: "GET /api/v1/banking/dashboard/kpis (banking summary)", path: `/api/v1/banking/dashboard/kpis?operating_company_id=${cid}`, method: "GET", auth: true },
    { label: "GET /api/v1/qbo/sync/health", path: `/api/v1/qbo/sync/health?operating_company_id=${cid}`, method: "GET", auth: true },
    { label: "GET /api/v1/scheduled-reports", path: `/api/v1/scheduled-reports?operating_company_id=${cid}`, method: "GET", auth: true },
    { label: "GET /api/v1/admin/activity", path: `/api/v1/admin/activity?limit=25`, method: "GET", auth: true },
    { label: "GET /api/v1/admin/launch-readiness", path: `/api/v1/admin/launch-readiness`, method: "GET", auth: true },
    { label: "POST /api/v1/banking/plaid/webhook (empty JSON)", path: `/api/v1/banking/plaid/webhook`, method: "POST", auth: false, body: "{}" },
    { label: "GET /api/v1/email/queue", path: `/api/v1/email/queue?operating_company_id=${cid}`, method: "GET", auth: true },
  ];
}

async function measure(
  label: string,
  url: string,
  headers: Record<string, string>,
  method: "GET" | "POST",
  body?: string
): Promise<{ samples: number[]; failures: string[] }> {
  const samples: number[] = [];
  const failures: string[] = [];

  for (let i = 0; i < RUNS; i += 1) {
    const started = performance.now();
    try {
      const init: RequestInit = { method, headers: { ...headers } };
      if (method === "POST") {
        init.headers = { ...init.headers, "content-type": "application/json" };
        init.body = body ?? "{}";
      }

      const res = await fetch(url, init);
      const elapsed = performance.now() - started;
      samples.push(elapsed);
      if (!res.ok) failures.push(`${label}: HTTP ${res.status} (${elapsed.toFixed(1)}ms)`);
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { samples, failures };
}

async function main() {
  if (!COMPANY_ID) {
    console.error("perf-baseline: PERF_OPERATING_COMPANY_ID is required (uuid)");
    process.exit(1);
  }

  const endpoints = buildEndpoints(COMPANY_ID);
  const authHeaders = buildAuthHeaders();

  await mkdir(path.dirname(OUTPUT_REL), { recursive: true });

  const lines: string[] = [];
  lines.push("# Performance baseline — 2026-05-14");
  lines.push("");
  lines.push(`- Generated at (UTC): ${new Date().toISOString()}`);
  lines.push(`- Base URL: ${BASE_URL}`);
  lines.push(`- Runs per endpoint: ${RUNS} (sequential)`);
  lines.push(`- Slow threshold (documentation): p95 > ${SLOW_P95_MS}ms`);
  lines.push(`- Hard fail threshold (non-record mode): p95 > ${HARD_FAIL_P95_MS}ms`);
  lines.push(`- Auth: ${COOKIE_HEADER ? "PERF_COOKIE" : "legacy PERF_TEST_AUTH header (likely insufficient for prod)"}`);
  lines.push("");
  lines.push("| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) |");
  lines.push("|---|---:|---:|---:|---:|");

  const slow: string[] = [];
  const hardSlow: string[] = [];
  let failedHard = false;
  const allFailures: string[] = [];

  for (const ep of endpoints) {
    const url = `${BASE_URL}${ep.path}`;
    const headers = ep.auth ? authHeaders : {};
    const { samples, failures } = await measure(ep.label, url, headers, ep.method, ep.body);
    allFailures.push(...failures);

    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const p99 = percentile(sorted, 99);
    const max = sorted.length ? sorted[sorted.length - 1] ?? 0 : 0;

    if (p95 > SLOW_P95_MS) slow.push(`- ${ep.label}: p95=${p95.toFixed(1)}ms`);
    if (p95 > HARD_FAIL_P95_MS) hardSlow.push(`- ${ep.label}: p95=${p95.toFixed(1)}ms`);

    lines.push(`| ${ep.label} | ${p50.toFixed(1)} | ${p95.toFixed(1)} | ${p99.toFixed(1)} | ${max.toFixed(1)} |`);
  }

  lines.push("");
  lines.push(`## Endpoints exceeding ${SLOW_P95_MS}ms p95`);
  lines.push("");
  if (!slow.length) lines.push("- None observed.");
  else slow.forEach((l) => lines.push(l));

  lines.push("");
  lines.push("## Failures / non-2xx");
  lines.push("");
  if (!allFailures.length) lines.push("- None observed.");
  else allFailures.forEach((f) => lines.push(`- ${f}`));

  lines.push("");
  await writeFile(OUTPUT_REL, `${lines.join("\n")}\n`, "utf8");

  console.log(`[perf-baseline] wrote ${OUTPUT_REL}`);

  if (RECORD_ONLY) {
    console.warn("[perf-baseline] PERF_RECORD_ONLY enabled — exiting 0 regardless of failures/slow endpoints");
    process.exit(0);
  }

  if (allFailures.length) {
    console.error("[perf-baseline] FAIL: observed request failures (see markdown)");
    process.exit(1);
  }

  if (hardSlow.length) {
    failedHard = true;
    console.error(`[perf-baseline] FAIL: at least one endpoint exceeded hard threshold p95=${HARD_FAIL_P95_MS}ms`);
    hardSlow.forEach((l) => console.error(l));
  }

  if (failedHard) process.exit(1);
}

void main().catch((error) => {
  console.error("[perf-baseline] fatal:", error);
  process.exit(1);
});
