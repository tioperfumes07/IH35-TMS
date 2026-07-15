#!/usr/bin/env node
// GOVERNANCE guard (FINAL-DEEP-DB-AUDIT §7b) — db/migrations/ is the ONE canonical migration source the runner
// scans. A migration .sql placed in a SECOND directory (apps/backend/src/migrations, apps/backend/migrations,
// apps/backend/prisma/migrations) is invisible to the runner + the file-based audit — the root cause of prod
// carrying ~254 tables the audit never saw. This guard is a downward RATCHET: the existing stray migrations are
// grandfathered (BASELINE) until they're consolidated into db/migrations, but NO NEW stray migration may be added.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Frozen set of pre-existing stray migration .sql files (2026-07-15). Grandfathered — consolidate into
// db/migrations, never grow. To REMOVE one after consolidation, delete it here too. To ADD one: don't — put
// the migration in db/migrations.
const BASELINE = new Set([
  "apps/backend/migrations/0167_p7_block_e_notif_prefs.sql",
  "apps/backend/prisma/migrations/0250_create_inventory_parts_table/migration.sql",
  "apps/backend/src/migrations/0392-auto-deductions.sql",
  "apps/backend/src/migrations/0393-settlement-disputes.sql",
  "apps/backend/src/migrations/0394-team-splits.sql",
  "apps/backend/src/migrations/0395-road-service-tickets.sql",
  "apps/backend/src/migrations/0396-archive-test-users.sql",
  "apps/backend/src/migrations/0403-onboarding-state.sql",
  "apps/backend/src/migrations/202606080241-payroll-integration-cache.sql",
  "apps/backend/src/migrations/202606080242-maintenance-parts-catalog.sql",
  "apps/backend/src/migrations/202606080243-maintenance-services-catalog.sql",
  "apps/backend/src/migrations/202606080244-usmca-activation-state.sql",
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules") continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (/\.sql$/i.test(e.name)) out.push(abs);
  }
  return out;
}

// Find every *.sql under an `apps/**/migrations/**` path, EXCLUDING migration TEST files (__tests__).
export function findStrayMigrations(rootDir = ROOT) {
  const appsDir = path.join(rootDir, "apps");
  return walk(appsDir)
    .map((abs) => path.relative(rootDir, abs).replace(/\\/g, "/"))
    .filter((rel) => /(^|\/)migrations\//.test(rel) && !/(^|\/)__tests__\//.test(rel));
}

export function run() {
  const failures = [];
  for (const rel of findStrayMigrations()) {
    if (!BASELINE.has(rel)) {
      failures.push(`${rel}: migration outside db/migrations/ — the runner will never apply it (invisible-migration drift). Put all migrations in db/migrations/.`);
    }
  }
  return failures;
}

function selfTest() {
  const strays = findStrayMigrations();
  // Every found stray must be in the baseline today (the guard is green on the current repo).
  const unexpected = strays.filter((s) => !BASELINE.has(s));
  console.log(`self-test: ${strays.length} stray .sql found, ${unexpected.length} not-baselined (want 0)`);
  // Prove the ratchet catches a NEW stray via the pure logic.
  const fakeNew = "apps/backend/src/migrations/9999-new-stray.sql";
  const wouldFail = !BASELINE.has(fakeNew);
  if (!wouldFail || unexpected.length !== 0) {
    console.error("self-test FAILED");
    process.exit(1);
  }
  console.log("self-test PASS");
}

function main() {
  if (process.argv.includes("--self-test")) { selfTest(); return; }
  const failures = run();
  if (failures.length) {
    console.error("\nFAIL verify-no-stray-migrations:");
    failures.forEach((f) => console.error(`  • ${f}`));
    process.exit(1);
  }
  console.log("\nPASS verify-no-stray-migrations — no new migration outside db/migrations/ (existing strays grandfathered).");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
