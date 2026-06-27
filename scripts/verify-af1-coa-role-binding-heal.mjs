#!/usr/bin/env node
// Static guard for the AF-1 V1 fix (GUARD branch-test 2026-06-27): a TRK uncategorized_expense binding was
// left pointing at account 6999 after the Q1 6999→TRANSP override (a single-owner override has no TRK split
// copy for the 3.1 re-key to follow) → a CROSS-ENTITY chart_of_accounts_roles binding, which V1 counts INCLUDING
// inactive rows. The fix (migration STEP 3.4) re-points such orphaned config bindings to the entity's own
// EQUIVALENT account (by account_number, incl. the '<CODE>-<number>' prefixed form, e.g. TRK-6999) and then
// FAIL-LOUD RAISEs if ANY of the six V1 child tables still has a cross-entity binding. This guard asserts that
// heal + the in-migration V1 sub-check can never be silently removed. (§2: every bug fix gets a static CI guard.)
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-af1-coa-role-binding-heal: ${m}`); process.exit(1); };

const migrationsDir = join(root, "db/migrations");
const af1 = readdirSync(migrationsDir).filter((f) => /af1_catalogs_accounts_per_entity\.sql$/i.test(f));
if (af1.length === 0) {
  // The migration isn't present (e.g. checked out before #1528 lands). Nothing to guard — pass.
  console.log("PASS verify-af1-coa-role-binding-heal (AF-1 migration not present)");
  process.exit(0);
}
if (af1.length > 1) fail(`expected one AF-1 migration, found ${af1.length}: ${af1.join(", ")}`);
const sql = readFileSync(join(migrationsDir, af1[0]), "utf8");

// 1. STEP 3.4 heal: re-point orphaned config bindings to the entity's equivalent account BY account_number.
const must = [
  [/STEP 3\.4/i, "must keep STEP 3.4 (heal config bindings orphaned by a single-owner ownership override)"],
  [/UPDATE\s+accounting\.chart_of_accounts_roles\s+c\b/i, "must re-point orphaned chart_of_accounts_roles bindings (UPDATE … c)"],
  [/UPDATE\s+accounting\.expense_category_account_map\s+c\b/i, "must also heal expense_category_account_map (the twin binding table)"],
  [/ce\.code\s*\|\|\s*'-'\s*\|\|\s*o\.account_number/i, "heal must resolve the entity equivalent BY account_number incl. the '<CODE>-<number>' prefixed form"],
  // 2. the in-migration V1 sub-check across ALL SIX child tables (fail loud, INCLUDING inactive rows).
  [/RAISE\s+EXCEPTION\s+'AF-1 V1: cross-entity account binding/i, "must FAIL LOUD (RAISE) on residual cross-entity bindings — the in-migration V1 sub-check"],
];
for (const [re, msg] of must) if (!re.test(sql)) fail(msg);

// the fail-loud RAISE must cover EXACTLY the six V1 child tables/columns (incl. inactive — no is_active filter).
const v1Tables = [
  /accounting\.journal_entry_postings\b[\s\S]{0,120}?a\.id=c\.account_id/i,
  /accounting\.chart_of_accounts_roles\b[\s\S]{0,120}?a\.id=c\.account_id/i,
  /accounting\.expense_category_account_map\b[\s\S]{0,120}?a\.id=c\.account_id/i,
  /accounting\.escrow_accounts\b[\s\S]{0,120}?a\.id=c\.coa_account_id/i,
  /payroll\.driver_settlement_line_items\b[\s\S]{0,120}?a\.id=c\.posting_account_id/i,
  /accounting\.banking_rules\b[\s\S]{0,120}?a\.id=c\.then_account_id/i,
];
// Anchor the table checks to the RAISE block so they verify the V1 sub-check, not the earlier re-key.
const raiseIdx = sql.search(/FAIL LOUD/i);
const v1Block = raiseIdx >= 0 ? sql.slice(raiseIdx) : sql;
for (const re of v1Tables) {
  if (!re.test(v1Block)) fail(`in-migration V1 sub-check must cover ${re.source.split("\\b")[0].replace(/\\\./g, ".")}`);
}

// 3. void-not-delete: orphans are re-pointed, never DELETEd.
if (/DELETE\s+FROM\s+accounting\.(chart_of_accounts_roles|expense_category_account_map)\b/i.test(sql)) {
  fail("must NOT DELETE config bindings (void-not-delete: re-point account_id instead)");
}

console.log(`PASS verify-af1-coa-role-binding-heal (${af1[0]})`);
