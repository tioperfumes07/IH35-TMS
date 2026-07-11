#!/usr/bin/env node
// ITEM-2 (recon+isolation follow-ups, 2026-07-11) — catalogs.excel_upload_jobs must keep FORCED RLS
// + Owner/Administrator-only write policies + lucia-bypass + ih35_app grant.
//
// GUARD flagged prod showing this table with relrowsecurity=false + 0 policies (a DEPLOYMENT DRIFT:
// repo migration 0383 already forces RLS, but prod diverged). Reconciling prod is an owner ceremony;
// this STATIC guard locks the REPO contract so the migration can never silently lose its access control
// (e.g. a later edit dropping FORCE RLS or widening the write policy). It reads the .sql only — no DB,
// no creds, non-financial. Pairs with the live db-verify-catalogs-rls.mjs (which does not cover this table).
// Self-test: node scripts/verify-excel-upload-jobs-rls-forced.mjs --selftest
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-excel-upload-jobs-rls-forced";
const FILE = "db/migrations/0383_catalog_excel_upload_jobs.sql";

/** Assert the RLS access-control contract on an excel_upload_jobs migration body. Returns a list of failures. */
export function checkSql(sql) {
  const failures = [];
  const has = (re, msg) => {
    if (!re.test(sql)) failures.push(msg);
  };

  // RLS must be enabled AND forced (forced = the table owner is also subject to policies).
  has(/ALTER TABLE\s+catalogs\.excel_upload_jobs\s+ENABLE ROW LEVEL SECURITY/i, "must ENABLE ROW LEVEL SECURITY");
  has(/ALTER TABLE\s+catalogs\.excel_upload_jobs\s+FORCE ROW LEVEL SECURITY/i, "must FORCE ROW LEVEL SECURITY");

  // Writes (INSERT + UPDATE) restricted to Owner/Administrator only.
  has(
    /CREATE POLICY\s+excel_upload_jobs_insert_admin[\s\S]*?FOR INSERT[\s\S]*?identity\.current_user_role\(\)\s+IN\s*\(\s*'Owner',\s*'Administrator'\s*\)/i,
    "INSERT policy must restrict to Owner/Administrator (identity.current_user_role())"
  );
  has(
    /CREATE POLICY\s+excel_upload_jobs_update_admin[\s\S]*?FOR UPDATE[\s\S]*?identity\.current_user_role\(\)\s+IN\s*\(\s*'Owner',\s*'Administrator'\s*\)/i,
    "UPDATE policy must restrict to Owner/Administrator (identity.current_user_role())"
  );

  // Lucia system-bypass so backend/system contexts still function.
  has(
    /CREATE POLICY\s+excel_upload_jobs_lucia_bypass[\s\S]*?identity\.is_lucia_bypass\(\)/i,
    "must keep a lucia-bypass policy (identity.is_lucia_bypass())"
  );

  // Runtime role must have the grant or it 500s.
  has(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+catalogs\.excel_upload_jobs\s+TO\s+ih35_app/i, "must GRANT SELECT/INSERT/UPDATE to ih35_app");

  // Guard against a silent widening of the write policy to any role (e.g. WITH CHECK (true) on INSERT/UPDATE).
  if (/FOR\s+(INSERT|UPDATE)[\s\S]*?WITH CHECK\s*\(\s*true\s*\)/i.test(sql)) {
    failures.push("write policy must not be WITH CHECK (true) — that removes the Owner/Administrator restriction");
  }
  return failures;
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const goodFail = checkSql(good);
  if (goodFail.length) {
    console.error(`${LABEL} --selftest FAILED: the real migration should pass but reported:`, goodFail);
    process.exit(1);
  }
  // A stripped body (no FORCE RLS, write policy widened to true) MUST be caught.
  const bad = `
    ALTER TABLE catalogs.excel_upload_jobs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY excel_upload_jobs_insert_admin ON catalogs.excel_upload_jobs
      FOR INSERT TO ih35_app WITH CHECK (true);
  `;
  const badFail = checkSql(bad);
  if (badFail.length === 0) {
    console.error(`${LABEL} --selftest FAILED: a stripped/widened migration should have been rejected but passed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest — OK (accepts real migration, rejects stripped/widened)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const full = path.join(ROOT, FILE);
  if (!fs.existsSync(full)) {
    console.error(`${LABEL} — FAILED\n- missing migration ${FILE}`);
    process.exit(1);
  }
  const failures = checkSql(fs.readFileSync(full, "utf8"));
  if (failures.length) {
    console.error(`${LABEL} — FAILED`);
    for (const m of failures) console.error(`- ${m}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK (excel_upload_jobs FORCE RLS + Owner/Admin write policies + lucia-bypass + ih35_app grant)`);
}
