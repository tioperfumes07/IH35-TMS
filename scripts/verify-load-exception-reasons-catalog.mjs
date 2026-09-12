#!/usr/bin/env node
/**
 * LEAD ITEM 1 (2026-09-11 22:30 UTC): catalogs.load_exception_reasons — CC-2's Truck Line depends
 * on this catalog. Verifies the migration (202614090000_load_exception_reasons.sql) actually landed
 * correctly on the live database: the table exists with the required columns, RLS is FORCED (not
 * just enabled), ih35_app carries the expected grants, and the seed produced exactly 11 active rows
 * for USMCA and 0 for TRANSP/TRK (per-entity catalog, USMCA-only seed by design).
 *
 * SELF-FOUND FIX (same day, live Chrome re-check): 202614090000's own RLS policies checked
 * current_setting('app.operating_company_id', true) — a GUC the route's withCurrentUser code path
 * never sets — so the live page rendered 0 rows despite 11 real ones. 202614100000 repoints all 3
 * policies to the SAME proven-working org.user_company_access membership pattern
 * catalogs.load_cancellation_reasons already uses under the identical code path. The ORIGINAL
 * migration file is never edited (checksum-frozen, already applied) — this guard checks the FOLLOW-
 * UP fix migration's text and the actual live policy qual, not the original file's now-superseded
 * policy clause.
 *
 * Target: Neon project tiny-field-89581227, branch br-fancy-credit-akjnd07a (prod).
 * Usage: DATABASE_URL=<prod conn string> node scripts/verify-load-exception-reasons-catalog.mjs
 *        node scripts/verify-load-exception-reasons-catalog.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-load-exception-reasons-catalog";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const MIGRATION_PATH = path.join(repoRoot, "db/migrations/202614090000_load_exception_reasons.sql");
const RLS_FIX_MIGRATION_PATH = path.join(repoRoot, "db/migrations/202614100000_load_exception_reasons_rls_fix.sql");
const ROUTES_PATH = path.join(repoRoot, "apps/backend/src/catalogs/load-exception-reasons.routes.ts");
const INDEX_PATH = path.join(repoRoot, "apps/backend/src/index.ts");
const BACKEND_SRC = path.join(repoRoot, "apps/backend/src");
const ROUTE_URL = "/api/v1/catalogs/load-exception-reasons";

/** node_modules-free directory walk for .routes.ts files, mirroring scripts/verify-no-duplicate-routes.mjs. */
function walkRoutesFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walkRoutesFiles(full, out); continue; }
    if (entry.isFile() && entry.name.endsWith(".routes.ts")) out.push(full);
  }
  return out;
}

/**
 * BOOT-CRASH FOUND LIVE 2026-09-12 ("Method 'GET' already declared for route
 * '/api/v1/catalogs/load-exception-reasons'"): dispatch/truck-line/load-exception-reasons.routes.ts
 * independently registered app.get() on this EXACT literal path (a deliberate temporary shim,
 * "degrades gracefully ... until [this] table exists" per its own header) under a DIFFERENT function
 * name (registerLoadExceptionReasonsRoutes, note the plural), so auditRouteRegistration above (which
 * only greps for the literal string "registerLoadExceptionReasonRoutes") never saw it, and
 * scripts/verify-no-duplicate-routes.mjs only indexes .routes.ts files under accounting/ — this
 * route lives in catalogs/. Both files were manually `await`ed in index.ts; Fastify does not allow
 * two handlers on the same method+path and the app exited early on every deploy after Truck Line
 * merged. Removed as part of this fix (the real table/route now exists, so the shim's own reason
 * for existing is gone) -- this scans the WHOLE backend src tree so any FUTURE file that reintroduces
 * a route on this literal path, under any function name, fails loudly instead of booting to a crash.
 */
export function auditNoCollidingRouteFile(backendSrc, ownRoutesPath) {
  const failures = [];
  if (!fs.existsSync(backendSrc)) return failures;
  const pathRe = new RegExp(`app\\.(get|post|put|patch|delete)\\(\\s*["'\`]${ROUTE_URL.replace(/\//g, "\\/")}["'\`]`);
  for (const filePath of walkRoutesFiles(backendSrc)) {
    if (path.resolve(filePath) === path.resolve(ownRoutesPath)) continue;
    const src = fs.readFileSync(filePath, "utf8");
    if (pathRe.test(src)) {
      failures.push(
        `${path.relative(repoRoot, filePath)} also registers a route on ${ROUTE_URL} — this is the exact ` +
          `2026-09-12 boot-crash shape (two .routes.ts files, two function names, same literal path)`
      );
    }
  }
  return failures;
}

