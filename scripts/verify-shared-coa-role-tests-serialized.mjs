#!/usr/bin/env node
/**
 * verify:shared-coa-role-tests-serialized — TEST-HYGIENE guard (no DB).
 *
 * accounting.chart_of_accounts_roles is a per-(operating_company_id, role) SINGLETON (its active row is
 * enforced by `ON CONFLICT (operating_company_id, role) WHERE is_active`).
 *
 * ROOT CAUSE of the bill-payment cash/CC flake: parallel forks DO UPDATE the same company's
 * ap_control row. Fix: any db.test that SEEDS `ap_control` MUST use createIsolatedOperatingCompany()
 * so each suite owns a unique (company, role) namespace. Production uniqueness is preserved.
 *
 * For other shared singleton roles (ar_control / cash_clearing), isolation OR advisory-lock
 * serialization (pg_advisory_lock(4200000001)) is accepted — prefer isolation for new work.
 *
 * Test hygiene only — no production posting/flag resolution. Self-test: --selftest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = path.join(ROOT, "apps/backend/src");
export const LOCK_TOKEN = "4200000001";
export const SHARED_SINGLETON_ROLES = ["ar_control", "ap_control", "cash_clearing"];

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

/** @returns {string[]} failure messages (empty = pass). */
export function run() {
  const failures = [];
  for (const file of walk(BACKEND_SRC)) {
    const { seedsShared, ok, reason } = classify(fs.readFileSync(file, "utf8"));
    if (seedsShared.length > 0 && !ok) {
      failures.push(`${path.relative(ROOT, file)}: ${reason}`);
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
  const checks = [
    ["isolated ap_control seeder passes", classify(isolatedAp).ok === true && classify(isolatedAp).isolated === true],
    ["locked-only ap_control seeder FAIL (isolation required)", classify(lockedAp).ok === false],
    ["unlocked ap_control seeder FAIL", classify(unlockedAp).ok === false],
    ["locked ar_control seeder passes (legacy)", classify(lockedAr).ok === true],
    ["unlocked ar_control seeder FAIL", classify(unlockedAr).ok === false],
    ["non-shared role seeder ignored", classify(nonShared).seedsShared.length === 0],
    ["read-only role reference ignored (no INSERT)", classify(readOnly).seedsShared.length === 0],
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
        `(see bill-payment-gl-posting.db.test.ts). Other shared roles may isolate OR hold ` +
        `pg_advisory_lock(${LOCK_TOKEN}).`
    );
    process.exit(1);
  }
  console.log(
    "verify:shared-coa-role-tests-serialized PASS (ap_control seeders company-isolated; other shared roles isolated or lock-serialized)"
  );
}
