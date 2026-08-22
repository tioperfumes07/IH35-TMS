#!/usr/bin/env node
/**
 * verify-driver-termination-reasons-rls-single-policy.mjs
 *
 * CC3-TERMREASON-LEAK-20260822 — catalogs.driver_termination_reasons was converted to a per-entity
 * catalog by migration 202607890000_driver_termination_reasons_per_entity.sql, which added a
 * PERMISSIVE `company_scope` policy gating every command on the caller's `app.operating_company_id`
 * GUC. That migration never dropped the table's two original GLOBAL-catalog-era PERMISSIVE policies
 * from 0023_driver_safety_file.sql:
 *
 *   dtr_select_authenticated  FOR SELECT TO ih35_app USING (true)
 *   dtr_modify_owner_only     FOR ALL    TO ih35_app USING (role = 'Owner' OR is_lucia_bypass())
 *
 * Postgres OR-combines multiple PERMISSIVE policies for the same command, so the live effective
 * predicate for SELECT was `company_scope OR true` = always true, and for writes was
 * `company_scope OR (caller is Owner)` = any Owner-role caller could write ANY company's row. The
 * per-entity conversion was a structural no-op from the day it landed.
 *
 * LIVE PROOF (2026-08-22, Neon `tiny-field-89581227`, ih35_app role, GUC pinned to USMCA
 * 5c854333-6ea5-4faa-af31-67cb272fef80): `SELECT set_config('app.operating_company_id', '...',
 * false), (SELECT count(*) FROM catalogs.driver_termination_reasons)` returned 50 (TRANSP 16 + TRK
 * 16 + USMCA 18), not USMCA's own 18. Confirmed live in the Owner UI: /lists/drivers/termination-
 * reasons showed "Total rows: 50" with every code tripled, one row per company, commingled with no
 * company indicator.
 *
 * FIX: migration 202608222245_driver_termination_reasons_drop_legacy_permissive_policies.sql drops
 * both legacy policies. Application-layer `isOwner(authUser.role)` already gates every mutation
 * route in driver-safety-events.routes.ts, so `dtr_modify_owner_only` was pure redundancy even
 * before it became a leak vector; `company_scope` alone — the same policy shape used by every other
 * per-entity catalog in this repo — is correct and sufficient for all four commands.
 *
 * Guards:
 *  1. STATIC — the fix migration exists, is idempotent (DROP POLICY IF EXISTS), and drops exactly
 *     the two legacy policy names, never touching `company_scope` itself.
 *  2. LIVE ACL (when a database is reachable) — pg_policy for catalogs.driver_termination_reasons
 *     carries exactly one policy, `company_scope`, regardless of what the migration text claims.
 *     Text-only checks cannot see a policy some other migration or a hand-run statement re-added.
 *
 * Self-test: node scripts/verify-driver-termination-reasons-rls-single-policy.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-termination-reasons-rls-single-policy";
const MIG = "db/migrations/202608222245_driver_termination_reasons_drop_legacy_permissive_policies.sql";

export function run(root = ROOT) {
  const failures = [];
  const migPath = path.join(root, MIG);
  if (!fs.existsSync(migPath)) {
    failures.push(`missing migration ${MIG}`);
    return failures;
  }
  const migSrc = fs.readFileSync(migPath, "utf8");

  if (!/DROP POLICY IF EXISTS dtr_select_authenticated ON catalogs\.driver_termination_reasons/.test(migSrc)) {
    failures.push("migration must DROP POLICY IF EXISTS dtr_select_authenticated (idempotent)");
  }
  if (!/DROP POLICY IF EXISTS dtr_modify_owner_only ON catalogs\.driver_termination_reasons/.test(migSrc)) {
    failures.push("migration must DROP POLICY IF EXISTS dtr_modify_owner_only (idempotent)");
  }
  if (/DROP POLICY[^\n]*company_scope ON catalogs\.driver_termination_reasons/.test(migSrc)) {
    failures.push("migration must NOT drop company_scope — that is the only correct entity-scope policy");
  }
  return failures;
}

// LIVE ACL check — mirrors verify-fuel-loves-prices-daily-table-and-report-guard.mjs exactly: skip
// cleanly with no DB (verify:static's dead-port sentinel), assert for real whenever one is reachable
// (verify:local-ci, and against prod when pointed at it).
async function checkLivePolicies() {
  const require = createRequire(import.meta.url);
  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = (await import("pg")).default;
  try {
    (await import("dotenv")).default.config();
  } catch {
    // dotenv optional — env may already be present.
  }

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} (live-ACL) CAPABILITY SKIP — no DATABASE_URL/DATABASE_DIRECT_URL. CI equivalent: verify:local-ci.`);
    return;
  }

  const { Client } = pg;
  const client = new Client(buildPgClientConfig(connectionString, { connectionTimeoutMillis: 15000 }));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} (live-ACL) CAPABILITY SKIP — database unreachable (${error.code ?? error.message}). CI equivalent: verify:local-ci.`);
    return;
  }

  try {
    const { rows } = await client.query(
      `SELECT polname FROM pg_policy
        WHERE polrelid = 'catalogs.driver_termination_reasons'::regclass
        ORDER BY polname`
    );
    if (rows.length === 0) {
      console.log(`${LABEL} (live-ACL) note — catalogs.driver_termination_reasons not present in this database, skipped.`);
      return;
    }
    const names = rows.map((r) => r.polname);
    if (names.length !== 1 || names[0] !== "company_scope") {
      console.error(
        `${LABEL} FAILED (live-ACL) — catalogs.driver_termination_reasons carries policies [${names.join(", ")}], expected exactly ["company_scope"]. Extra PERMISSIVE policies OR-widen every command past the entity scope.`
      );
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL} (live-ACL) OK — catalogs.driver_termination_reasons: exactly one policy, company_scope.`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  if (process.argv.includes("--selftest")) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "verify-dtr-rls-"));
    fs.mkdirSync(path.join(tmp, path.dirname(MIG)), { recursive: true });

    // Bug shape 1: migration missing entirely — must FAIL.
    if (!run(tmp).length) throw new Error("bug shape (no migration file) must FAIL");

    // Bug shape 2: migration drops neither legacy policy (the actual pre-fix defect) — must FAIL.
    fs.writeFileSync(
      path.join(tmp, MIG),
      "DO $mig$ BEGIN NULL; END $mig$;\n"
    );
    if (!run(tmp).length) throw new Error("bug shape (drops nothing) must FAIL");

    // Bug shape 3: drops only one of the two legacy policies — must FAIL.
    fs.writeFileSync(
      path.join(tmp, MIG),
      "DROP POLICY IF EXISTS dtr_select_authenticated ON catalogs.driver_termination_reasons;\n"
    );
    if (!run(tmp).length) throw new Error("bug shape (drops only one legacy policy) must FAIL");

    // Bug shape 4: drops company_scope too (removes ALL entity scoping) — must FAIL.
    fs.writeFileSync(
      path.join(tmp, MIG),
      [
        "DROP POLICY IF EXISTS dtr_select_authenticated ON catalogs.driver_termination_reasons;",
        "DROP POLICY IF EXISTS dtr_modify_owner_only ON catalogs.driver_termination_reasons;",
        "DROP POLICY IF EXISTS company_scope ON catalogs.driver_termination_reasons;",
        "",
      ].join("\n")
    );
    if (!run(tmp).length) throw new Error("bug shape (drops company_scope too) must FAIL");

    // Good shape: drops exactly the two legacy policies, leaves company_scope — must PASS.
    fs.writeFileSync(
      path.join(tmp, MIG),
      [
        "DROP POLICY IF EXISTS dtr_select_authenticated ON catalogs.driver_termination_reasons;",
        "DROP POLICY IF EXISTS dtr_modify_owner_only ON catalogs.driver_termination_reasons;",
        "",
      ].join("\n")
    );
    if (run(tmp).length) throw new Error("good shape must PASS");

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${LABEL} --selftest OK`);
    return;
  }

  const failures = run();
  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  await checkLivePolicies();
  if (process.exitCode === 1) process.exit(1);

  console.log(
    `${LABEL}: OK — fix migration drops both legacy PERMISSIVE policies without touching company_scope (static + live ACL where reachable)`
  );
}

await main();
