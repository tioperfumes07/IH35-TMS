#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const servicePath = path.join(repoRoot, "apps/backend/src/accounting/bank-recon/match.service.ts");
const migrationPath = path.join(repoRoot, "db/migrations/0219_block_29_bank_reconciliation_matches.sql");
// SWEEP-C2 / BANK-DOM-01 — the canonical replacement (HELD, not yet Neon-applied).
const canonicalMigrationPath = path.join(
  repoRoot,
  "db/migrations/202609020010_c2_banking_reconciliation_matches_canonical.sql"
);

function fail(messages) {
  console.error("verify:bank-recon-match-tenant-scope — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];

if (!fs.existsSync(servicePath)) {
  failures.push("missing apps/backend/src/accounting/bank-recon/match.service.ts");
} else {
  const source = fs.readFileSync(servicePath, "utf8");
  if (!/set_config\('app\.operating_company_id'/.test(source)) {
    failures.push("match.service must set app.operating_company_id in withLuciaBypass scope");
  }
  if (!/FROM banking\.bank_transactions[\s\S]*operating_company_id = \$2::uuid/.test(source)) {
    failures.push("match.service transaction lookup must filter by operating_company_id");
  }
  // SWEEP-C2 (2026-09-02): bank.reconciliation_matches is RETIRE; the write path was repointed to
  // the canonical banking.reconciliation_matches (created by HELD migration
  // 202609020010_c2_banking_reconciliation_matches_canonical.sql / BANK-DOM-01). bank.* stays
  // archive-only per Rule 07 — this guard now checks the live write target, not the legacy one.
  if (!/INSERT INTO banking\.reconciliation_matches/.test(source)) {
    failures.push("match.service must persist results in banking.reconciliation_matches");
  }
}

if (!fs.existsSync(migrationPath)) {
  failures.push("missing 0219 migration for bank.reconciliation_matches");
} else {
  const migration = fs.readFileSync(migrationPath, "utf8");
  if (!/CREATE TABLE IF NOT EXISTS bank\.reconciliation_matches/.test(migration)) {
    failures.push("migration must create bank.reconciliation_matches");
  }
  if (!/ENABLE ROW LEVEL SECURITY/.test(migration)) {
    failures.push("reconciliation_matches table must enable RLS");
  }
  if (!/current_setting\('app\.operating_company_id', true\)/.test(migration)) {
    failures.push("reconciliation_matches RLS policy must use app.operating_company_id");
  }
}

if (!fs.existsSync(canonicalMigrationPath)) {
  failures.push("missing 202609020010 HELD migration for canonical banking.reconciliation_matches");
} else {
  const canonical = fs.readFileSync(canonicalMigrationPath, "utf8");
  if (!/CREATE TABLE IF NOT EXISTS banking\.reconciliation_matches/.test(canonical)) {
    failures.push("canonical migration must create banking.reconciliation_matches");
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(canonical)) {
    failures.push("canonical banking.reconciliation_matches must FORCE row level security");
  }
  if (!/current_setting\('app\.operating_company_id', true\)/.test(canonical)) {
    failures.push("canonical banking.reconciliation_matches RLS policy must use app.operating_company_id");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:bank-recon-match-tenant-scope — OK");