/** Pure: does the migration file declare the required columns, FORCED RLS, and grants? */
export function auditMigrationSource(src) {
  const failures = [];
  for (const col of ["operating_company_id", "code", "name", "applies_to", "linked_module", "sort_order", "is_active", "created_at"]) {
    if (!src.includes(col)) failures.push(`migration is missing column ${col}`);
  }
  if (!/UNIQUE\s*\(operating_company_id,\s*code\)/.test(src)) failures.push("missing UNIQUE(operating_company_id, code)");
  if (!/FORCE ROW LEVEL SECURITY/.test(src)) failures.push("RLS is not FORCED (ALTER TABLE ... FORCE ROW LEVEL SECURITY missing)");
  if (!/identity\.is_lucia_bypass\(\)/.test(src)) failures.push("policy does not reference identity.is_lucia_bypass()");
  if (!/GRANT SELECT, INSERT, UPDATE ON catalogs\.load_exception_reasons TO ih35_app/.test(src)) failures.push("missing GRANT to ih35_app");
  if (!/CREATE TABLE IF NOT EXISTS/.test(src)) failures.push("not idempotent — missing IF NOT EXISTS on CREATE TABLE");
  if (!/ON CONFLICT \(operating_company_id, code\) DO NOTHING/.test(src)) failures.push("seed is not idempotent — missing ON CONFLICT DO NOTHING");
  const seedCodes = ["breakdown_roadside", "breakdown_towed", "accident", "weather", "border_hold", "detention", "layover", "driver_rest", "reroute", "customer_cancelled", "other"];
  for (const code of seedCodes) {
    if (!src.includes(`'${code}'`)) failures.push(`seed is missing code '${code}'`);
  }
  return failures;
}

/** Pure: does the RLS-fix migration repoint all 3 policies to the proven org.user_company_access
 *  membership pattern (not the broken current_setting('app.operating_company_id') GUC check)? */
