#!/usr/bin/env node
/**
 * verify:shared-coa-role-tests-serialized — TEST-HYGIENE guard (no DB).
 *
 * 1) accounting.chart_of_accounts_roles is a per-(operating_company_id, role) SINGLETON.
 *    ROOT CAUSE of the bill-payment cash/CC flake: parallel forks DO UPDATE the same company's
 *    ap_control row. Fix: any db.test that SEEDS `ap_control` MUST use createIsolatedOperatingCompany()
 *    (canonical: apps/backend/test-helpers/isolated-company.ts).
 *
 * 2) catalogs.account_role_bindings is UNIQUE(operating_company_id, role_key) per entity
 *    (global UNIQUE(role_key) dropped by 202607770000). Settlement suites that
 *    INSERT…ON CONFLICT (operating_company_id, role_key) MUST hold GLOBAL_ACCOUNT_ROLE_BINDINGS_TEST_LOCK_KEY
 *    (922337203685477002) via acquireGlobalAccountRoleBindingsLock for save→bind→tests→restore.
 *    Restore must call restoreGlobalAccountRoleBindings (fail-loud) — never best-effort swallow.
 *
 * Test hygiene only — no production posting/flag resolution. Self-test: --selftest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = path.join(ROOT, "apps/backend/src");
export const LOCK_TOKEN = "4200000001";
export const GLOBAL_BINDINGS_LOCK_TOKEN = "922337203685477002";
export const SHARED_SINGLETON_ROLES = ["ar_control", "ap_control", "cash_clearing"];

/** Suites known to mutate GLOBAL account_role_bindings (must share the bindings lock). */
export const GLOBAL_BINDINGS_MUTATOR_BASENAMES = [
  "settlement-bill-payment-posting.db.test.ts",
  "settlement-gl-posting.db.test.ts",
  "settlement-payrun-close.db.test.ts",
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (full.endsWith(".db.test.ts")) acc.push(full);
  }
  return acc;
}

/**
 * @returns {{ seedsShared: string[], seedsApControl: boolean, isolated: boolean, serialized: boolean, ok: boolean, reason: string|null }}
 */
export function classify(src) {
  const seedsRoles = /INSERT\s+INTO\s+accounting\.chart_of_accounts_roles/i.test(src);
  if (!seedsRoles) {
    return { seedsShared: [], seedsApControl: false, isolated: false, serialized: true, ok: true, reason: null };
  }
  const seedsShared = SHARED_SINGLETON_ROLES.filter((role) => new RegExp(`["']${role}["']`).test(src));
  if (seedsShared.length === 0) {
    return { seedsShared: [], seedsApControl: false, isolated: false, serialized: true, ok: true, reason: null };
  }
  const seedsApControl = seedsShared.includes("ap_control");
  const isolated = src.includes("createIsolatedOperatingCompany");
  const serialized = src.includes(`pg_advisory_lock(${LOCK_TOKEN})`) || src.includes(LOCK_TOKEN);

  // ap_control seeders: isolation required (root fix for the cash/CC race).
  if (seedsApControl && !isolated) {
    return {
      seedsShared,
      seedsApControl,
      isolated,
      serialized,
      ok: false,
      reason: "seeds ap_control but does not call createIsolatedOperatingCompany()",
    };
  }
  // Other shared singleton roles: isolation OR advisory-lock serialization.
  if (!isolated && !serialized) {
    return {
      seedsShared,
      seedsApControl,
      isolated,
      serialized,
      ok: false,
      reason: `seeds [${seedsShared.join(", ")}] without createIsolatedOperatingCompany() or pg_advisory_lock(${LOCK_TOKEN})`,
    };
  }
  return { seedsShared, seedsApControl, isolated, serialized, ok: true, reason: null };
}

/**
 * Classify GLOBAL account_role_bindings mutators.
 * @returns {{ mutatesGlobalBindings: boolean, hasLock: boolean, hasRestore: boolean, swallowsRestore: boolean, ok: boolean, reason: string|null }}
 */
