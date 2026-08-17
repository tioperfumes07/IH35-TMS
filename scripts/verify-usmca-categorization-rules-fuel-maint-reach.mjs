#!/usr/bin/env node
/**
 * FINDING: LV-USMCA-CATEGORIZATION-RULES-DEAD-PATTERNS — found live 2026-08-16 while performing the
 * assigned banking-deep live-verify of USMCA's Auto-Categorize Rules page. USMCA's only 2 active
 * banking.transaction_categories rows used patterns ("AUTO_MAINTENANCE", "FUEL") that are not a
 * substring of any element Plaid's real personal_finance_category taxonomy sends for USMCA's live
 * Bank of America feed (which uses GENERAL_SERVICES_AUTOMOTIVE / TRANSPORTATION_GAS /
 * TRANSPORTATION_PUBLIC_TRANSIT) — see scoreRuleMatch() in
 * apps/backend/src/integrations/plaid/plaid.service.ts. Live-measured: 51 of 160 (32%) of USMCA's
 * for-review backlog carried one of those 3 real categories and could never auto-categorize.
 *
 * FIX: db/migrations/202612720000_usmca_categorization_rules_fuel_maintenance_reach.sql adds 2 new
 * rows for USMCA — a leaf match on GENERAL_SERVICES_AUTOMOTIVE (Truck Repairs & Maintenance, 5400)
 * and a broad parent match on TRANSPORTATION (Fuel & Diesel, 5000) — reusing only the 2 accounts the
 * existing dead rules already pointed at. Mirrors TRANSP's own proven 202606280930 seed convention.
 *
 * Static check (always runs): the migration file exists, is USMCA-scoped only, references only the
 * 2 already-verified account UUIDs, and does not touch/delete the 2 pre-existing rows.
 *
 * Live check (opt-in): USMCA has active rules whose pattern set actually covers
 * GENERAL_SERVICES_AUTOMOTIVE and TRANSPORTATION (replicating the same substring-match scorer the
 * live code uses) — catching a regression if the rows are ever deactivated/deleted without a
 * replacement, or if a future migration edits their patterns back to a dead string.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-usmca-categorization-rules-fuel-maint-reach";
const MIGRATION_REL = "db/migrations/202612720000_usmca_categorization_rules_fuel_maintenance_reach.sql";
const FUEL_ACCOUNT_ID = "353fbd5b-d39c-4709-ac19-60cae52018f7"; // USMCA 5000 Fuel & Diesel
const MAINT_ACCOUNT_ID = "8fe4f37c-39ae-48df-a0f9-f43489f3df5d"; // USMCA 5400 Truck Repairs & Maintenance

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertMigrationShape(migrationSource) {
  const errors = [];
  if (!migrationSource.includes("c.code = 'USMCA'")) {
    errors.push("migration is not scoped to c.code = 'USMCA'");
  }
  if (!migrationSource.includes("GENERAL_SERVICES_AUTOMOTIVE")) {
    errors.push("missing the GENERAL_SERVICES_AUTOMOTIVE leaf pattern");
  }
  if (!migrationSource.includes("'TRANSPORTATION'")) {
    errors.push("missing the TRANSPORTATION parent pattern");
  }
  if (!migrationSource.includes(FUEL_ACCOUNT_ID)) {
    errors.push("does not reference the verified USMCA Fuel & Diesel account id");
  }
  if (!migrationSource.includes(MAINT_ACCOUNT_ID)) {
    errors.push("does not reference the verified USMCA Truck Repairs & Maintenance account id");
  }
  if (/DELETE\s+FROM\s+banking\.transaction_categories/i.test(migrationSource)) {
    errors.push("migration deletes from banking.transaction_categories — must be additive only");
  }
  if (/UPDATE\s+banking\.transaction_categories/i.test(migrationSource)) {
    errors.push("migration updates existing banking.transaction_categories rows — must be additive only");
  }
  return errors;
}

function selftest() {
  const problems = [];
  const live = read(MIGRATION_REL);

  const liveErrors = assertMigrationShape(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    ["USMCA scope removed", live.replace(/c\.code = 'USMCA'/g, "c.code = 'TRANSP'"), "not scoped to c.code = 'USMCA'"],
    ["GENERAL_SERVICES_AUTOMOTIVE pattern removed", live.replace(/GENERAL_SERVICES_AUTOMOTIVE/g, "SOMETHING_ELSE"), "missing the GENERAL_SERVICES_AUTOMOTIVE"],
    ["TRANSPORTATION pattern removed", live.replace(/'TRANSPORTATION'/g, "'SOMETHING_ELSE'"), "missing the TRANSPORTATION parent"],
    ["fuel account id swapped", live.replace(new RegExp(FUEL_ACCOUNT_ID, "g"), "00000000-0000-0000-0000-000000000000"), "verified USMCA Fuel"],
    ["maint account id swapped", live.replace(new RegExp(MAINT_ACCOUNT_ID, "g"), "00000000-0000-0000-0000-000000000000"), "verified USMCA Truck Repairs"],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertMigrationShape(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — migration shape clean; ${cases.length} planted regressions caught`);
}

async function liveScan() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live scan did NOT run`);
    return;
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    const results = await client.query(
      `
        SELECT set_config('app.bypass_rls', 'lucia', true);
        SELECT
          bool_or(tc.plaid_category_pattern = 'GENERAL_SERVICES_AUTOMOTIVE') AS has_automotive_leaf,
          bool_or(tc.plaid_category_pattern = 'TRANSPORTATION') AS has_transportation_parent
        FROM banking.transaction_categories tc
        JOIN org.companies c ON c.id = tc.operating_company_id
        WHERE c.code = 'USMCA' AND tc.is_active = true;
      `
    );
    const res = Array.isArray(results) ? results[results.length - 1] : results;
    const row = res.rows[0] ?? {};

    const errors = [];
    if (!row.has_automotive_leaf) errors.push("USMCA has no active GENERAL_SERVICES_AUTOMOTIVE rule (truck-maintenance auto-categorize is dead again)");
    if (!row.has_transportation_parent) errors.push("USMCA has no active TRANSPORTATION rule (fuel auto-categorize is dead again)");

    if (errors.length) {
      console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  console.log(`${LABEL} — OK`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertMigrationShape(read(MIGRATION_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }

  await liveScan();
}

main().catch((error) => {
  console.error(`${LABEL} FAILED\n- ${String(error?.message ?? error)}`);
  process.exit(1);
});
