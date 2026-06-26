#!/usr/bin/env node
/**
 * verify-per-truck-cpm-no-phantom.mjs — PER-TRUCK-CPM-500-FIX regression guard.
 *
 * The Per-Truck CPM report 500'd (Postgres 42P01) because cpm-calculator.service.ts queried
 * insurance.insurance_policy_units / insurance.insurance_policies — relations that exist in NO migration.
 * This static guard asserts those phantom relations never reappear in the CPM query, so the endpoint
 * cannot regress to a missing-relation 500 (i.e. it stays 200). Pure static (no DB) — always runs in CI,
 * no Postgres/flakiness. Live HTTP-200 is re-verified by GUARD; this is the durable lock.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SVC = path.join(ROOT, "apps/backend/src/reports/per-truck-cpm/cpm-calculator.service.ts");

// Phantom relations that caused the 42P01 500 — must never appear in EXECUTABLE SQL again.
// (The real insurance schema is insurance.policy / insurance.policy_unit — asset-keyed; see the
//  follow-up block docs/blocks/PER-TRUCK-INSURANCE-COST-FOLLOWUP.md.)
const PHANTOM = [/\binsurance\.insurance_policy_units\b/i, /\binsurance\.insurance_policies\b/i];

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])--[^\n]*/g, "$1 ");
}

function main() {
  if (!fs.existsSync(SVC)) {
    console.error(`[per-truck-cpm-no-phantom] FAIL — service not found: ${path.relative(ROOT, SVC)}`);
    process.exit(1);
  }
  const code = stripComments(fs.readFileSync(SVC, "utf8"));
  const hits = PHANTOM.filter((re) => re.test(code)).map((re) => re.source);
  if (hits.length === 0) {
    console.log("[per-truck-cpm-no-phantom] PASS — no phantom insurance relations in the CPM query (endpoint stays 200).");
    process.exit(0);
  }
  console.error("\nPER-TRUCK-CPM PHANTOM-RELATION GUARD FAILED");
  console.error("=".repeat(60));
  console.error("cpm-calculator.service.ts references a relation that exists in NO migration (would 42P01/500):");
  for (const h of hits) console.error(`  - ${h}`);
  console.error("Use the real insurance schema (insurance.policy / insurance.policy_unit, asset-keyed) per");
  console.error("docs/blocks/PER-TRUCK-INSURANCE-COST-FOLLOWUP.md, or keep insurance degraded to 0.");
  console.error("=".repeat(60));
  process.exit(1);
}
main();