export function auditRlsFixMigrationSource(src) {
  const failures = [];
  for (const policy of ["load_exception_reasons_select", "load_exception_reasons_insert", "load_exception_reasons_update"]) {
    if (!src.includes(policy)) failures.push(`RLS fix migration is missing policy ${policy}`);
  }
  if (!/org\.user_company_access/.test(src)) failures.push("RLS fix migration does not reference org.user_company_access — still using the broken GUC-only pattern");
  if (!/identity\.current_user_id\(\)/.test(src)) failures.push("RLS fix migration does not reference identity.current_user_id()");
  if (/current_setting\('app\.operating_company_id'/.test(src)) failures.push("RLS fix migration still contains the broken current_setting('app.operating_company_id') pattern");
  return failures;
}

/** Pure: is the route file registered exactly once in index.ts (no duplicate mount)? */
export function auditRouteRegistration(indexSrc) {
  const failures = [];
  const importMatches = indexSrc.match(/registerLoadExceptionReasonRoutes/g) ?? [];
  if (importMatches.length === 0) failures.push("registerLoadExceptionReasonRoutes is never referenced in index.ts");
  if (importMatches.length > 2) failures.push(`registerLoadExceptionReasonRoutes referenced ${importMatches.length} times in index.ts — possible duplicate mount`);
  if (!/await registerLoadExceptionReasonRoutes\(app\)/.test(indexSrc)) failures.push("registerLoadExceptionReasonRoutes(app) is never awaited/called");
  return failures;
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const goodMigration = fs.readFileSync(MIGRATION_PATH, "utf8");
  assert.ok(auditMigrationSource(goodMigration).length === 0, "the real migration file must pass: " + JSON.stringify(auditMigrationSource(goodMigration)));

  const badMigration = goodMigration.replace("FORCE ROW LEVEL SECURITY", "-- removed").replace(/ON CONFLICT \(operating_company_id, code\) DO NOTHING/, "");
  assert.ok(auditMigrationSource(badMigration).length >= 2, "a migration missing FORCE RLS and idempotent seed must be caught");

  const missingCol = goodMigration.replace(/applies_to/g, "xxx");
  assert.ok(auditMigrationSource(missingCol).some((f) => f.includes("applies_to")), "a missing column must be caught");

  const goodIndex = `import { registerLoadExceptionReasonRoutes } from "./catalogs/load-exception-reasons.routes.js";\n  await registerLoadExceptionReasonRoutes(app);`;
  assert.ok(auditRouteRegistration(goodIndex).length === 0, "single registration must pass");

  const missingIndex = `// no reference at all`;
  assert.ok(auditRouteRegistration(missingIndex).length >= 1, "a missing registration must be caught");

  const dupIndex = `${goodIndex}\n${goodIndex}\n${goodIndex}`;
  assert.ok(auditRouteRegistration(dupIndex).length >= 1, "a triple (autoload + explicit x2) registration must be caught");

  const goodRlsFix = fs.readFileSync(RLS_FIX_MIGRATION_PATH, "utf8");
  assert.ok(auditRlsFixMigrationSource(goodRlsFix).length === 0, "the real RLS fix migration must pass: " + JSON.stringify(auditRlsFixMigrationSource(goodRlsFix)));

  const brokenRlsFix = goodRlsFix.replace(/org\.user_company_access[\s\S]*?deactivated_at IS NULL\s*\)/g, "current_setting('app.operating_company_id', true)");
  assert.ok(auditRlsFixMigrationSource(brokenRlsFix).length >= 1, "a regression back to the broken GUC pattern must be caught");

  // auditNoCollidingRouteFile — reproduces the 2026-09-12 boot-crash shape in a scratch tree: a
  // second .routes.ts file, under a different function name, registering the same literal path.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "load-exception-reasons-collision-"));
  try {
    fs.mkdirSync(path.join(scratch, "catalogs"), { recursive: true });
    fs.mkdirSync(path.join(scratch, "dispatch", "truck-line"), { recursive: true });
    const ownRoutes = path.join(scratch, "catalogs", "load-exception-reasons.routes.ts");
    fs.writeFileSync(
      ownRoutes,
      `export async function registerLoadExceptionReasonRoutes(app) {\n  app.get("${ROUTE_URL}", async () => ({}));\n}\n`
    );
    const collidingRoutes = path.join(scratch, "dispatch", "truck-line", "load-exception-reasons.routes.ts");
    fs.writeFileSync(
      collidingRoutes,
      `export async function registerLoadExceptionReasonsRoutes(app) {\n  app.get("${ROUTE_URL}", async () => ({}));\n}\n`
    );
    assert.ok(
      auditNoCollidingRouteFile(scratch, ownRoutes).length === 1,
      "a second .routes.ts file registering the same literal path must be caught"
    );

    fs.rmSync(collidingRoutes);
    assert.ok(
      auditNoCollidingRouteFile(scratch, ownRoutes).length === 0,
      "with the colliding file removed (the actual fix), no failure should remain"
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  assert.ok(
    auditNoCollidingRouteFile(BACKEND_SRC, ROUTES_PATH).length === 0,
    "the real backend src tree must have no other file registering this route right now"
  );

  console.log(`${LABEL} --selftest PASS`);
}

async function run() {
  const failures = [];
  const migrationSrc = fs.existsSync(MIGRATION_PATH) ? fs.readFileSync(MIGRATION_PATH, "utf8") : null;
  if (!migrationSrc) failures.push(`${path.relative(repoRoot, MIGRATION_PATH)}: missing`);
  else failures.push(...auditMigrationSource(migrationSrc));

  if (!fs.existsSync(ROUTES_PATH)) failures.push(`${path.relative(repoRoot, ROUTES_PATH)}: missing`);

  const rlsFixSrc = fs.existsSync(RLS_FIX_MIGRATION_PATH) ? fs.readFileSync(RLS_FIX_MIGRATION_PATH, "utf8") : null;
  if (!rlsFixSrc) failures.push(`${path.relative(repoRoot, RLS_FIX_MIGRATION_PATH)}: missing`);
  else failures.push(...auditRlsFixMigrationSource(rlsFixSrc));

  const indexSrc = fs.existsSync(INDEX_PATH) ? fs.readFileSync(INDEX_PATH, "utf8") : null;
  if (!indexSrc) failures.push(`${path.relative(repoRoot, INDEX_PATH)}: missing`);
  else failures.push(...auditRouteRegistration(indexSrc));

  failures.push(...auditNoCollidingRouteFile(BACKEND_SRC, ROUTES_PATH));

  if (failures.length) {
    console.error(`${LABEL} FAILED (static):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: static OK — migration, route file, single registration, and no colliding route file`);

  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: DATABASE_URL not set — skipping the live check (static check above still ran).`);
    console.log(`${LABEL}: to re-run the live check: DATABASE_URL=<prod> node ${process.argv[1]}`);
    return;
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const control = await client.query(`SELECT count(*)::int AS n FROM accounting.journal_entries`);
    if (control.rows[0].n === 0) {
      console.error(`${LABEL}: FAIL — je_control=0, this connection cannot see the ledger (masked read, not a verdict)`);
      process.exitCode = 1;
      return;
    }

    const { rows: tableRows } = await client.query(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'catalogs'::regnamespace AND relname = 'load_exception_reasons'`
    );
    if (tableRows.length === 0) {
      console.error(`${LABEL}: FAIL — catalogs.load_exception_reasons does not exist live`);
      process.exitCode = 1;
      return;
    }
    if (!tableRows[0].relrowsecurity || !tableRows[0].relforcerowsecurity) {
      console.error(`${LABEL}: FAIL — RLS is not enabled+forced live (relrowsecurity=${tableRows[0].relrowsecurity}, relforcerowsecurity=${tableRows[0].relforcerowsecurity})`);
      process.exitCode = 1;
      return;
    }

    const { rows: policyRows } = await client.query(
      `SELECT policyname, qual FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'load_exception_reasons'`
    );
    const selectPolicy = policyRows.find((r) => r.policyname === "load_exception_reasons_select");
    if (!selectPolicy || !/org\.user_company_access/.test(selectPolicy.qual ?? "")) {
      console.error(`${LABEL}: FAIL — live SELECT policy does not use org.user_company_access (still the broken GUC pattern, or missing): ${selectPolicy?.qual}`);
      process.exitCode = 1;
      return;
    }
    if (/current_setting\('app\.operating_company_id'/.test(selectPolicy.qual ?? "")) {
      console.error(`${LABEL}: FAIL — live SELECT policy still contains the broken current_setting('app.operating_company_id') pattern`);
      process.exitCode = 1;
      return;
    }

    const { rows: grantRows } = await client.query(
      `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'catalogs' AND table_name = 'load_exception_reasons' AND grantee = 'ih35_app'`
    );
    const grants = new Set(grantRows.map((r) => r.privilege_type));
    for (const required of ["SELECT", "INSERT", "UPDATE"]) {
      if (!grants.has(required)) {
        console.error(`${LABEL}: FAIL — ih35_app is missing ${required} grant on catalogs.load_exception_reasons`);
        process.exitCode = 1;
        return;
      }
    }

    const { rows: countRows } = await client.query(
      `SELECT c.code, count(l.id)::int AS n
         FROM org.companies c
         LEFT JOIN catalogs.load_exception_reasons l ON l.operating_company_id = c.id AND l.is_active = true
        WHERE c.code IN ('USMCA', 'TRANSP', 'TRK')
        GROUP BY c.code`
    );
    await client.query("ROLLBACK");
    const byCode = new Map(countRows.map((r) => [r.code, r.n]));
    if ((byCode.get("USMCA") ?? 0) !== 11) {
      console.error(`${LABEL}: FAIL — USMCA has ${byCode.get("USMCA") ?? 0} active rows, expected 11`);
      process.exitCode = 1;
      return;
    }
    for (const code of ["TRANSP", "TRK"]) {
      if ((byCode.get(code) ?? 0) !== 0) {
        console.error(`${LABEL}: FAIL — ${code} has ${byCode.get(code)} active rows, expected 0 (USMCA-only seed)`);
        process.exitCode = 1;
        return;
      }
    }

    console.log(`${LABEL}: PASS — table exists, RLS enabled+forced, ih35_app grants present, USMCA=11 active rows, TRANSP=0, TRK=0 (je_control=${control.rows[0].n})`);
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await run();
}
