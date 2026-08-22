#!/usr/bin/env node
/**
 * ACCT-F5760 — views.factoring_chargebacks_fees's factor_fee_amount column was sourced via
 * to_jsonb(fa.*)->>'factor_fee_amount' / ->>'fee_amount' dynamic key lookups against key names that
 * DO NOT EXIST on accounting.factoring_advances at all (confirmed live via information_schema.columns
 * — the real column is factor_fee_cents, bigint cents) — same defect class as ACCT-F5753
 * (views.factoring_recourse_at_risk, PR #13911). Fixed to read fa.factor_fee_cents / 100.
 * statement_reference's dead 'statement_reference' key coincidentally fell through to a real 'memo'
 * key — hardened to read fa.memo directly. chargeback_amount has no backing column/table anywhere
 * (confirmed live), so it is now an honest 0::numeric literal instead of a phantom-key lookup.
 *
 * INVARIANT (static — no database): the LATEST migration touching views.factoring_chargebacks_fees
 * must select factor_fee_amount from fa.factor_fee_cents (divided by 100), statement_reference from
 * fa.memo (not a to_jsonb dynamic-key lookup), and must NOT reintroduce a
 * to_jsonb(fa.*)->>'factor_fee_amount' / '...fee_amount' / '...statement_reference' dead-key lookup.
 *
 * Self-test: node scripts/verify-factoring-chargebacks-fees-view-real-cents-columns.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const LABEL = "verify-factoring-chargebacks-fees-view-real-cents-columns";

function latestChargebacksFeesViewMigration() {
  // Match migrations that DEFINE the view (CREATE [OR REPLACE] VIEW views.factoring_chargebacks_fees),
  // not just any migration that mentions the view name in passing — e.g. a later migration's dependency
  // comment or a `SELECT ... FROM views.factoring_chargebacks_fees` read. ACCT-F5761's migration
  // (202613020000, factoring_statements_settings) sorts after this view's real defining migration
  // (202613010000, ACCT-F5760) and references the view by name in both a comment and a SELECT — a naive
  // "last file that mentions the string" selector wrongly picked 202613020000, which never redefines
  // factor_fee_amount/statement_reference/chargeback_amount at all, producing a false "reverted" failure
  // against a migration that was never supposed to carry those columns in the first place.
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const matches = files.filter((f) => {
    const src = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    return /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+views\.factoring_chargebacks_fees\b/i.test(src);
  });
  matches.sort();
  return matches[matches.length - 1] ?? null;
}

export function checkChargebacksFeesViewSource(src) {
  const problems = [];

  if (!/fa\.factor_fee_cents::numeric\s*\/\s*100/.test(src)) {
    problems.push("factor_fee_amount no longer reads fa.factor_fee_cents (real column) — still dead or reverted");
  }
  if (!/NULLIF\(fa\.memo, ''\)/.test(src)) {
    problems.push("statement_reference no longer reads fa.memo directly — still dead or reverted");
  }
  if (/to_jsonb\(fa\.\*\)->>'(factor_fee_amount|fee_amount|statement_reference|chargeback_amount)'/.test(src)) {
    problems.push("dead to_jsonb(fa.*)->>'factor_fee_amount'/'fee_amount'/'statement_reference'/'chargeback_amount' key lookup reintroduced");
  }
  if (!/0::numeric AS chargeback_amount/.test(src)) {
    problems.push("chargeback_amount no longer an honest 0::numeric literal (no backing column/table exists)");
  }

  return problems;
}

function selftest() {
  const good = `
    SELECT
      0::numeric AS chargeback_amount,
      (fa.factor_fee_cents::numeric / 100) AS factor_fee_amount,
      COALESCE(NULLIF(fa.memo, ''), fa.display_id, fa.id::text) AS statement_reference
    FROM accounting.factoring_advances fa
  `;
  const goodProblems = checkChargebacksFeesViewSource(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    good.replace("(fa.factor_fee_cents::numeric / 100) AS factor_fee_amount,\n", ""),
    good.replace("COALESCE(NULLIF(fa.memo, ''), fa.display_id, fa.id::text) AS statement_reference\n", "fa.id::text AS statement_reference\n"),
    good.replace("0::numeric AS chargeback_amount,\n", "COALESCE(NULLIF(to_jsonb(fa.*)->>'chargeback_amount', '')::numeric, 0)::numeric AS chargeback_amount,\n"),
    good.replace(
      "(fa.factor_fee_cents::numeric / 100) AS factor_fee_amount,",
      "COALESCE(NULLIF(to_jsonb(fa.*)->>'factor_fee_amount', '')::numeric, NULLIF(to_jsonb(fa.*)->>'fee_amount', '')::numeric, 0)::numeric AS factor_fee_amount,"
    ),
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (checkChargebacksFeesViewSource(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const migrationFile = latestChargebacksFeesViewMigration();
if (!migrationFile) {
  console.error(`[${LABEL}] FAILED — no migration touching views.factoring_chargebacks_fees found in ${MIGRATIONS_DIR}`);
  process.exit(1);
}
const src = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationFile), "utf8");
const failures = checkChargebacksFeesViewSource(src);
if (failures.length) {
  console.error(`[${LABEL}] FAILED (${migrationFile}):\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — ${migrationFile} reads views.factoring_chargebacks_fees's money columns from the real columns, not a dead JSONB key probe`);
