#!/usr/bin/env node
/**
 * ACCT-F5761 — views.factoring_statements_settings was permanently pinned to a WHERE-false empty
 * placeholder branch via a stale to_regclass('accounting.factoring_companies') existence-gate against a
 * retired table (confirmed live via pg_get_viewdef) — even though both of its real dependencies
 * (views.factoring_summary, views.factoring_chargebacks_fees) now carry live data. Fixed by rebuilding
 * the view unconditionally, dropping the accounting.factoring_companies gate.
 *
 * INVARIANT (static — no database): the LATEST migration touching views.factoring_statements_settings
 * must NOT gate on to_regclass('accounting.factoring_companies'), must source from BOTH
 * views.factoring_summary and views.factoring_chargebacks_fees, and must NOT contain a WHERE-false
 * empty-placeholder fallback for this view.
 *
 * Self-test: node scripts/verify-factoring-statements-settings-not-phantom-empty.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const LABEL = "verify-factoring-statements-settings-not-phantom-empty";

function latestStatementsSettingsViewMigration() {
  // Match migrations that DEFINE the view (CREATE [OR REPLACE] VIEW views.factoring_statements_settings),
  // not just any migration that mentions the view name in passing. Currently the real defining migration
  // happens to sort last among files mentioning the string, but this is the exact selector shape that
  // just produced a false failure in the sibling guards (verify-factoring-chargebacks-fees-view-real-
  // cents-columns.mjs / verify-factoring-recourse-view-real-cents-columns.mjs) once a later migration
  // referenced the view name in a comment/dependency read without redefining it — hardened here
  // pre-emptively rather than waiting for the same bug to land a third time.
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const matches = files.filter((f) => {
    const src = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    return /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+views\.factoring_statements_settings\b/i.test(src);
  });
  matches.sort();
  return matches[matches.length - 1] ?? null;
}

export function checkStatementsSettingsViewSource(src) {
  const problems = [];

  if (/to_regclass\('accounting\.factoring_companies'\)/.test(src)) {
    problems.push("stale to_regclass('accounting.factoring_companies') existence-gate reintroduced");
  }
  if (!/FROM views\.factoring_summary fs/.test(src)) {
    problems.push("no longer sources active_factor from views.factoring_summary — still dead or reverted");
  }
  if (!/FROM views\.factoring_chargebacks_fees fcf/.test(src)) {
    problems.push("no longer sources statement_rollup from views.factoring_chargebacks_fees — still dead or reverted");
  }
  if (/WHERE false/.test(src)) {
    problems.push("WHERE-false empty-placeholder fallback still present");
  }

  return problems;
}

function selftest() {
  const good = `
    CREATE OR REPLACE VIEW views.factoring_statements_settings
    WITH (security_invoker = true) AS
    WITH active_factor AS (
      SELECT fs.operating_company_id, fs.active_factor_id
      FROM views.factoring_summary fs
    ),
    statement_rollup AS (
      SELECT fcf.operating_company_id, SUM(fcf.factor_fee_amount)::numeric AS month_factor_fees_total
      FROM views.factoring_chargebacks_fees fcf
      GROUP BY fcf.operating_company_id
    )
    SELECT af.operating_company_id, sr.month_factor_fees_total
    FROM active_factor af
    LEFT JOIN statement_rollup sr ON sr.operating_company_id = af.operating_company_id
  `;
  const goodProblems = checkStatementsSettingsViewSource(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    `IF to_regclass('accounting.factoring_companies') IS NOT NULL THEN\n${good}\nEND IF;`,
    good.replace("FROM views.factoring_summary fs", "FROM catalogs.accounts fs"),
    good.replace("FROM views.factoring_chargebacks_fees fcf", "FROM accounting.factoring_advances fcf"),
    good.replace(
      "SELECT af.operating_company_id, sr.month_factor_fees_total\n    FROM active_factor af",
      "SELECT NULL::uuid AS operating_company_id, 0::numeric AS month_factor_fees_total WHERE false\n    -- unreachable\n    /* FROM active_factor af"
    ) + " */",
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (checkStatementsSettingsViewSource(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const migrationFile = latestStatementsSettingsViewMigration();
if (!migrationFile) {
  console.error(`[${LABEL}] FAILED — no migration touching views.factoring_statements_settings found in ${MIGRATIONS_DIR}`);
  process.exit(1);
}
const src = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationFile), "utf8");
const failures = checkStatementsSettingsViewSource(src);
if (failures.length) {
  console.error(`[${LABEL}] FAILED (${migrationFile}):\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — ${migrationFile} rebuilds views.factoring_statements_settings unconditionally, no phantom-empty gate`);
