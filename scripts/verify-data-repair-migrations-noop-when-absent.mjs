#!/usr/bin/env node
/**
 * GUARD: a DATA-REPAIR migration must NO-OP when its subject is absent, never RAISE.
 *
 * WHY THIS EXISTS (CI 2026-09-30T13:12:38Z, the third fresh-DB blocker in one session):
 * 202614640000_fix_usmca_def_item_account_5010.sql repairs two catalogs.items rows for the USMCA
 * company. No migration inserts USMCA into org.companies, so on any database built from source --
 * CI, a DR restore, a new Neon branch -- that company, its chart of accounts and those items do
 * not exist. There is nothing to repair. The migration nevertheless raised on its own precondition:
 *   RAISE EXCEPTION 'ROUND 290.12: expected USMCA accounts 5000 and 5010 to both exist ...'
 * which killed the whole chain.
 *
 * 202614090000_load_exception_reasons.sql already had the correct shape for the same situation:
 *   WHERE EXISTS (SELECT 1 FROM org.companies WHERE id = '5c854333-...')
 *
 * THE RULE: a migration that hardcodes a production company id and REPAIRS rows must guard its
 * work with an existence test, not assert its subject into being. Asserting is right for a
 * migration that CREATES schema; it is wrong for one that repairs data that only production has.
 *
 * Scope: only NEW migrations are held to this. Already-applied files cannot be edited (the ledger
 * enforces checksum immutability -- #23137), so the ones that predate the rule are listed as
 * known debt and are neutralised on non-prod targets by FRESH_DB_PRODUCTION_DATA_ONLY in
 * scripts/db-migrate.mjs. This guard also checks that list stays honest.
 *
 * Usage:  node scripts/verify-data-repair-migrations-noop-when-absent.mjs
 *         node scripts/verify-data-repair-migrations-noop-when-absent.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-data-repair-migrations-noop-when-absent";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "db/migrations");
const MIGRATOR = "scripts/db-migrate.mjs";

/** Company ids that exist only in production -- no migration inserts them into org.companies. */
export const PRODUCTION_ONLY_COMPANY_IDS = ["5c854333-6ea5-4faa-af31-67cb272fef80"];

/** Predates the rule; already applied, therefore uneditable. Neutralised on non-prod by the migrator. */
export const KNOWN_DEBT = new Set([
  "202614640000_fix_usmca_def_item_account_5010.sql",
  // Second shape (see migrationInsertsProductionCompanyUnguarded): INSERT ... VALUES with the USMCA
  // id into an FK-backed table, no existence guard. Applied 2026-09-30, uneditable.
  "202614850000_pm_catalog_usmca.sql",
]);

/**
 * The INSERT rule applies only to migrations numbered AFTER this one. Every earlier migration that
 * binds a production-only company id was proven to pass on a fresh database by the CI log of
 * 2026-10-01 (the chain applied all of them and died first at 202614850000).
 */
export const INSERT_RULE_AFTER = "202614850000";

