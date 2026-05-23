#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const servicePath = path.join(repoRoot, "apps/backend/src/accounting/payments/apply.service.ts");
const migrationPath = path.join(repoRoot, "db/migrations/0222_block_34_payment_application_engine.sql");

function fail(messages) {
  console.error("verify:payment-application-tenant-chain — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];

if (!fs.existsSync(servicePath)) {
  failures.push("missing apps/backend/src/accounting/payments/apply.service.ts");
} else {
  const source = fs.readFileSync(servicePath, "utf8");
  if (!/set_config\('app\.operating_company_id'/.test(source)) {
    failures.push("apply.service must set app.operating_company_id inside request scope");
  }
  if (!/FROM accounting\.payments[\s\S]*operating_company_id = \$2::uuid/.test(source)) {
    failures.push("apply.service payment lock query must filter by operating_company_id");
  }
  if (!/FROM accounting\.invoices[\s\S]*operating_company_id = \$2::uuid/.test(source)) {
    failures.push("apply.service invoice query must filter by operating_company_id");
  }
  if (!/FROM accounting\.bills[\s\S]*operating_company_id = \$2::uuid/.test(source)) {
    failures.push("apply.service bill query must filter by operating_company_id");
  }
  if (!/INSERT INTO accounting\.payment_applications/.test(source)) {
    failures.push("apply.service must persist applications into accounting.payment_applications");
  }
}

if (!fs.existsSync(migrationPath)) {
  failures.push("missing db/migrations/0222_block_34_payment_application_engine.sql");
} else {
  const migration = fs.readFileSync(migrationPath, "utf8");
  if (!/CREATE TABLE IF NOT EXISTS accounting\.vendor_credits/.test(migration)) {
    failures.push("migration must create accounting.vendor_credits for AP overpayments");
  }
  if (!/target_kind/.test(migration) || !/target_id/.test(migration)) {
    failures.push("migration must add target_kind/target_id columns to accounting.payment_applications");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:payment-application-tenant-chain — OK");
