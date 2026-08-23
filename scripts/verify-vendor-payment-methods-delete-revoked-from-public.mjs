#!/usr/bin/env node
/**
 * GUARD: mdata.vendor_payment_methods must have DELETE revoked from BOTH ih35_app AND PUBLIC.
 *
 * ROOT CAUSE this freezes shut: 202613110000 (the migration creating this table) correctly revoked
 * DELETE from ih35_app, following the documented mdata ALTER-DEFAULT-PRIVILEGES landmine. Applying
 * it live on Neon prod revealed a SECOND, wider grant on the same schema: PUBLIC also had DELETE by
 * default (`pg_default_acl`'s `{=arwd/...}` entry — the leading `=` with no role name is PUBLIC).
 * Every role inherits PUBLIC's grants regardless of its own REVOKE, so `REVOKE ... FROM ih35_app`
 * alone left `has_table_privilege('ih35_app', ..., 'DELETE')` still TRUE. 202613110000 is already
 * applied/merged and cannot be edited in place; 202613120000 is the follow-up fix this guard
 * protects. See both migrations' headers for the full live-Neon finding.
 *
 * Static-only (no DB connection) — checks that SOME migration in db/migrations/ carries the
 * `REVOKE DELETE ON mdata.vendor_payment_methods FROM PUBLIC` statement. A live re-check of
 * has_table_privilege against Neon happens via the migration's own apply-time verification, not
 * this guard (CI has no prod DB access).
 *
 * Run:  node scripts/verify-vendor-payment-methods-delete-revoked-from-public.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(root, "db/migrations");
const LABEL = "verify-vendor-payment-methods-delete-revoked-from-public";

const REVOKE_FROM_ihApp = /REVOKE\s+DELETE\s+ON\s+mdata\.vendor_payment_methods\s+FROM\s+ih35_app/i;
const REVOKE_FROM_PUBLIC = /REVOKE\s+DELETE\s+ON\s+mdata\.vendor_payment_methods\s+FROM\s+PUBLIC/i;

export function checkMigrations(sources) {
  const problems = [];
  const hasIhAppRevoke = sources.some((s) => REVOKE_FROM_ihApp.test(s.src));
  const hasPublicRevoke = sources.some((s) => REVOKE_FROM_PUBLIC.test(s.src));
  if (!hasIhAppRevoke) {
    problems.push("no migration revokes DELETE on mdata.vendor_payment_methods FROM ih35_app");
  }
  if (!hasPublicRevoke) {
    problems.push(
      "no migration revokes DELETE on mdata.vendor_payment_methods FROM PUBLIC -- ih35_app inherits " +
        "PUBLIC's default-privilege DELETE grant regardless of its own REVOKE (confirmed live on Neon prod)"
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const onlyIhAppRevoked = [
    { file: "a.sql", src: "GRANT SELECT, INSERT, UPDATE ON mdata.vendor_payment_methods TO ih35_app;\nREVOKE DELETE ON mdata.vendor_payment_methods FROM ih35_app;" },
  ];
  const problemsOnlyIhApp = checkMigrations(onlyIhAppRevoked);
  if (problemsOnlyIhApp.length !== 1) {
    failures.push(`the real pre-fix defect (PUBLIC never revoked) was not caught (got ${problemsOnlyIhApp.length} problems, expected 1)`);
  }

  const neitherRevoked = [{ file: "a.sql", src: "CREATE TABLE mdata.vendor_payment_methods (id uuid);" }];
  if (checkMigrations(neitherRevoked).length !== 2) {
    failures.push("a migration with neither REVOKE was not fully caught");
  }

  const bothRevokedAcrossFiles = [
    { file: "202613110000.sql", src: "REVOKE DELETE ON mdata.vendor_payment_methods FROM ih35_app;" },
    { file: "202613120000.sql", src: "REVOKE DELETE ON mdata.vendor_payment_methods FROM PUBLIC;" },
  ];
  if (checkMigrations(bothRevokedAcrossFiles).length !== 0) {
    failures.push("the correct fix (split across two real migration files) was false-positive flagged");
  }

  // A REVOKE for an unrelated table must not satisfy the check.
  const unrelatedTable = [{ file: "a.sql", src: "REVOKE DELETE ON banking.bank_accounts FROM PUBLIC;" }];
  if (checkMigrations(unrelatedTable).length !== 2) {
    failures.push("a REVOKE on an unrelated table was wrongly treated as satisfying this table's check");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — real pre-fix defect (PUBLIC not revoked) caught, missing-both caught, ` +
      `correct fix across two files clears, unrelated-table REVOKE never satisfies the check.`
  );
  process.exit(0);
}

const migrationFiles = fs.existsSync(MIGRATIONS_DIR)
  ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))
  : [];
const sources = migrationFiles.map((f) => ({ file: f, src: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8") }));

const problems = checkMigrations(sources);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — DELETE on mdata.vendor_payment_methods is revoked from both ih35_app and PUBLIC.`);
