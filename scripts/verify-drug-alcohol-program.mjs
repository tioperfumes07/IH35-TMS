#!/usr/bin/env node
/**
 * CI Guard: verify-drug-alcohol-program.mjs — GAP-81
 * Verifies all required files for the Drug & Alcohol Program module are present
 * and contain key structural markers.
 * Exit 0 = OK, Exit 1 = FAILED (blocks merge).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const failures = [];

function fail(msg) {
  failures.push(msg);
}

function checkExists(relativePath) {
  const abs = path.join(ROOT, relativePath);
  if (!fs.existsSync(abs)) {
    fail(`MISSING: ${relativePath}`);
    return null;
  }
  return fs.readFileSync(abs, "utf8");
}

function checkContains(relativePath, content, patterns) {
  if (!content) return;
  for (const { pattern, label } of patterns) {
    const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    if (!re.test(content)) {
      fail(`${relativePath}: missing ${label}`);
    }
  }
}

// ─── Migration ───────────────────────────────────────────────────────────────

const migration = checkExists("db/migrations/0327_drug_alcohol_program.sql");
checkContains("db/migrations/0327_drug_alcohol_program.sql", migration, [
  { pattern: /safety\.da_program_enrollments/, label: "da_program_enrollments table" },
  { pattern: /safety\.da_test_records/, label: "da_test_records table" },
  { pattern: /safety\.da_random_pool_draws/, label: "da_random_pool_draws table" },
  { pattern: /GRANT SELECT, INSERT, UPDATE/, label: "app_user GRANT" },
  { pattern: /pre_employment.*random.*post_accident/s, label: "all FMCSA test types in CHECK" },
]);

// ─── Backend services ─────────────────────────────────────────────────────────

const programSvc = checkExists("apps/backend/src/safety/drug-alcohol/program.service.ts");
checkContains("apps/backend/src/safety/drug-alcohol/program.service.ts", programSvc, [
  { pattern: /enrollDriver/, label: "enrollDriver function" },
  { pattern: /scheduleTest/, label: "scheduleTest function" },
  { pattern: /recordResult/, label: "recordResult function" },
  { pattern: /flagPositive/, label: "flagPositive (SAP referral) function" },
]);

const poolSvc = checkExists("apps/backend/src/safety/drug-alcohol/random-pool.service.ts");
checkContains("apps/backend/src/safety/drug-alcohol/random-pool.service.ts", poolSvc, [
  { pattern: /cryptoShuffle/, label: "cryptoShuffle (crypto-randomness)" },
  { pattern: /randomBytes/, label: "node:crypto randomBytes import" },
  { pattern: /drawRandomPool/, label: "drawRandomPool function" },
  { pattern: /computeDrawCounts/, label: "computeDrawCounts (10% minimums)" },
]);

const routes = checkExists("apps/backend/src/safety/drug-alcohol/routes.ts");
checkContains("apps/backend/src/safety/drug-alcohol/routes.ts", routes, [
  { pattern: /\/api\/safety\/drug-alcohol\/enrollments/, label: "enrollments routes" },
  { pattern: /\/api\/safety\/drug-alcohol\/tests/, label: "tests routes" },
  { pattern: /\/api\/safety\/drug-alcohol\/random-pool\/draw/, label: "random-pool draw route" },
  { pattern: /registerDrugAlcoholProgramRoutes/, label: "exported register function" },
]);

// ─── Tests ────────────────────────────────────────────────────────────────────

checkExists("apps/backend/src/safety/drug-alcohol/__tests__/program.test.ts");
checkExists("apps/backend/src/safety/drug-alcohol/__tests__/random-pool.test.ts");

// ─── Worker ───────────────────────────────────────────────────────────────────

const worker = checkExists("apps/backend/src/jobs/da-random-pool-draw-worker.ts");
checkContains("apps/backend/src/jobs/da-random-pool-draw-worker.ts", worker, [
  { pattern: /1,4,7,10/, label: "quarterly cron months (Jan/Apr/Jul/Oct)" },
  { pattern: /initializeDaRandomPoolDrawWorker/, label: "exported init function" },
  { pattern: /runDaRandomPoolDrawTick/, label: "exported tick function (testable)" },
]);

// ─── Frontend ─────────────────────────────────────────────────────────────────

const programTab = checkExists("apps/frontend/src/pages/safety/drug-alcohol/DrugAlcoholProgramTab.tsx");
checkContains("apps/frontend/src/pages/safety/drug-alcohol/DrugAlcoholProgramTab.tsx", programTab, [
  { pattern: /DrugAlcoholProgramTab/, label: "DrugAlcoholProgramTab export" },
  { pattern: /Consortium Enrollment/, label: "enrollment roster section" },
  { pattern: /Positive Results/, label: "SAP referral queue section" },
  { pattern: /TestSchedulingPanel/, label: "TestSchedulingPanel composition" },
  { pattern: /RandomPoolDashboard/, label: "RandomPoolDashboard composition" },
]);

checkExists("apps/frontend/src/pages/safety/drug-alcohol/TestSchedulingPanel.tsx");
checkExists("apps/frontend/src/pages/safety/drug-alcohol/RandomPoolDashboard.tsx");

const poolDash = checkExists("apps/frontend/src/pages/safety/drug-alcohol/RandomPoolDashboard.tsx");
checkContains("apps/frontend/src/pages/safety/drug-alcohol/RandomPoolDashboard.tsx", poolDash, [
  { pattern: /FMCSA/, label: "FMCSA minimum reference" },
  { pattern: /random-pool\/draw/, label: "random pool draw API call" },
]);

// ─── Block manifest ───────────────────────────────────────────────────────────

const manifest = checkExists(".block-ready.json");
checkContains(".block-ready.json", manifest, [
  { pattern: /GAP-81-DRUG-ALCOHOL-PROGRAM/, label: "block_id GAP-81-DRUG-ALCOHOL-PROGRAM" },
]);

// ─── Result ───────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error("verify:drug-alcohol-program — FAILED");
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exit(1);
}

console.log("verify:drug-alcohol-program — OK");
console.log(`  ✓ Migration 0327 (safety.da_program_enrollments, da_test_records, da_random_pool_draws)`);
console.log(`  ✓ Backend services: program.service.ts, random-pool.service.ts, routes.ts`);
console.log(`  ✓ Worker: da-random-pool-draw-worker.ts (Jan/Apr/Jul/Oct quarterly)`);
console.log(`  ✓ Tests: program.test.ts, random-pool.test.ts`);
console.log(`  ✓ Frontend: DrugAlcoholProgramTab, TestSchedulingPanel, RandomPoolDashboard`);
console.log(`  ✓ Block manifest present`);
