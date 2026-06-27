#!/usr/bin/env node
// verify-catalogs-accounts-entity-scope.mjs — entity-independence regression guard for catalogs.accounts
// (MULTI-ENTITY-SEPARATION intent). Once AF-1 lands, catalogs.accounts MUST stay per-entity: composite
// UNIQUEs on (operating_company_id, account_number) + (operating_company_id, qbo_account_id), entity-scoped
// RLS, operating_company_id NOT NULL — and NO migration may re-introduce a GLOBAL unique on account_number
// or qbo_account_id alone. Static (no DB): asserts the migration set encodes per-entity scope and never
// regresses it. Passes as a no-op until the AF-1 migration is present (so it does not fail pre-AF-1 main).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = path.join(ROOT, "db/migrations");
const files = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const blob = files.map((f) => fs.readFileSync(path.join(MIG, f), "utf8")).join("\n");

// Is AF-1 (the per-entity migration) present yet?
const af1Present =
  /uq_accounts_company_account_number/.test(blob) &&
  /uq_accounts_company_qbo_account_id/.test(blob);

if (!af1Present) {
  console.log("[catalogs-accounts-entity-scope] SKIP — AF-1 per-entity migration not present yet (pre-AF-1).");
  process.exit(0);
}

const errs = [];
// 1) composite uniques defined
if (!/UNIQUE INDEX[^\n]*uq_accounts_company_account_number[\s\S]{0,120}operating_company_id, account_number/i.test(blob))
  errs.push("missing composite UNIQUE (operating_company_id, account_number)");
if (!/uq_accounts_company_qbo_account_id[\s\S]{0,160}operating_company_id, qbo_account_id/i.test(blob))
  errs.push("missing composite UNIQUE (operating_company_id, qbo_account_id)");
// 2) operating_company_id forced NOT NULL
if (!/ALTER COLUMN operating_company_id SET NOT NULL/i.test(blob))
  errs.push("operating_company_id is never SET NOT NULL");
// 3) entity-scoped RLS present
if (!/ENABLE ROW LEVEL SECURITY[\s\S]*catalogs\.accounts/i.test(blob) &&
    !/catalogs\.accounts[\s\S]*ENABLE ROW LEVEL SECURITY/i.test(blob))
  errs.push("catalogs.accounts RLS not enabled");
if (!/POLICY[^\n]*accounts_entity[\s\S]{0,200}operating_company_id/i.test(blob))
  errs.push("no entity-scoped RLS policy filtering operating_company_id");
// 4) regression: no migration re-adds a GLOBAL unique on account_number / qbo_account_id alone (after AF-1)
//    (a bare global unique is the leak AF-1 removes). Flag any global UNIQUE on those single columns.
for (const f of files) {
  const t = fs.readFileSync(path.join(MIG, f), "utf8");
  if (/AF-1/.test(t)) continue; // AF-1 itself drops the globals — skip
  if (/ADD CONSTRAINT[^\n;]*UNIQUE\s*\(\s*account_number\s*\)/i.test(t) ||
      /CREATE UNIQUE INDEX[^\n;]*\(\s*account_number\s*\)\s*;/i.test(t) ||
      /ADD CONSTRAINT[^\n;]*UNIQUE\s*\(\s*qbo_account_id\s*\)/i.test(t))
    errs.push(`${f}: re-introduces a GLOBAL unique on account_number/qbo_account_id (entity-scope regression)`);
}

if (errs.length === 0) {
  console.log("[catalogs-accounts-entity-scope] PASS — catalogs.accounts is per-entity (composite uniques + RLS + NOT NULL); no global-unique regression.");
  process.exit(0);
}
console.error("\nCATALOGS-ACCOUNTS-ENTITY-SCOPE GUARD FAILED");
console.error("=".repeat(64));
for (const e of errs) console.error("  " + e);
console.error("=".repeat(64));
process.exit(1);
