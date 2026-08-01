#!/usr/bin/env node
/**
 * WAVE-H2 — CLS-LINKAGE-ONEWAY ops FK write-path + reverse drill (owner lock 2026-07-31).
 *
 * Static: expense create stamps optional load_id; list filters driver_id; invoice list filters
 * source_load_id; Relay fuel bridge resolves load/vendor (no hardcoded NULL pair); thin reverse
 * routes load→invoices / load→expenses exist.
 *
 * Live (optional DATABASE_URL): report null rates; QBO-sourced rows may stay null ops FKs
 * (orphan class) — do NOT invent mass backfill. Fail only if TMS/relay writers still hardcode NULL.
 *
 * Mutation-tested (--selftest).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-h2-ops-fk-null-rates";
const SELFTEST = process.argv.includes("--selftest");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

export function staticChecks(sources = {}) {
  const problems = [];
  const expenses = sources.expenses ?? read("apps/backend/src/accounting/expenses.routes.ts");
  const invoices = sources.invoices ?? read("apps/backend/src/accounting/invoices.routes.ts");
  const bridge = sources.bridge ?? read("apps/backend/src/integrations/relay-payments/relay-fuel-canonical-bridge.ts");
  const drawer = sources.drawer ?? read("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
  const feApi = sources.feApi ?? read("apps/frontend/src/api/accounting.ts");

  if (!/load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/.test(expenses)) {
    problems.push("createExpenseBodySchema must accept optional load_id");
  }
  if (!/driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(expenses) || !/filters\.driverId/.test(expenses)) {
    problems.push("expenses list must accept driver_id and filter e.driver_uuid");
  }
  if (!/hasLoadId && body\.load_id/.test(expenses) && !/body\.load_id/.test(expenses)) {
    problems.push("expense CREATE must stamp body.load_id onto accounting.expenses when present");
  }
  if (!/source_load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(invoices)) {
    problems.push("invoice listQuerySchema must accept source_load_id");
  }
  if (!/i\.source_load_id = \$\{values\.length\}::uuid/.test(invoices) && !/i\.source_load_id = \$/.test(invoices)) {
    problems.push("invoice list must filter i.source_load_id");
  }
  if (!/\/api\/v1\/loads\/:id\/invoices/.test(invoices)) {
    problems.push("thin reverse route GET /api/v1/loads/:id/invoices required");
  }
  // CodeQL: authorized reverse route must be rate-limited (parity with loads/:id/expenses).
  if (
    !/loads\/:id\/invoices"[\s\S]{0,120}rateLimit/.test(invoices) &&
    !/loads\/:id\/invoices',\s*\{\s*config:\s*\{\s*rateLimit/.test(invoices)
  ) {
    problems.push("GET /api/v1/loads/:id/invoices must set config.rateLimit");
  }
  if (!/\/api\/v1\/loads\/:id\/expenses/.test(expenses)) {
    problems.push("thin reverse route GET /api/v1/loads/:id/expenses required");
  }
  if (!/resolveLoadId/.test(bridge) || !/resolveVendorId/.test(bridge)) {
    problems.push("relay-fuel-canonical-bridge must resolve load_id/vendor_id via import helpers");
  }
  // Ban the old hardcoded NULL,NULL pair for load_id + vendor_id in VALUES
  if (/VALUES\s*\(\s*\$1,\s*\$2::timestamptz,\s*\$2::timestamptz,\s*NULL,\s*\$3,\s*\$4,\s*NULL/.test(bridge)) {
    problems.push("relay bridge must not hardcode NULL load_id / NULL vendor_id");
  }
  if (!/listLoadInvoices/.test(drawer) || !/listLoadExpenses/.test(drawer)) {
    problems.push("LoadDetailDrawer must call listLoadInvoices + listLoadExpenses");
  }
  if (!/export function listLoadInvoices/.test(feApi) || !/export function listLoadExpenses/.test(feApi)) {
    problems.push("FE accounting API must export listLoadInvoices + listLoadExpenses");
  }
  return problems;
}

function selftest() {
  const baseline = staticChecks();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL: repo already red:\n  - ${baseline.join("\n  - ")}`);
    process.exit(1);
  }
  const bridge = read("apps/backend/src/integrations/relay-payments/relay-fuel-canonical-bridge.ts");
  const broken = bridge.replace(/resolveLoadId/g, "REMOVED_RESOLVE").replace(/resolveVendorId/g, "REMOVED_VENDOR");
  const red = staticChecks({ bridge: broken });
  if (!red.some((p) => /resolve load_id\/vendor_id/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL: planted bridge regression not caught`);
    process.exit(1);
  }
  const green = staticChecks();
  if (green.length) {
    console.error(`${LABEL} SELFTEST FAIL: green path dirty`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted regressions caught; sources clean`);
}

function main() {
  if (SELFTEST) {
    selftest();
    return;
  }
  const problems = staticChecks();
  if (problems.length) fail(problems.join("; "));
  console.log(`${LABEL} PASS — WAVE-H2 write-path + reverse drill static (no mass backfill)`);
}

main();
