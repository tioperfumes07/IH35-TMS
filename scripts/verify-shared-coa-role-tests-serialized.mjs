#!/usr/bin/env node
/**
 * verify:shared-coa-role-tests-serialized — TEST-HYGIENE guard (no DB).
 *
 * accounting.chart_of_accounts_roles is a per-(operating_company_id, role) SINGLETON (its active row is
 * enforced by `ON CONFLICT (operating_company_id, role) WHERE is_active`). Every backend `*.db.test.ts`
 * that seeds one of these singleton roles runs against the SAME shared TRANSP prerequisite company handed
 * out by ensureIntegrationPrerequisites(). Under vitest `pool:"forks"`, a parallel fork's afterAll can
 * DELETE or repoint the active role row between another file's seed and its liveRole()/poster reads — the
 * chain-06 "no mapped ar_control role" flake, and the ap_control re-seed clobber before it.
 *
 * INVARIANT: any db.test that SEEDS a shared singleton control role (ar_control / ap_control / cash_clearing)
 * on the shared company MUST serialize on the shared advisory lock (pg_advisory_lock(4200000001)) — hold it
 * around the role seed + posting window + cleanup delete — so no two forks mutate the singleton concurrently.
 * The already-serialized writers: bill-payment-gl-posting / bank-transaction-splits / settlement-bill-payment;
 * chain-06-factoring-ar-tieout / invoice-ar-killswitch / bill-gl-posting join them via the per-test hooks.
 *
 * This is TEST hygiene only — it does NOT touch any production posting/flag resolution. Self-test: --selftest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = path.join(ROOT, "apps/backend/src");
export const LOCK_TOKEN = "4200000001";
// Per-(company, role) singleton control roles that more than one db.test contends on across the shared
// TRANSP company. Seeding any of these on the shared company requires serializing on LOCK_TOKEN.
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
 * Classify a single db.test source. Returns { seedsShared: string[], serialized: boolean } — `seedsShared`
 * is the shared singleton roles it seeds on the shared company (empty if none / not applicable).
 */
export function classify(src) {
  const usesSharedCompany = src.includes("ensureIntegrationPrerequisites");
  const seedsRoles = /INSERT\s+INTO\s+accounting\.chart_of_accounts_roles/i.test(src);
  if (!usesSharedCompany || !seedsRoles) return { seedsShared: [], serialized: true };
  const seedsShared = SHARED_SINGLETON_ROLES.filter((role) => new RegExp(`["']${role}["']`).test(src));
  const serialized = src.includes(`pg_advisory_lock(${LOCK_TOKEN})`) || src.includes(LOCK_TOKEN);
  return { seedsShared, serialized };
}

/** @returns {string[]} failure messages (empty = pass). */
export function run() {
  const failures = [];
  for (const file of walk(BACKEND_SRC)) {
    const { seedsShared, serialized } = classify(fs.readFileSync(file, "utf8"));
    if (seedsShared.length > 0 && !serialized) {
      failures.push(
        `${path.relative(ROOT, file)} seeds shared singleton COA role(s) [${seedsShared.join(", ")}] on the ` +
          `shared company but does NOT serialize on pg_advisory_lock(${LOCK_TOKEN})`
      );
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const locked = `ensureIntegrationPrerequisites INSERT INTO accounting.chart_of_accounts_roles 'ar_control' pg_advisory_lock(${LOCK_TOKEN})`;
  const unlocked = "ensureIntegrationPrerequisites INSERT INTO accounting.chart_of_accounts_roles 'ap_control'";
  const nonShared = "ensureIntegrationPrerequisites INSERT INTO accounting.chart_of_accounts_roles 'lease_rental'";
  const readOnly = "ensureIntegrationPrerequisites SELECT ... role='ar_control'"; // reads, never seeds
  const checks = [
    ["locked shared-role seeder passes", classify(locked).seedsShared.length === 1 && classify(locked).serialized === true],
    ["unlocked shared-role seeder flagged", classify(unlocked).seedsShared.length === 1 && classify(unlocked).serialized === false],
    ["non-shared role seeder ignored", classify(nonShared).seedsShared.length === 0],
    ["read-only role reference ignored (no INSERT)", classify(readOnly).seedsShared.length === 0],
    ["the real repo tree is clean", run().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:shared-coa-role-tests-serialized --selftest FAIL");
    for (const [n] of failed) console.error("  ✗ " + n);
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
      `\nFix: hold pg_advisory_lock(${LOCK_TOKEN}) around the role seed + posting window + cleanup delete ` +
        "(see chain-06-factoring-ar-tieout.db.test.ts / bill-payment-gl-posting.db.test.ts)."
    );
    process.exit(1);
  }
  console.log("verify:shared-coa-role-tests-serialized PASS (shared singleton COA-role db.tests serialize on the advisory lock)");
}
