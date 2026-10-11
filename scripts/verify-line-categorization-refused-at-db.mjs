#!/usr/bin/env node
/**
 * verify-line-categorization-refused-at-db — RULING 443.67 #1 a-c (owner 2026-10-11 15:30 CT: "FIX ALL THESE ISSUES
 * PERMANENTLY"), CC-3. A script guard alone is not permanent; the database refuses the bad row for every writer
 * (migration 202615600900). This guard proves the refusal is in force and nothing slipped in before it:
 *   STATIC  S1 the migration defines the line resolver on all three line tables, the item rule, and the expense CHECK.
 *   LIVE    L1 the three line triggers, the item trigger and the expense status trigger exist and are ENABLED;
 *           L2 expenses_posted_is_not_draft is VALIDATED;
 *           L3 at least one company enforces (USMCA by code);
 *           L4 0 live lines without an item, 0 lines whose account differs from the item's default without a reason, 0 posted
 *              expenses reading draft, 0 active items without a category or account — in every enforcing company.
 * --selftest plants each failure.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "the refusal is a live database object — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-line-categorization-refused-at-db";
const MIGRATION = "db/migrations/202615600900_line_categorization_refused_at_db.sql";
const TRIGGERS = [
  ["accounting.bill_lines", "trg_bill_lines_enforce_categorization"],
  ["accounting.expense_lines", "trg_expense_lines_enforce_categorization"],
  ["accounting.invoice_lines", "trg_invoice_lines_enforce_categorization"],
  ["catalogs.items", "trg_items_enforce_category_and_account"],
  ["accounting.expenses", "trg_expenses_posted_reads_posted"],
];

export function staticFailures(sql) {
  const f = [];
  for (const [, t] of TRIGGERS) if (!sql.includes(t)) f.push(`S1 ${MIGRATION}: ${t} missing`);
  for (const w of ["line_item_required", "line_account_differs_from_item", "item_category_required", "item_account_required", "expenses_posted_is_not_draft"])
    if (!sql.includes(w)) f.push(`S1 ${MIGRATION}: refusal "${w}" missing`);
  return f;
}

export function liveFailures(m) {
  const f = [];
  for (const [table, t] of TRIGGERS) {
    const row = m.triggers.find((r) => r.tgname === t);
    if (!row) f.push(`L1 ${table}: trigger ${t} missing`);
    else if (row.tgenabled === "D") f.push(`L1 ${table}: trigger ${t} is DISABLED`);
  }
  if (!m.checkValidated) f.push("L2 expenses_posted_is_not_draft is not VALIDATED");
  if (!m.enforcing) f.push("L3 no company enforces line categorization");
  for (const [k, v] of Object.entries(m.violations)) if (Number(v) !== 0) f.push(`L4 ${k}: ${v}`);
  return f;
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const triggers = (await client.query(
    `SELECT tgname, tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[])`, [TRIGGERS.map(([, t]) => t)])).rows;
  const checkValidated = (await client.query(
    `SELECT convalidated FROM pg_constraint WHERE conname = 'expenses_posted_is_not_draft'`)).rows[0]?.convalidated === true;
  const enforcing = Number((await client.query(`SELECT count(*) FROM org.companies WHERE enforce_line_categorization`)).rows[0].count);
  const violations = (await client.query(`
    WITH co AS (SELECT id FROM org.companies WHERE enforce_line_categorization)
    SELECT
      (SELECT count(*) FROM accounting.bill_lines bl WHERE bl.operating_company_id IN (SELECT id FROM co) AND bl.voided_at IS NULL AND bl.item_id IS NULL) AS bill_lines_without_item,
      (SELECT count(*) FROM accounting.expense_lines el JOIN accounting.expenses e ON e.id = el.expense_id AND e.voided_at IS NULL
        WHERE el.operating_company_id IN (SELECT id FROM co) AND el.item_id IS NULL) AS expense_lines_without_item,
      (SELECT count(*) FROM accounting.invoice_lines il WHERE il.operating_company_id IN (SELECT id FROM co) AND il.soft_deleted_at IS NULL AND il.item_id IS NULL) AS invoice_lines_without_item,
      (SELECT count(*) FROM accounting.bill_lines bl JOIN catalogs.items i ON i.id = bl.item_id
        WHERE bl.operating_company_id IN (SELECT id FROM co) AND bl.voided_at IS NULL AND bl.account_id IS DISTINCT FROM i.default_expense_account_id
          AND length(trim(COALESCE(bl.item_account_override_reason, ''))) < 10) AS bill_lines_off_item_account,
      (SELECT count(*) FROM accounting.expense_lines el JOIN accounting.expenses e ON e.id = el.expense_id AND e.voided_at IS NULL JOIN catalogs.items i ON i.id = el.item_id
        WHERE el.operating_company_id IN (SELECT id FROM co) AND el.expense_account_uuid IS DISTINCT FROM i.default_expense_account_id
          AND length(trim(COALESCE(el.item_account_override_reason, ''))) < 10) AS expense_lines_off_item_account,
      (SELECT count(*) FROM accounting.invoice_lines il JOIN catalogs.items i ON i.id = il.item_id
        WHERE il.operating_company_id IN (SELECT id FROM co) AND il.soft_deleted_at IS NULL AND il.account_id IS DISTINCT FROM i.default_income_account_id
          AND length(trim(COALESCE(il.item_account_override_reason, ''))) < 10) AS invoice_lines_off_item_account,
      (SELECT count(*) FROM accounting.expenses WHERE posting_status = 'posted' AND status = 'draft') AS expenses_posted_reading_draft,
      (SELECT count(*) FROM catalogs.items WHERE operating_company_id IN (SELECT id FROM co) AND deactivated_at IS NULL
        AND (category_id IS NULL OR (default_expense_account_id IS NULL AND default_income_account_id IS NULL))) AS active_items_without_category_or_account`)).rows[0];
  await client.query("ROLLBACK");
  return { triggers, checkValidated, enforcing, violations };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const sql = readFileSync(join(ROOT, MIGRATION), "utf8");
  if (process.argv.includes("--selftest")) {
    const good = { triggers: TRIGGERS.map(([, t]) => ({ tgname: t, tgenabled: "O" })), checkValidated: true, enforcing: 1, violations: { bill_lines_without_item: 0 } };
    const cases = [
      ["the migration passes the static rule", staticFailures(sql).length === 0],
      ["a migration without the invoice-line trigger fails S1", staticFailures(sql.split("trg_invoice_lines_enforce_categorization").join("x")).some((x) => x.startsWith("S1"))],
      ["everything in force passes", liveFailures(good).length === 0],
      ["a missing trigger fails L1", liveFailures({ ...good, triggers: good.triggers.slice(1) }).some((x) => x.startsWith("L1"))],
      ["a disabled trigger fails L1", liveFailures({ ...good, triggers: [{ ...good.triggers[0], tgenabled: "D" }, ...good.triggers.slice(1)] }).some((x) => x.startsWith("L1"))],
      ["a NOT VALID check fails L2", liveFailures({ ...good, checkValidated: false }).some((x) => x.startsWith("L2"))],
      ["no enforcing company fails L3", liveFailures({ ...good, enforcing: 0 }).some((x) => x.startsWith("L3"))],
      ["a line without an item fails L4", liveFailures({ ...good, violations: { bill_lines_without_item: 1 } }).some((x) => x.startsWith("L4"))],
    ];
    for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, p]) => !p).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const sf = staticFailures(sql);
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    let lf = [];
    try {
      const m = await measure(client);
      lf = liveFailures(m);
      console.log(`  enforcing companies ${m.enforcing}; violations ${JSON.stringify(m.violations)}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      lf = [`L0 the live check could not run — ${err?.message ?? err}`];
    }
    const all = [...sf, ...lf];
    if (all.length) { console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — the database refuses uncategorized lines, off-item accounts, draft-posted expenses and uncategorized items for every writer; 0 rows violate.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
