#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const servicePath = path.join(repoRoot, "apps/backend/src/accounting/bank-recon/match.service.ts");
const migrationPath = path.join(repoRoot, "db/migrations/0219_block_29_bank_reconciliation_matches.sql");

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
  if (!/INSERT INTO bank\.reconciliation_matches/.test(source)) {
    failures.push("match.service must persist results in bank.reconciliation_matches");
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

if (failures.length > 0) fail(failures);
console.log("verify:bank-recon-match-tenant-scope — OK");
