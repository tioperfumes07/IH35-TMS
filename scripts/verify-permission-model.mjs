#!/usr/bin/env node
/**
 * GUARD: verify-permission-model.mjs — permission model schema + owner-escalation trust boundary.
 *
 * Owner blocker (2026-08-31): app.bypass_rls='lucia' is set by 38+ backend paths and must NOT
 * escape is_primary_owner / role='Owner' triggers. Recovery uses app.allow_owner_bootstrap only.
 *
 * Proves (normal):
 *   1–3 tables, has_permission deny-wins order, is_primary_owner column
 *   Role escalation trigger (choice b) + is_primary_owner trigger
 *   PERMISSION_MODEL_ENFORCED default OFF
 *   Entity-scope fail-closed; Admin not on the 7 owner voids; settlement.void ≠ unlock
 *   FORCE RLS + audit triggers
 *   TRUST: neither escalation function body contains is_lucia_bypass
 *   TRUST: both functions require allow_owner_bootstrap OR primary-owner actor
 *   TRUST: seed of is_primary_owner appears BEFORE CREATE TRIGGER for both guards
 *   TRUST: INSERT OR UPDATE coverage on both triggers
 *
 * Selftest plants (must fail the planted source):
 *   - re-introduce is_lucia_bypass into guard_role_escalation
 *   - drop role_escalation_blocked exception
 *   - drop allow_owner_bootstrap from guard_is_primary_owner
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-permission-model";
const SELFTEST = process.argv.includes("--selftest");
const MIGRATION_FILE = path.join(ROOT, "db/migrations/202613312000_permission_model.sql");

function extractFn(sql, name) {
  // Use indexOf-based extraction — String.raw mangles \s and \. in regex.
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION identity.${name}`);
  if (start < 0) return "";
  const end = sql.indexOf("$$;", start);
  if (end < 0) return "";
  return sql.slice(start, end + 3);
}

function checkSql(sql) {
  const problems = [];

  if (!/CREATE TABLE IF NOT EXISTS identity\.permissions\b/.test(sql)) {
    problems.push("missing CREATE TABLE identity.permissions");
  }
  if (!/CREATE TABLE IF NOT EXISTS identity\.role_permissions\b/.test(sql)) {
    problems.push("missing CREATE TABLE identity.role_permissions");
  }
  if (!/CREATE TABLE IF NOT EXISTS identity\.user_permissions\b/.test(sql)) {
    problems.push("missing CREATE TABLE identity.user_permissions");
  }

  if (!/CREATE OR REPLACE FUNCTION identity\.has_permission\b/.test(sql)) {
    problems.push("missing identity.has_permission function");
  }
  const fieldDenyIdx = sql.indexOf("FIELD-LEVEL DENY");
  const resourceAllowIdx = sql.indexOf("RESOURCE-LEVEL ALLOW");
  if (fieldDenyIdx < 0 || resourceAllowIdx < 0 || fieldDenyIdx > resourceAllowIdx) {
    problems.push("field-deny must appear before resource-allow in has_permission (deny-wins ordering)");
  }

  if (!/ADD COLUMN IF NOT EXISTS is_primary_owner boolean/.test(sql)) {
    problems.push("missing is_primary_owner column on identity.users");
  }

  if (!/trg_guard_role_escalation/.test(sql)) {
    problems.push("missing role escalation guard trigger");
  }
  if (!/role_escalation_blocked/.test(sql)) {
    problems.push("role escalation guard must raise with 'role_escalation_blocked'");
  }
  if (!/trg_guard_is_primary_owner/.test(sql)) {
    problems.push("missing is_primary_owner guard trigger");
  }
  if (!/is_primary_owner can only be changed by an existing primary owner/.test(sql)) {
    problems.push("is_primary_owner guard must raise the primary-owner-only exception");
  }

  if (!/PERMISSION_MODEL_ENFORCED/.test(sql)) {
    problems.push("missing PERMISSION_MODEL_ENFORCED feature flag");
  }
  if (!/'PERMISSION_MODEL_ENFORCED'[\s\S]*?false/.test(sql)) {
    problems.push("PERMISSION_MODEL_ENFORCED must default to false (OFF)");
  }

  const failOpenMatches = sql.match(/OR v_opco IS NULL/g);
  if (failOpenMatches && failOpenMatches.length > 0) {
    problems.push(`entity-scope predicate has ${failOpenMatches.length} occurrence(s) of 'OR v_opco IS NULL' — fail-OPEN`);
  }

  const ownerSpecBlock = sql.match(/Owner-specified 7: Owner \+ Accountant ONLY[\s\S]*?ON CONFLICT DO NOTHING/);
  if (ownerSpecBlock) {
    const valuesMatch = ownerSpecBlock[0].match(/CROSS JOIN \(VALUES([\s\S]*?)\)\s*AS r\(role\)/);
    if (valuesMatch && /Administrator/.test(valuesMatch[1])) {
      problems.push("Administrator must NOT be seeded to the 7 owner-specified permissions");
    }
  }

  if (!/'settlement\.void'/.test(sql)) problems.push("missing settlement.void permission");
  if (!/'settlement\.unlock'/.test(sql)) problems.push("missing settlement.unlock permission");
  if (!/expires_at\s+timestamptz/.test(sql)) problems.push("missing expires_at on user_permissions");
  if (!/field_name\s+text/.test(sql)) problems.push("missing field_name on permissions");
  if (!/identity\.role_permissions[\s\S]*?operating_company_id\s+uuid/.test(sql)) {
    problems.push("missing operating_company_id on role_permissions");
  }
  if (!/identity\.user_permissions[\s\S]*?operating_company_id\s+uuid/.test(sql)) {
    problems.push("missing operating_company_id on user_permissions");
  }
  if (/UNIQUE \(.*\) WHERE deactivated_at IS NULL/.test(sql)) {
    problems.push("inline UNIQUE (...) WHERE is invalid Postgres — must be CREATE UNIQUE INDEX");
  }
  if ((sql.match(/FORCE ROW LEVEL SECURITY/g) || []).length < 3) {
    problems.push("expected FORCE RLS on all three permission tables");
  }
  if (!/audit\.ensure_row_trigger\('identity', 'permissions'\)/.test(sql)) {
    problems.push("missing audit trigger on identity.permissions");
  }
  if (!/audit\.ensure_row_trigger\('identity', 'role_permissions'\)/.test(sql)) {
    problems.push("missing audit trigger on identity.role_permissions");
  }
  if (!/audit\.ensure_row_trigger\('identity', 'user_permissions'\)/.test(sql)) {
    problems.push("missing audit trigger on identity.user_permissions");
  }

  // ── TRUST BOUNDARY (owner blocker) ──────────────────────────────────────────
  const roleFn = extractFn(sql, "guard_role_escalation");
  const primaryFn = extractFn(sql, "guard_is_primary_owner");
  if (!roleFn) problems.push("could not extract identity.guard_role_escalation body");
  if (!primaryFn) problems.push("could not extract identity.guard_is_primary_owner body");

  if (roleFn && /is_lucia_bypass\s*\(/.test(roleFn)) {
    problems.push(
      "TRUST FAIL: guard_role_escalation still escapes via is_lucia_bypass — Admin/app paths set lucia; Administrator could assign Owner",
    );
  }
  if (primaryFn && /is_lucia_bypass\s*\(/.test(primaryFn)) {
    problems.push(
      "TRUST FAIL: guard_is_primary_owner still escapes via is_lucia_bypass — non-primary Owner could flip the flag under lucia",
    );
  }
  if (roleFn && !/allow_owner_bootstrap\s*\(/.test(roleFn)) {
    problems.push("guard_role_escalation must use allow_owner_bootstrap() for DBA recovery (not lucia)");
  }
  if (primaryFn && !/allow_owner_bootstrap\s*\(/.test(primaryFn)) {
    problems.push("guard_is_primary_owner must use allow_owner_bootstrap() for DBA recovery (not lucia)");
  }
  if (!/CREATE OR REPLACE FUNCTION identity\.allow_owner_bootstrap\b/.test(sql)) {
    problems.push("missing identity.allow_owner_bootstrap() helper");
  }
  if (!/app\.allow_owner_bootstrap/.test(sql)) {
    problems.push("migration must document/use app.allow_owner_bootstrap GUC");
  }

  // Seed before triggers — BOTH owner accounts (SPOF removal)
  if (!/tioperfumes07@gmail\.com/.test(sql) || !/jpm@ih35trucking\.net/.test(sql)) {
    problems.push("must seed is_primary_owner for BOTH tioperfumes07@gmail.com and jpm@ih35trucking.net");
  }
  const seedIdx = sql.search(
    /SET is_primary_owner = true[\s\S]{0,400}tioperfumes07@gmail\.com[\s\S]{0,200}jpm@ih35trucking\.net/,
  );
  const trgPrimaryIdx = sql.indexOf("CREATE TRIGGER trg_guard_is_primary_owner");
  const trgRoleIdx = sql.indexOf("CREATE TRIGGER trg_guard_role_escalation");
  if (seedIdx < 0) {
    problems.push(
      "missing dual-account is_primary_owner seed block (both emails in one UPDATE … email IN (...))",
    );
  }
  if (trgPrimaryIdx < 0 || trgRoleIdx < 0) problems.push("missing CREATE TRIGGER for escalation guards");
  if (seedIdx >= 0 && trgPrimaryIdx >= 0 && seedIdx > trgPrimaryIdx) {
    problems.push("is_primary_owner seed must run BEFORE trg_guard_is_primary_owner is created");
  }
  if (seedIdx >= 0 && trgRoleIdx >= 0 && seedIdx > trgRoleIdx) {
    problems.push("is_primary_owner seed must run BEFORE trg_guard_role_escalation is created");
  }

  // INSERT OR UPDATE coverage (Admin create-user-as-Owner path)
  if (!/BEFORE INSERT OR UPDATE OF is_primary_owner/.test(sql)) {
    problems.push("is_primary_owner trigger must be BEFORE INSERT OR UPDATE OF is_primary_owner");
  }
  if (!/BEFORE INSERT OR UPDATE OF role/.test(sql)) {
    problems.push("role escalation trigger must be BEFORE INSERT OR UPDATE OF role");
  }

  return problems;
}

function check() {
  if (!existsSync(MIGRATION_FILE)) {
    return ["migration 202613312000_permission_model.sql not found"];
  }
  return checkSql(readFileSync(MIGRATION_FILE, "utf8"));
}

function plantAndExpectFail(name, mutate) {
  const orig = readFileSync(MIGRATION_FILE, "utf8");
  const planted = mutate(orig);
  const problems = checkSql(planted);
  if (problems.length === 0) {
    console.error(`  FAIL plant "${name}": expected problems, got 0`);
    return false;
  }
  console.error(`  PASS plant "${name}": caught → ${problems[0]}`);
  return true;
}

function selftest() {
  let ok = true;

  const real = check();
  if (real.length) {
    console.error(`  FAIL: real migration has ${real.length} problem(s):`);
    for (const p of real) console.error(`    - ${p}`);
    ok = false;
  } else {
    console.error("  PASS: real migration clean");
  }

  ok =
    plantAndExpectFail("reintroduce lucia into role escalation", (sql) => {
      const fn = extractFn(sql, "guard_role_escalation");
      if (!fn) return sql + "\n-- plant extract fail\n";
      const broken = fn.replace(
        /IF identity\.allow_owner_bootstrap\s*\(\s*\) THEN/,
        "IF identity.is_lucia_bypass() THEN /* planted */\n    RETURN NEW;\n  END IF;\n  IF identity.allow_owner_bootstrap() THEN",
      );
      // Avoid String.replace $ specials in $$ bodies
      return sql.split(fn).join(broken);
    }) && ok;

  ok =
    plantAndExpectFail("drop role_escalation_blocked message", (sql) =>
      sql.replace("role_escalation_blocked: only a primary owner can assign the Owner role", "denied"),
    ) && ok;

  ok =
    plantAndExpectFail("drop allow_owner_bootstrap from primary guard", (sql) => {
      const fn = extractFn(sql, "guard_is_primary_owner");
      if (!fn) return sql + "\n-- plant failed to extract\n";
      const broken = fn.replace(/identity\.allow_owner_bootstrap\s*\(\s*\)/g, "false /* planted */");
      if (broken === fn) return sql + "\n-- plant failed to mutate primary guard\n";
      return sql.split(fn).join(broken);
    }) && ok;

  ok =
    plantAndExpectFail("UPDATE-only role trigger (drops INSERT cover)", (sql) =>
      sql.replace(
        "BEFORE INSERT OR UPDATE OF role ON identity.users",
        "BEFORE UPDATE OF role ON identity.users",
      ),
    ) && ok;

  if (!ok) {
    console.error(`${LABEL} SELFTEST FAILED`);
    process.exit(1);
  }
  console.error(
    `${LABEL} SELFTEST PASS — Admin cannot assign Owner; lucia does not escape; non-primary primary-flag blocked (static trust plants)`,
  );
}

if (SELFTEST) {
  selftest();
} else {
  const problems = check();
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — escalation triggers have no lucia escape; allow_owner_bootstrap recovery; INSERT+UPDATE; PERMISSION_MODEL_ENFORCED OFF`,
  );
}
