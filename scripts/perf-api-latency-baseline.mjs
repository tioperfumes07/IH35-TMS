#!/usr/bin/env node
/**
 * CLOSURE-18-PERF-AUDIT — API latency baseline (p50/p95/p99) for hot-path endpoints.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "perf-api-latency-baseline";
const BUDGETS_PATH = path.join(ROOT, "docs/perf-budgets.json");

const ENDPOINTS = [
  "/api/v1/home/dashboard",
  "/api/v1/loads",
  "/api/v1/drivers",
  "/api/v1/vehicles",
  "/api/v1/customers",
  "/api/v1/vendors",
  "/api/v1/accounting/bills",
  "/api/v1/accounting/invoices",
  "/api/v1/banking/accounts",
  "/api/v1/banking/transactions",
  "/api/v1/reports/balance-sheet",
  "/api/v1/reports/profit-loss",
  "/api/v1/maintenance/dashboard/kpis",
  "/api/v1/qbo/sync-status",
  "/api/v1/notifications",
];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
  };
}

async function probeEndpoint(baseUrl, endpoint, cookie, iterations) {
  const samples = [];
  const url = `${baseUrl}${endpoint}`;
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    try {
      const res = await fetch(url, {
        headers: cookie ? { cookie } : {},
        redirect: "manual",
      });
      await res.arrayBuffer().catch(() => null);
      if (res.status === 401 || res.status === 403) {
        return null;
      }
    } catch {
      return null;
    }
    samples.push(performance.now() - start);
  }
  return summarize(samples);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function main() {
  const baseUrl = (process.env.API_BASE_URL ?? process.env.BACKEND_BASE_URL ?? "").replace(/\/$/, "");
  const cookie = process.env.VERIFY_SESSION_COOKIE ?? "";
  const iterations = Number(process.env.PERF_API_ITERATIONS ?? 10);
  const budgets = readJson(BUDGETS_PATH);

  if (!baseUrl || !cookie) {
    console.log(`[${LABEL}] SKIP live probe (set API_BASE_URL + VERIFY_SESSION_COOKIE)`);
    console.log(`[${LABEL}] using committed baseline in perf-budgets.json (${Object.keys(budgets.api_latency_ms ?? {}).length} endpoints)`);
    return;
  }

  const results = {};
  for (const endpoint of ENDPOINTS) {
    const stats = await probeEndpoint(baseUrl, endpoint, cookie, iterations);
    if (!stats) {
      console.warn(`[${LABEL}] WARN: probe failed for ${endpoint}`);
      continue;
    }
    results[endpoint] = stats;
    console.log(`[${LABEL}] ${endpoint} p50=${stats.p50} p95=${stats.p95} p99=${stats.p99}`);
  }

  if (Object.keys(results).length > 0) {
    budgets.api_latency_ms = { ...budgets.api_latency_ms, ...results };
    budgets.snapshot_date = new Date().toISOString().slice(0, 10);
    writeJson(BUDGETS_PATH, budgets);
  }
  console.log(`[${LABEL}] OK`);
}

main().catch((err) => {
  console.error(`[${LABEL}] FAIL:`, err);
  process.exit(1);
});
