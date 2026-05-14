/**
 * Performance baseline smoke (Block E — P7-PERF-BASELINE).
 *
 * Fires 10 sequential GETs per endpoint and records simple latency percentiles.
 *
 * Prerequisites:
 * - API reachable at PERF_BASE_URL (default http://127.0.0.1:3000)
 * - PERF_OPERATING_COMPANY_ID set to a real UUID your auth user can access
 * - Auth via PERF_COOKIE (preferred for prod) OR PERF_TEST_AUTH (+ PERF_TEST_USER_ID / PERF_TEST_ROLE)
 *
 * Notes:
 * - `GET /api/v1/reports/cash-flow` is not registered; this script uses `/api/v1/reports/cash-flow-overview`.
 * - `GET /api/v1/banking/bank-accounts` is not registered; this script uses `/api/v1/banking/accounts/all`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = (process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const COMPANY_ID = process.env.PERF_OPERATING_COMPANY_ID?.trim();
const COOKIE_HEADER = process.env.PERF_COOKIE?.trim();

const TEST_USER_ID = process.env.PERF_TEST_USER_ID?.trim() ?? "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const TEST_ROLE = process.env.PERF_TEST_ROLE?.trim() ?? "Owner";

const P95_THRESHOLD_MS = 2000;
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

function monthWindowUtc(reference = new Date()): { period_start: string; period_end: string; as_of: string } {
  const as_of = reference.toISOString().slice(0, 10);
  const monthStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const period_start = monthStart.toISOString().slice(0, 10);
  const period_end = as_of;
  return { period_start, period_end, as_of };
}

type Endpoint = { label: string; path: string; auth: boolean };

function buildEndpoints(companyId: string): Endpoint[] {
  const { period_start, period_end, as_of } = monthWindowUtc();

  const qs = new URLSearchParams({ operating_company_id: companyId });

  return [
    { label: "GET /api/v1/_healthcheck", path: "/api/v1/_healthcheck", auth: false },
    { label: "GET /api/v1/qbo/sync/health", path: `/api/v1/qbo/sync/health?${qs.toString()}`, auth: true },
    { label: "GET /api/v1/scheduled-reports", path: `/api/v1/scheduled-reports?${qs.toString()}`, auth: true },
    {
      label: "GET /api/v1/banking/transactions/uncategorized",
      path: `/api/v1/banking/transactions/uncategorized?operating_company_id=${encodeURIComponent(companyId)}&limit=25`,
      auth: true,
    },
    {
      label: "GET /api/v1/reports/ar-aging",
      path: `/api/v1/reports/ar-aging?operating_company_id=${encodeURIComponent(companyId)}&as_of_date=${encodeURIComponent(as_of)}`,
      auth: true,
    },
    {
      label: "GET /api/v1/reports/profit-per-truck",
      path: `/api/v1/reports/profit-per-truck?operating_company_id=${encodeURIComponent(
        companyId
      )}&period_start=${encodeURIComponent(period_start)}&period_end=${encodeURIComponent(period_end)}`,
      auth: true,
    },
    {
      label: "GET /api/v1/reports/cash-flow-overview (alias: cash-flow)",
      path: `/api/v1/reports/cash-flow-overview?operating_company_id=${encodeURIComponent(
        companyId
      )}&as_of_date=${encodeURIComponent(as_of)}`,
      auth: true,
    },
    {
      label: "GET /api/v1/dispatch/loads",
      path: `/api/v1/dispatch/loads?operating_company_id=${encodeURIComponent(companyId)}&limit=25&offset=0&view=loads`,
      auth: true,
    },
    {
      label: "GET /api/v1/driver-finance/settlements",
      path: `/api/v1/driver-finance/settlements?operating_company_id=${encodeURIComponent(companyId)}&limit=25&offset=0`,
      auth: true,
    },
    {
      label: "GET /api/v1/banking/accounts/all (alias: bank-accounts)",
      path: `/api/v1/banking/accounts/all?operating_company_id=${encodeURIComponent(companyId)}`,
      auth: true,
    },
  ];
}

async function measure(label: string, url: string, headers: Record<string, string>): Promise<{ samples: number[]; failures: string[] }> {
  const samples: number[] = [];
  const failures: string[] = [];

  for (let i = 0; i < RUNS; i += 1) {
    const started = performance.now();
    try {
      const res = await fetch(url, { headers });
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
  lines.push(`- Alert threshold: p95 ≤ ${P95_THRESHOLD_MS}ms`);
  lines.push("");
  lines.push("## Endpoint mappings");
  lines.push("");
  lines.push("- Spec listed `GET /api/v1/reports/cash-flow` → measured `/api/v1/reports/cash-flow-overview`.");
  lines.push("- Spec listed `GET /api/v1/banking/bank-accounts` → measured `/api/v1/banking/accounts/all`.");
  lines.push("");

  lines.push("| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) |");
  lines.push("|---|---:|---:|---:|---:|");

  let failedThreshold = false;
  const allFailures: string[] = [];

  for (const ep of endpoints) {
    const url = `${BASE_URL}${ep.path}`;
    const headers = ep.auth ? authHeaders : {};
    const { samples, failures } = await measure(ep.label, url, headers);
    allFailures.push(...failures);

    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const p99 = percentile(sorted, 99);
    const max = sorted.length ? sorted[sorted.length - 1] ?? 0 : 0;

    if (p95 > P95_THRESHOLD_MS) failedThreshold = true;

    lines.push(`| ${ep.label} | ${p50.toFixed(1)} | ${p95.toFixed(1)} | ${p99.toFixed(1)} | ${max.toFixed(1)} |`);
  }

  lines.push("");
  lines.push("## Failures / non-2xx");
  lines.push("");
  if (!allFailures.length) lines.push("- None observed.");
  else allFailures.forEach((f) => lines.push(`- ${f}`));

  lines.push("");
  await writeFile(OUTPUT_REL, `${lines.join("\n")}\n`, "utf8");

  console.log(`[perf-baseline] wrote ${OUTPUT_REL}`);
  if (failedThreshold) {
    console.error(`[perf-baseline] FAIL: at least one authenticated endpoint exceeded p95=${P95_THRESHOLD_MS}ms`);
    process.exit(1);
  }
  if (allFailures.length) {
    console.error("[perf-baseline] FAIL: observed request failures (see markdown)");
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error("[perf-baseline] fatal:", error);
  process.exit(1);
});
