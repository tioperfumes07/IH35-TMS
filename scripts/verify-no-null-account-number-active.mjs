#!/usr/bin/env node
/**
 * FINDING: row 259 (AUDIT-COVERAGE-LIVE) — USMCA's live chart of accounts accumulated 7
 * test/audit-fixture "Driver Cash Advance- ..." sub-accounts (2026-08-02 → 2026-08-16), one of
 * which still had a bare NULL account_number. Fixed live in migration
 * 202612700000_usmca_archive_test_cash_advance_accounts.sql (archive, void-not-delete) plus a DB
 * CHECK constraint: an account may have NULL account_number only while deactivated
 * (accounts_active_requires_account_number).
 *
 * Static check (always runs, mutation-provable): the constraint migration is present on disk and
 * intact, so a fresh CI DB — and every DB built from these migrations — carries the guard.
 *
 * Live check (opt-in, same shape as verify-no-test-units-in-prod.mjs): scans for any currently
 * ACTIVE account with a NULL account_number, which the CHECK constraint should make impossible
 * going forward. Gated behind DATABASE_URL + ENABLE_LIVE_DB_UNIT_TEST_GUARD so CI's ephemeral DB
 * (which has no prod data) doesn't false-fail, while a live/prod run gets a real defense-in-depth
 * scan.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-null-account-number-active";
const MIGRATION_REL = "db/migrations/202612700000_usmca_archive_test_cash_advance_accounts.sql";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure assertion so the selftest can run it against mutated in-memory copies. */
export function assertConstraintIntact(migrationSource) {
  const errors = [];
  if (!migrationSource.includes("accounts_active_requires_account_number")) {
    errors.push("migration no longer adds the accounts_active_requires_account_number CHECK constraint");
  }
  if (!migrationSource.includes("CHECK (account_number IS NOT NULL OR deactivated_at IS NOT NULL)")) {
    errors.push("CHECK constraint definition drifted from the intended invariant");
  }
  return errors;
}

function selftest() {
  const problems = [];
  const live = read(MIGRATION_REL);

  const liveErrors = assertConstraintIntact(live);
  if (liveErrors.length) problems.push(`live migration rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "constraint name dropped",
      live.replace(/accounts_active_requires_account_number/g, "renamed_constraint"),
      "no longer adds the accounts_active_requires_account_number",
    ],
    [
      "CHECK clause weakened",
      live.replace(
        "CHECK (account_number IS NOT NULL OR deactivated_at IS NOT NULL)",
        "CHECK (true)"
      ),
      "drifted from the intended invariant",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertConstraintIntact(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live migration clean; ${cases.length} planted regressions caught`);
}

async function liveScan() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live scan did NOT run`);
    return;
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    // The prod endpoint is a PgBouncer-style pooler in transaction-pooling mode: a SEPARATE
    // client.query() call can land on a DIFFERENT physical backend, so a set_config() issued in its
    // own call can silently vanish before the next call runs — the bypass would then look "applied"
    // while the real SELECT sees RLS-filtered (near-empty) rows and this guard reports a false "no
    // active row" pass forever, regardless of real state. Sending SET + SELECT as ONE multi-statement
    // string guarantees the whole simple-query message executes as a single implicit transaction on
    // one backend. (Found live 2026-08-16 while authoring the sibling settlement-posting-config guard
    // — this file shipped with the same latent flaw and is fixed in the same pass.)
    const results = await client.query(
      `
        SELECT set_config('app.bypass_rls', 'lucia', true);
        SELECT id::text AS id, operating_company_id::text AS operating_company_id, account_name
        FROM catalogs.accounts
        WHERE account_number IS NULL
          AND deactivated_at IS NULL
        ORDER BY created_at DESC;
      `
    );
    const res = Array.isArray(results) ? results[results.length - 1] : results;

    if (res.rows.length > 0) {
      const ids = res.rows.map((row) => `${row.id} (${row.account_name})`).join(", ");
      console.error(`${LABEL} FAILED\n- active account(s) with NULL account_number present: ${ids}`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  console.log(`${LABEL} — OK`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertConstraintIntact(read(MIGRATION_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }

  await liveScan();
}

main().catch((error) => {
  console.error(`${LABEL} FAILED\n- ${String(error?.message ?? error)}`);
  process.exit(1);
});
