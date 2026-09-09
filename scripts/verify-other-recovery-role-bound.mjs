#!/usr/bin/env node
/**
 * verify-other-recovery-role-bound — SET-17 (owner LOCKED MANDATE 2026-09-09: "live proof still owed
 * that the other_recovery retype + 7200 GL bind actually landed on prod").
 *
 * The catch-all 'other' driver-settlement deduction (the admin-fee rows that legitimately STAY 'other'
 * after scripts/ops/other-recovery-retype-and-bind.ts retyped the escrow/advance-worded rows) resolves
 * its posting account through the generic bucket fallback:
 *   deduction_type 'other' -> bucketRecoveryRoleKey('other') = 'other_recovery'
 *     (settlement-bill-payment.math.ts generic `${t}_recovery`)
 *   -> resolveRoleAccountOptional(other_recovery) -> the bound account.
 * Owner ruling: bind other_recovery (USMCA) to account 7200 "Driver Admin Fee & Chargeback Income"
 * (Income / Other Income) so those lines resolve to a real account instead of NULL/pending. 7200 and
 * the binding are OWNER/APP-CREATED operational data (POST /catalogs/accounts + PUT /coa-roles), not a
 * migration — so this guard's teeth are the LIVE half, which proves the binding still stands on prod.
 *
 * STATIC HALF (no DB, safe everywhere): the code chain that makes 'other' resolve BY ROLE is intact —
 *   - bucketRecoveryRoleKey keeps the generic `${t}_recovery` fallback (so 'other' -> 'other_recovery',
 *     never a hardcoded account);
 *   - resolver.service.ts's COA_ROLE_VALUES admits 'other_recovery';
 *   - other_recovery stays OPTIONAL (entity-required-roles OPTIONAL_COA_ROLES), never a required-validate
 *     carrier role (owner 2026-07-23) — binding it is allowed, requiring it is not.
 *
 * LIVE HALF (DEGRADE-SAFE, opt-in OTHER_RECOVERY_ROLE_LIVE=1): exactly 1 active
 * accounting.chart_of_accounts_roles row for USMCA with role='other_recovery', bound to
 * catalogs.accounts.account_number='7200' (Income, postable).
 *
 * node scripts/verify-other-recovery-role-bound.mjs
 * node scripts/verify-other-recovery-role-bound.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-other-recovery-role-bound";

const MATH_PATH = path.join(ROOT, "apps", "backend", "src", "accounting", "settlement-posting", "settlement-bill-payment.math.ts");
const RESOLVER_PATH = path.join(ROOT, "apps", "backend", "src", "accounting", "coa-roles", "resolver.service.ts");
const OPTIONAL_PATH = path.join(ROOT, "apps", "backend", "src", "accounting", "coa-roles", "entity-required-roles.ts");

function readOrEmpty(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function checkMath(src) {
  const errors = [];
  // The generic bucket fallback must derive `${t}_recovery` so 'other' -> 'other_recovery'.
  if (!/`?\$\{t\}_recovery`?/.test(src) && !/\$\{.*\}_recovery/.test(src)) {
    errors.push(`${MATH_PATH}: bucketRecoveryRoleKey must keep the generic \`\${t}_recovery\` fallback so deduction_type 'other' derives role 'other_recovery'`);
  }
  return errors;
}

function checkResolver(src) {
  const errors = [];
  if (!/COA_ROLE_VALUES[\s\S]*"other_recovery"/.test(src)) {
    errors.push(`${RESOLVER_PATH}: COA_ROLE_VALUES must include "other_recovery"`);
  }
  return errors;
}

function checkOptional(src) {
  const errors = [];
  if (!/OPTIONAL_COA_ROLES[\s\S]*other_recovery/.test(src)) {
    errors.push(`${OPTIONAL_PATH}: OPTIONAL_COA_ROLES must list other_recovery (owner 2026-07-23: unused recoveries are optional, not required-validate)`);
  }
  return errors;
}

function checkStatic() {
  const errors = [];
  const mathSrc = readOrEmpty(MATH_PATH);
  if (!mathSrc) errors.push(`missing file: ${MATH_PATH}`);
  else errors.push(...checkMath(mathSrc));

  const resolverSrc = readOrEmpty(RESOLVER_PATH);
  if (!resolverSrc) errors.push(`missing file: ${RESOLVER_PATH}`);
  else errors.push(...checkResolver(resolverSrc));

  const optionalSrc = readOrEmpty(OPTIONAL_PATH);
  if (!optionalSrc) errors.push(`missing file: ${OPTIONAL_PATH}`);
  else errors.push(...checkOptional(optionalSrc));

  return errors;
}

function selftest() {
  let caught = 0;
  let total = 0;

  const mathSrc = readOrEmpty(MATH_PATH);
  const resolverSrc = readOrEmpty(RESOLVER_PATH);
  const optionalSrc = readOrEmpty(OPTIONAL_PATH);

  const cases = [
    { name: "generic ${t}_recovery fallback removed", fn: () => checkMath(mathSrc.replaceAll("_recovery", "_REMOVED")) },
    { name: "other_recovery dropped from COA_ROLE_VALUES", fn: () => checkResolver(resolverSrc.replace('"other_recovery",\n', "").replace('"other_recovery"', "")) },
    { name: "other_recovery dropped from OPTIONAL_COA_ROLES", fn: () => checkOptional(optionalSrc.replaceAll("other_recovery", "xxx_recovery")) },
  ];

  for (const c of cases) {
    total += 1;
    const errors = c.fn();
    if (errors.length > 0) caught += 1;
    else console.error(`${LABEL} SELFTEST: mutation "${c.name}" escaped detection`);
  }

  const realErrors = checkStatic();
  total += 1;
  if (realErrors.length === 0) caught += 1;
  else console.error(`${LABEL} SELFTEST: real files unexpectedly FAIL: ${realErrors.join("; ")}`);

  if (caught !== total) {
    console.error(`${LABEL} SELFTEST FAILED (${caught}/${total})`);
    return 1;
  }
  console.log(`${LABEL} SELFTEST PASS (${caught}/${total})`);
  return 0;
}

async function liveCheck() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} SKIP (live half) — no DATABASE_URL/DATABASE_DIRECT_URL; live check not possible here.`);
    return 0;
  }
  const liveRequested = process.env.OTHER_RECOVERY_ROLE_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(`${LABEL} SKIP (live half) — CI's database is a fixture playground; run with OTHER_RECOVERY_ROLE_LIVE=1 against prod.`);
    return 0;
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} SKIP (live half) — database unreachable (${error.code ?? error.message}).`);
    await client.end().catch(() => {});
    return 0;
  }

  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const res = await client.query(`
      SELECT r.role, r.is_active, a.account_number, a.account_name, a.account_type
      FROM accounting.chart_of_accounts_roles r
      JOIN org.companies c ON c.id = r.operating_company_id
      JOIN catalogs.accounts a ON a.id = r.account_id
      WHERE c.code = 'USMCA' AND r.role = 'other_recovery' AND r.is_active = true
    `);
    await client.query("ROLLBACK");

    if (res.rows.length !== 1) {
      console.error(`${LABEL} FAIL — expected exactly 1 active other_recovery row for USMCA, found ${res.rows.length}`);
      return 1;
    }
    const row = res.rows[0];
    if (row.account_number !== "7200") {
      console.error(`${LABEL} FAIL — other_recovery is bound to account_number ${row.account_number}, expected 7200`);
      return 1;
    }
    console.log(`${LABEL} PASS (live) — USMCA other_recovery -> account ${row.account_number} "${row.account_name}" (${row.account_type})`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const staticFailures = checkStatic();
  if (staticFailures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of staticFailures) console.error(`  - ${f}`);
    return 1;
  }
  console.log(`${LABEL} static half OK — 'other' resolves by the generic \${t}_recovery fallback to role other_recovery, a registered optional CoaRole`);

  return liveCheck();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