export function classifyGlobalBindings(src, basename) {
  const mutates =
    /INSERT\s+INTO\s+catalogs\.account_role_bindings/i.test(src) &&
    (/ON\s+CONFLICT\s*\(\s*role_key\s*\)/i.test(src) ||
      /ON\s+CONFLICT\s*\(\s*operating_company_id\s*,\s*role_key\s*\)/i.test(src));
  if (!mutates) {
    return {
      mutatesGlobalBindings: false,
      hasLock: false,
      hasRestore: false,
      swallowsRestore: false,
      ok: true,
      reason: null,
    };
  }

  const hasLock =
    src.includes("acquireGlobalAccountRoleBindingsLock") ||
    src.includes(GLOBAL_BINDINGS_LOCK_TOKEN) ||
    src.includes("GLOBAL_ACCOUNT_ROLE_BINDINGS_TEST_LOCK_KEY");
  const hasRestore = src.includes("restoreGlobalAccountRoleBindings");
  // Outer afterAll must rethrow restore failures (`if (restoreError) throw`). Empty
  // `catch { /* best-effort */ }` wrapping the whole teardown (including restore) is forbidden.
  const hasFailLoudRethrow = /if\s*\(\s*restoreError\s*\)\s*throw\s+restoreError/.test(src);
  const swallowsRestore =
    (/catch\s*\{\s*\/\*\s*best-effort/i.test(src) || /catch\s*\{\s*\/\*\s*best-effort cleanup/i.test(src)) &&
    !hasFailLoudRethrow;

  if (!hasLock) {
    return {
      mutatesGlobalBindings: true,
      hasLock,
      hasRestore,
      swallowsRestore,
      ok: false,
      reason: `mutates catalogs.account_role_bindings ON CONFLICT (operating_company_id, role_key) without acquireGlobalAccountRoleBindingsLock / ${GLOBAL_BINDINGS_LOCK_TOKEN}`,
    };
  }
  if (GLOBAL_BINDINGS_MUTATOR_BASENAMES.includes(basename) && !hasRestore) {
    return {
      mutatesGlobalBindings: true,
      hasLock,
      hasRestore,
      swallowsRestore,
      ok: false,
      reason: "settlement GLOBAL bindings mutator must call restoreGlobalAccountRoleBindings (fail-loud)",
    };
  }
  if (GLOBAL_BINDINGS_MUTATOR_BASENAMES.includes(basename) && !hasFailLoudRethrow) {
    return {
      mutatesGlobalBindings: true,
      hasLock,
      hasRestore,
      swallowsRestore,
      ok: false,
      reason: "settlement GLOBAL bindings restore must fail loud (if (restoreError) throw restoreError)",
    };
  }
  if (GLOBAL_BINDINGS_MUTATOR_BASENAMES.includes(basename) && swallowsRestore) {
    return {
      mutatesGlobalBindings: true,
      hasLock,
      hasRestore,
      swallowsRestore,
      ok: false,
      reason: "settlement GLOBAL bindings restore must not be wrapped in best-effort empty catch",
    };
  }
  return {
    mutatesGlobalBindings: true,
    hasLock,
    hasRestore,
    swallowsRestore,
    ok: true,
    reason: null,
  };
}

/** @returns {string[]} failure messages (empty = pass). */
export function run() {
  const failures = [];
  for (const file of walk(BACKEND_SRC)) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    const basename = path.basename(file);
    const { seedsShared, ok, reason } = classify(src);
    if (seedsShared.length > 0 && !ok) {
      failures.push(`${rel}: ${reason}`);
    }
    const g = classifyGlobalBindings(src, basename);
    if (!g.ok) {
      failures.push(`${rel}: ${g.reason}`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const isolatedAp = `createIsolatedOperatingCompany INSERT INTO accounting.chart_of_accounts_roles 'ap_control'`;
  const lockedAp = `ensureIntegrationPrerequisites INSERT INTO accounting.chart_of_accounts_roles 'ap_control' pg_advisory_lock(${LOCK_TOKEN})`;
  const unlockedAp = "ensureIntegrationPrerequisites INSERT INTO accounting.chart_of_accounts_roles 'ap_control'";
  const lockedAr = `ensureIntegrationPrerequisites INSERT INTO accounting.chart_of_accounts_roles 'ar_control' pg_advisory_lock(${LOCK_TOKEN})`;
  const unlockedAr = "ensureIntegrationPrerequisites INSERT INTO accounting.chart_of_accounts_roles 'ar_control'";
  const nonShared = "ensureIntegrationPrerequisites INSERT INTO accounting.chart_of_accounts_roles 'lease_rental'";
  const readOnly = "ensureIntegrationPrerequisites SELECT ... role='ar_control'";
  const lockedBindings = `
    acquireGlobalAccountRoleBindingsLock
    INSERT INTO catalogs.account_role_bindings (role_key, account_id)
    ON CONFLICT (operating_company_id, role_key) DO UPDATE
    restoreGlobalAccountRoleBindings
    if (restoreError) throw restoreError
  `;
  const unlockedBindings = `
    INSERT INTO catalogs.account_role_bindings (role_key, account_id)
    ON CONFLICT (operating_company_id, role_key) DO UPDATE
  `;
  const swallowBindings = `
    acquireGlobalAccountRoleBindingsLock
    INSERT INTO catalogs.account_role_bindings (role_key, account_id)
    ON CONFLICT (operating_company_id, role_key) DO UPDATE
    restoreGlobalAccountRoleBindings
    catch { /* best-effort */ }
  `;
  const checks = [
    ["isolated ap_control seeder passes", classify(isolatedAp).ok === true && classify(isolatedAp).isolated === true],
    ["locked-only ap_control seeder FAIL (isolation required)", classify(lockedAp).ok === false],
    ["unlocked ap_control seeder FAIL", classify(unlockedAp).ok === false],
    ["locked ar_control seeder passes (legacy)", classify(lockedAr).ok === true],
    ["unlocked ar_control seeder FAIL", classify(unlockedAr).ok === false],
    ["non-shared role seeder ignored", classify(nonShared).seedsShared.length === 0],
    ["read-only role reference ignored (no INSERT)", classify(readOnly).seedsShared.length === 0],
    [
      "locked GLOBAL bindings mutator passes",
      classifyGlobalBindings(lockedBindings, "settlement-gl-posting.db.test.ts").ok === true,
    ],
    [
      "unlocked GLOBAL bindings mutator FAIL",
      classifyGlobalBindings(unlockedBindings, "settlement-gl-posting.db.test.ts").ok === false,
    ],
    [
      "missing fail-loud restore rethrow FAIL",
      classifyGlobalBindings(swallowBindings, "settlement-bill-payment-posting.db.test.ts").ok === false,
    ],
    ["the real repo tree is clean", run().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:shared-coa-role-tests-serialized --selftest FAIL");
    for (const [n] of failed) console.error("  ✗ " + n);
    // help debug tree failures
    for (const f of run()) console.error("  tree: " + f);
    process.exit(1);
  }
  console.log(`verify:shared-coa-role-tests-serialized --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:shared-coa-role-tests-serialized FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    console.error(
      `\nFix: ap_control seeders MUST use createIsolatedOperatingCompany() ` +
        `(canonical: apps/backend/test-helpers/isolated-company.ts). ` +
        `GLOBAL account_role_bindings mutators MUST acquireGlobalAccountRoleBindingsLock ` +
        `(${GLOBAL_BINDINGS_LOCK_TOKEN}) and restoreGlobalAccountRoleBindings (fail-loud).`
    );
    process.exit(1);
  }
  console.log(
    "verify:shared-coa-role-tests-serialized PASS (ap_control company-isolated; GLOBAL bindings lock+restore)"
  );
}
