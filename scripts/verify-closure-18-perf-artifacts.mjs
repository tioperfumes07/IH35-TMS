#!/usr/bin/env node
/** CLOSURE-18 CI guard — PERF audit artifacts present. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-closure-18-perf-artifacts";
const REQUIRED = [
  "docs/audits/PERF-AUDIT-2026-06-05.md",
  "docs/perf-budgets.json",
  "scripts/perf-bundle-size-snapshot.mjs",
  "scripts/perf-lighthouse-on-prod.mjs",
  "scripts/perf-api-latency-baseline.mjs",
  "scripts/verify-perf-budgets-not-regressed.mjs",
  "apps/backend/src/middleware/response-time.ts",
  "apps/backend/src/middleware/response-time.test.ts",
  ".github/workflows/perf-budget-check.yml",
  ".block-ready/CLOSURE-18-PERF-AUDIT.json",
];
for (const rel of REQUIRED) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`[${LABEL}] FAIL missing ${rel}`);
    process.exit(1);
  }
}
console.log(`[${LABEL}] PASS (${REQUIRED.length} artifacts)`);
