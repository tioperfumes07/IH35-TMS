#!/usr/bin/env node
// GAP-38 / G15 / WF-027 — CI guard for damage continuity + insurance auto-claim.
// Scope is ADDITIVE BACKEND ONLY. UI wiring lives on the locked shared
// SafetyIncidentsClusterSurface page and was intentionally NOT modified in this
// block (surfaced for preview), so this guard does not assert UI panels.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const migrationPath = "db/migrations/202606071600_damage_insurance_continuity.sql";
const migration = read(migrationPath);
contains(migrationPath, migration, [
  { pattern: /safety\.damage_continuity_chains/, label: "damage_continuity_chains table" },
  { pattern: /ADD COLUMN IF NOT EXISTS continuity_chain_id/, label: "incidents continuity_chain_id column" },
  { pattern: /ADD COLUMN IF NOT EXISTS auto_created_claim_id/, label: "incidents auto_created_claim_id column" },
  { pattern: /final_resolution_status/, label: "final_resolution_status tracking" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
  { pattern: /TO ih35_app/, label: "ih35_app grants" },
]);

const continuityService = "apps/backend/src/safety/damage-continuity/continuity.service.ts";
const continuityServiceSrc = read(continuityService);
contains(continuityService, continuityServiceSrc, [
  { pattern: /export async function startChain/, label: "startChain" },
  { pattern: /export async function appendDamage/, label: "appendDamage" },
  { pattern: /export async function closeChain/, label: "closeChain" },
  { pattern: /export async function getChain/, label: "getChain" },
  { pattern: /safety\.damage_continuity_chains/, label: "chain table query" },
]);

const insuranceLink = "apps/backend/src/safety/damage-continuity/insurance-link.service.ts";
const insuranceLinkSrc = read(insuranceLink);
contains(insuranceLink, insuranceLinkSrc, [
  { pattern: /AUTO_CLAIM_THRESHOLD_CENTS\s*=\s*100_?000/, label: "$1000 auto-claim threshold" },
  { pattern: /export async function autoCreateClaimFromDamage/, label: "autoCreateClaimFromDamage" },
  { pattern: /export async function linkClaimToChain/, label: "linkClaimToChain" },
  { pattern: /insurance\.claim/, label: "insurance.claim insert" },
  { pattern: /no_active_policy/, label: "no-policy safe skip" },
]);

const routes = "apps/backend/src/safety/damage-continuity/continuity.routes.ts";
const routesSrc = read(routes);
contains(routes, routesSrc, [
  { pattern: /\/api\/v1\/safety\/incidents\/:id\/start-continuity/, label: "start-continuity route" },
  { pattern: /\/api\/v1\/safety\/incidents\/:id\/link-to-chain/, label: "link-to-chain route" },
  { pattern: /\/api\/v1\/safety\/incidents\/:id\/continuity-chain/, label: "continuity-chain route" },
  { pattern: /\/api\/v1\/safety\/incidents\/:id\/auto-create-claim/, label: "auto-create-claim route" },
  { pattern: /registerDamageContinuityRoutes/, label: "route register export" },
]);

const worker = "apps/backend/src/jobs/damage-continuity-worker.ts";
const workerSrc = read(worker);
contains(worker, workerSrc, [
  { pattern: /initializeDamageContinuityWorker/, label: "worker init export" },
  { pattern: /runDamageContinuityTick/, label: "worker tick" },
  { pattern: /cron\.schedule/, label: "hourly cron schedule" },
  { pattern: /autoCreateClaimFromDamage/, label: "worker auto-claim assessment" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerDamageContinuityRoutes/, label: "routes wired in index" },
  { pattern: /initializeDamageContinuityWorker/, label: "worker wired in index" },
]);

read("apps/backend/src/safety/damage-continuity/__tests__/continuity.test.ts");

const docs = read("docs/specs/gap-38-damage-insurance-continuity.md");
contains("docs/specs/gap-38-damage-insurance-continuity.md", docs, [
  { pattern: /GAP-38/, label: "GAP-38 identifier" },
  { pattern: /WF-027/, label: "WF-027 citation" },
  { pattern: /G15/, label: "G15 citation" },
]);

if (failures.length > 0) {
  console.error("verify:damage-insurance-continuity — FAILED");
  for (const entry of failures) {
    console.error(`  x ${entry}`);
  }
  process.exit(1);
}

console.log("verify:damage-insurance-continuity — OK");