export function migrationRaisesOnAbsentProductionSubject(sql) {
  const touchesProdCompany = PRODUCTION_ONLY_COMPANY_IDS.some((id) => sql.includes(id));
  if (!touchesProdCompany) return false;
  // Repairs data rather than creating schema?
  if (!/\b(UPDATE|DELETE FROM)\b/i.test(sql)) return false;
  // Already guards its work the right way -- nothing to flag.
  if (/\bWHERE\s+EXISTS\b|\bIF\s+EXISTS\s*\(/i.test(sql)) return false;

  // The specific defect: a value LOOKED UP from data is tested for NULL, and the branch RAISEs.
  // That is "my subject is not here, so fail" -- exactly wrong when the subject is production-only.
  //
  // Deliberately NOT flagged, both measured as false positives on 2026-09-30:
  //   - a POST-condition count check (`IF remaining_count <> 0 THEN RAISE`) --
  //     202613761300_samsara_usmca_retag.sql. On a fresh database the count is 0 and it no-ops
  //     correctly. Asserting that work you just did landed is right, not wrong.
  //   - a SCHEMA existence check (`IF to_regprocedure(...) IS NULL THEN RAISE`) --
  //     202614131200_invoice_disputes.sql. A missing function is a real structural failure and
  //     must still stop the chain.
  if (!/\bSELECT\b[\s\S]{0,400}?\bINTO\b/i.test(sql)) return false;

  const nullRaiseBranches = [...sql.matchAll(/\bIF\b([\s\S]{0,240}?)\bTHEN\b([\s\S]{0,240}?)\bRAISE\s+EXCEPTION/gi)];
  return nullRaiseBranches.some(([, condition]) => {
    if (!/\bIS\s+NULL\b/i.test(condition)) return false;
    // to_regclass / to_regprocedure / to_regtype are SCHEMA questions, not data ones.
    if (/to_reg[a-z]*\s*\(/i.test(condition)) return false;
    return true;
  });
}

/**
 * SECOND SHAPE (CI 2026-10-01, build-typecheck-heavy): a migration INSERTs ... VALUES carrying a
 * production-only company id into a table with an FK to org.companies, with no existence guard. On a
 * fresh database that company does not exist, so the FK fails and the whole chain dies -- the same
 * outcome as the RAISE shape above, reached without any RAISE. Recognised guards are the repo's own
 * idioms: any reference to org.companies (WHERE EXISTS / JOIN / IF EXISTS), or an early skip on a
 * lookup (IF NOT FOUND, or IS NULL THEN ... RETURN / RAISE NOTICE).
 */
export function migrationInsertsProductionCompanyUnguarded(sql) {
  const code = sql.replace(/--[^\n]*/g, "");
  const ids = PRODUCTION_ONLY_COMPANY_IDS.filter((id) => code.includes(id));
  if (ids.length === 0) return false;
  if (/org\.companies/i.test(code)) return false;
  if (/\bNOT\s+FOUND\b/i.test(code)) return false;
  if (/IS\s+NULL\s+THEN[\s\S]{0,160}?\b(RETURN|RAISE\s+NOTICE)\b/i.test(code)) return false;
  const vars = ids.flatMap((id) =>
    [...code.matchAll(new RegExp(`(\\w+)\\s+uuid\\s*(?::=|DEFAULT)\\s*'${id}'`, "gi"))].map((m) => m[1])
  );
  const binds = (text) => ids.some((id) => text.includes(id)) || vars.some((v) => new RegExp(`\\b${v}\\b`).test(text));
  return [...code.matchAll(/INSERT\s+INTO\s+[\w.]+[^;]*?\bVALUES\b([\s\S]*?);/gi)].some((m) => binds(m[1]));
}

export function assertMigrator(migratorSrc) {
  const problems = [];
  if (!/const FRESH_DB_PRODUCTION_DATA_ONLY = new Map\(/.test(migratorSrc)) {
    problems.push(`${MIGRATOR}: FRESH_DB_PRODUCTION_DATA_ONLY is gone -- the known-debt migrations would break every fresh build again.`);
    return problems;
  }
  if (!/function freshDbProductionDataOnlySkip\(file\) \{\s*\n\s*if \(TARGET_IS_PROD\) return null;/.test(migratorSrc)) {
    problems.push(
      `${MIGRATOR}: freshDbProductionDataOnlySkip no longer returns null immediately on TARGET_IS_PROD. ` +
        `Skipping a migration on PRODUCTION would silently lose a real repair -- that gate is the whole safety of this mechanism.`
    );
  }
  const map = migratorSrc.match(/const FRESH_DB_PRODUCTION_DATA_ONLY = new Map\(\[([\s\S]*?)\n\]\);/);
  if (map) {
    const entries = [...map[1].matchAll(/"([^"]+\.sql)"/g)].map((m) => m[1]);
    for (const e of entries) {
      if (!KNOWN_DEBT.has(e)) {
        problems.push(
          `${MIGRATOR}: FRESH_DB_PRODUCTION_DATA_ONLY lists "${e}", which is not in this guard's KNOWN_DEBT set. ` +
            `A new migration must be written to no-op when its subject is absent, not added to the skip list.`
        );
      }
      const sqlPath = path.join(MIGRATIONS, e);
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, "utf8");
        if (/\b(CREATE|ALTER|DROP)\s+(TABLE|COLUMN|INDEX|TYPE|SCHEMA|VIEW)\b/i.test(sql)) {
          problems.push(
            `${MIGRATOR}: FRESH_DB_PRODUCTION_DATA_ONLY lists "${e}", but it carries SCHEMA DDL. Skipping schema makes a ` +
              `fresh database structurally different from production, which is the opposite of the goal. Data repair only.`
          );
        }
      }
    }
    if (!/"[^"]+\.sql",\s*\n\s*"/.test(map[1]) && entries.length && !/\n\s{4}"/.test(map[1])) {
      // entries must carry a written reason (a second string in the pair)
    }
    for (const e of entries) {
      const pair = map[1].match(new RegExp(`"${e.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}",([\\s\\S]{0,40})`));
      if (pair && !/"/.test(pair[1])) {
        problems.push(`${MIGRATOR}: the FRESH_DB_PRODUCTION_DATA_ONLY entry for "${e}" carries no written reason.`);
      }
    }
  }
  return problems;
}

export function assertMigrations(files) {
  const problems = [];
  for (const { name, sql } of files) {
    if (KNOWN_DEBT.has(name)) continue;
    if (name.slice(0, INSERT_RULE_AFTER.length) > INSERT_RULE_AFTER && migrationInsertsProductionCompanyUnguarded(sql)) {
      problems.push(
        `db/migrations/${name}: INSERTs ... VALUES with a PRODUCTION-ONLY company id and no existence guard. On any ` +
          `database built from source that company does not exist, so the FK to org.companies fails and kills the ` +
          `whole migration chain. Guard it: \`WHERE EXISTS (SELECT 1 FROM org.companies WHERE id = ...)\`.`
      );
    }
    if (migrationRaisesOnAbsentProductionSubject(sql)) {
      problems.push(
        `db/migrations/${name}: repairs data scoped to a PRODUCTION-ONLY company id and RAISEs when its subject is ` +
          `missing, with no existence guard. On any database built from source that company does not exist, so there ` +
          `is nothing to repair and this kills the whole migration chain. Guard the work with ` +
          `\`WHERE EXISTS (SELECT 1 FROM org.companies WHERE id = ...)\` (see 202614090000_load_exception_reasons.sql) ` +
          `instead of asserting the subject into being.`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const ID = PRODUCTION_ONLY_COMPANY_IDS[0];
  const expect = (name, got, needle) => {
    if (!got.some((p) => p.includes(needle))) failures.push(`${name}: planted defect NOT caught (got: ${got.join(" | ") || "none"})`);
  };
  const refute = (name, got) => {
    if (got.length) failures.push(`${name}: false positive -- ${got.join(" | ")}`);
  };

  // 1. THE REAL REGRESSION -- a repair migration that raises instead of no-opping.
  expect(
    "raises-on-absent-subject",
    // Verbatim shape of 202614640000, the migration that actually broke the chain.
    assertMigrations([{ name: "999_new.sql", sql: `DO $$ DECLARE v_acct uuid; BEGIN SELECT id INTO v_acct FROM catalogs.accounts WHERE operating_company_id = '${ID}' AND account_number = '5010'; IF v_acct IS NULL THEN RAISE EXCEPTION 'expected account to exist -- found %', v_acct; END IF; UPDATE catalogs.items SET default_expense_account_id = v_acct WHERE operating_company_id = '${ID}'; END $$;` }]),
    "RAISEs when its subject is"
  );
  // 2. The correct shape passes.
  refute(
    "where-exists-passes",
    assertMigrations([{ name: "999_ok.sql", sql: `UPDATE catalogs.items SET x=1 WHERE operating_company_id='${ID}' AND EXISTS (SELECT 1 FROM org.companies WHERE id='${ID}');` }])
  );
  // 3. Schema migrations that raise are NOT this guard's business.
  refute("schema-raise-passes", assertMigrations([{ name: "999_schema.sql", sql: `DO $$ BEGIN RAISE EXCEPTION 'x'; END $$; ALTER TABLE t ADD COLUMN c text;` }]));
  // 4. A migration with no production company id is out of scope.
  refute("no-prod-id-passes", assertMigrations([{ name: "999_generic.sql", sql: `DO $$ BEGIN RAISE EXCEPTION 'x'; END $$; UPDATE t SET a=1;` }]));
  // 5a. MEASURED FALSE POSITIVES -- both live migrations, both correct, both must stay silent.
  refute(
    "post-condition-count-passes",
    assertMigrations([{ name: "999_count.sql", sql: `DO $$ DECLARE n int; BEGIN SELECT count(*) INTO n FROM t WHERE operating_company_id='${ID}'; IF n <> 0 THEN RAISE EXCEPTION 'incomplete: %', n; END IF; UPDATE t SET a=1 WHERE operating_company_id='${ID}'; END $$;` }])
  );
  refute(
    "schema-existence-check-passes",
    assertMigrations([{ name: "999_regproc.sql", sql: `DO $$ DECLARE v uuid; BEGIN SELECT id INTO v FROM t WHERE operating_company_id='${ID}'; IF to_regprocedure('x.y()') IS NULL THEN RAISE EXCEPTION 'missing fn'; END IF; UPDATE t SET a=1; END $$;` }])
  );

  // 8. SECOND SHAPE -- INSERT ... VALUES binding the production-only id, no guard (202614850000's shape).
  expect(
    "insert-values-unguarded",
    assertMigrations([{ name: "202699990000_new.sql", sql: `DO $$ DECLARE usmca_id uuid := '${ID}'; BEGIN INSERT INTO catalogs.pm_intervals (operating_company_id, code) VALUES (usmca_id, 'PM-A'); END $$;` }]),
    "no existence guard"
  );
  // 9. The same insert guarded by the repo's idioms passes.
  refute(
    "insert-values-guarded-exists",
    assertMigrations([{ name: "202699990001_ok.sql", sql: `INSERT INTO t (operating_company_id, c) SELECT v.id, 'x' FROM (VALUES ('${ID}'::uuid)) v(id) WHERE EXISTS (SELECT 1 FROM org.companies WHERE id = v.id);` }])
  );
  refute(
    "insert-values-guarded-not-found",
    assertMigrations([{ name: "202699990002_ok.sql", sql: `DO $$ DECLARE a uuid; BEGIN SELECT id INTO a FROM catalogs.accounts WHERE operating_company_id='${ID}'; IF NOT FOUND THEN RETURN; END IF; INSERT INTO t (operating_company_id) VALUES ('${ID}'); END $$;` }])
  );
  // 10. Migrations at or before the cutoff are proven by the 2026-10-01 CI log and exempt from the INSERT rule.
  refute(
    "insert-rule-pre-cutoff-exempt",
    assertMigrations([{ name: "202612520200_old.sql", sql: `INSERT INTO t (operating_company_id) VALUES ('${ID}');` }])
  );

  // 5. Known debt is exempt (it cannot be edited).
  refute("known-debt-exempt", assertMigrations([{ name: "202614640000_fix_usmca_def_item_account_5010.sql", sql: `RAISE EXCEPTION 'x'; UPDATE catalogs.items SET a=1 WHERE operating_company_id='${ID}';` }]));

  const migrator = fs.readFileSync(path.join(ROOT, MIGRATOR), "utf8");
  // 6. The prod gate is removed from the skip mechanism.
  expect("prod-gate-removed", assertMigrator(migrator.replace("function freshDbProductionDataOnlySkip(file) {\n  if (TARGET_IS_PROD) return null;", "function freshDbProductionDataOnlySkip(file) {")), "TARGET_IS_PROD");
  // 7. The whole mechanism is deleted.
  expect("mechanism-deleted", assertMigrator(migrator.replace("const FRESH_DB_PRODUCTION_DATA_ONLY = new Map(", "const OTHER = new Map(")), "is gone");

  const liveMigrator = assertMigrator(migrator);
  if (liveMigrator.length) failures.push(`live-migrator: ${liveMigrator.join(" | ")}`);
  const liveMigrations = assertMigrations(
    fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS, name), "utf8") }))
  );
  if (liveMigrations.length) failures.push(`live-migrations: ${liveMigrations.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 13/13 OK`);
  }
} else {
  const problems = [
    ...assertMigrator(fs.readFileSync(path.join(ROOT, MIGRATOR), "utf8")),
    ...assertMigrations(
      fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS, name), "utf8") }))
    ),
  ];
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
