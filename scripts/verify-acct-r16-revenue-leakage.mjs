#!/usr/bin/env node
/**
 * Guard 1498 — ACCT-R-16 revenue leakage / unbilled tracking surface.
 * Rule 17: verify-steps only.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) throw new Error(`missing ${rel}`);
  return readFileSync(p, "utf8");
}

function assertIncludes(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error(`${label}: expected ${JSON.stringify(needle)}`);
}

function selftest() {
  assertIncludes("acct-r16-ok", "acct-r16-ok", "selftest");
  console.log("verify-acct-r16-revenue-leakage: selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const svc = read("apps/backend/src/accounting/revenue-leakage.service.ts");
  assertIncludes(svc, "export async function getRevenueLeakage", "service export");
  assertIncludes(svc, "missing_earn", "missing earn gap");
  assertIncludes(svc, "earn_missing_bill", "earn missing bill gap");
  assertIncludes(svc, "load_revenue_recognition_postings", "canonical latch table");

  const routes = read("apps/backend/src/accounting/revenue-recognition.routes.ts");
  assertIncludes(routes, "/api/v1/accounting/revenue-leakage", "route path");
  assertIncludes(routes, "getRevenueLeakage", "route calls service");

  const api = read("apps/frontend/src/api/revenue-recognition.ts");
  assertIncludes(api, "getRevenueLeakage", "FE api client");
  assertIncludes(api, "/api/v1/accounting/revenue-leakage", "FE path");

  const page = read("apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx");
  assertIncludes(page, "revenue-leakage-panel", "UI panel testid");
  assertIncludes(page, "LeakagePanel", "LeakagePanel component");
  assertIncludes(page, "getRevenueLeakage", "page fetches leakage");

  const step = read("scripts/verify-steps/1498-verify-acct-r16-revenue-leakage.mjs");
  assertIncludes(step, "verify-acct-r16-revenue-leakage", "verify-step wired");

  const json = read("docs/module-completion/accounting.json");
  assertIncludes(json, '"id": "ACCT-R-16"', "scoreboard leaf");
  assertIncludes(json, '"status": "PASS"', "has PASS items");

  console.log("verify-acct-r16-revenue-leakage: PASS");
}

try {
  main();
} catch (err) {
  console.error("verify-acct-r16-revenue-leakage: FAIL", err?.message ?? err);
  process.exit(1);
}
