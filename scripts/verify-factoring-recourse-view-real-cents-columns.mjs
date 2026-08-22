#!/usr/bin/env node
/**
 * ACCT-F5753 — views.factoring_recourse_at_risk's invoice_amount/advance_amount/reserve_amount/
 * invoice_reference/customer_name columns were sourced via to_jsonb(fa.*)->>'<key>' dynamic key
 * lookups against key names ('invoice_amount', 'advance_amount', 'reserve_amount', 'invoice_number',
 * 'invoice_id', 'customer_name', 'customer_display_name', 'invoice_total') that DO NOT EXIST on
 * accounting.factoring_advances at all (confirmed live via information_schema.columns) — so every
 * COALESCE chain always fell through to its fallback (0 / the advance's own uuid / 'Unknown
 * Customer'), for every row, regardless of real data. Fixed to read the real _cents columns
 * (invoice_total_cents/advance_amount_cents/reserve_amount_cents) plus a real invoice_reference/
 * customer_name via the actual FK path (accounting.invoices.factoring_advance_id -> mdata.customers).
 *
 * INVARIANT (static — no database): the LATEST migration touching
 * views.factoring_recourse_at_risk must select invoice_amount/advance_amount/reserve_amount from the
 * real *_cents columns (divided by 100), and must NOT reintroduce a to_jsonb(fa.*)->>'invoice_amount'
 * / '...advance_amount' / '...reserve_amount' dead-key lookup.
 *
 * Self-test: node scripts/verify-factoring-recourse-view-real-cents-columns.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const LABEL = "verify-factoring-recourse-view-real-cents-columns";

function latestRecourseViewMigration() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const matches = files.filter((f) => {
    const src = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    return /factoring_recourse_at_risk/.test(src);
  });
  matches.sort();
  return matches[matches.length - 1] ?? null;
}

export function checkRecourseViewSource(src) {
  const problems = [];

  if (!/fa\.invoice_total_cents::numeric\s*\/\s*100/.test(src)) {
    problems.push("invoice_amount no longer reads fa.invoice_total_cents (real column) — still dead or reverted");
  }
  if (!/fa\.advance_amount_cents::numeric\s*\/\s*100/.test(src)) {
    problems.push("advance_amount no longer reads fa.advance_amount_cents (real column) — still dead or reverted");
  }
  if (!/fa\.reserve_amount_cents::numeric\s*\/\s*100/.test(src)) {
    problems.push("reserve_amount no longer reads fa.reserve_amount_cents (real column) — still dead or reverted");
  }
  if (/to_jsonb\(fa\.\*\)->>'(invoice_amount|advance_amount|reserve_amount)'/.test(src)) {
    problems.push("dead to_jsonb(fa.*)->>'invoice_amount'/'advance_amount'/'reserve_amount' key lookup reintroduced");
  }
  if (!/customer_name\)::text AS customer_name|c\.customer_name/.test(src)) {
    problems.push("customer_name no longer resolved via a real customer join");
  }

  return problems;
}

function selftest() {
  const good = `
    SELECT
      (fa.invoice_total_cents::numeric / 100) AS invoice_amount,
      (fa.advance_amount_cents::numeric / 100) AS advance_amount,
      (fa.reserve_amount_cents::numeric / 100) AS reserve_amount,
      COALESCE(c.customer_name, 'Unknown Customer')::text AS customer_name
    FROM accounting.factoring_advances fa
  `;
  const goodProblems = checkRecourseViewSource(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    good.replace("(fa.invoice_total_cents::numeric / 100) AS invoice_amount,\n", ""),
    good.replace("(fa.advance_amount_cents::numeric / 100) AS advance_amount,\n", ""),
    good.replace("(fa.reserve_amount_cents::numeric / 100) AS reserve_amount,\n", ""),
    good.replace(
      "(fa.advance_amount_cents::numeric / 100) AS advance_amount,",
      "COALESCE(NULLIF(to_jsonb(fa.*)->>'advance_amount', '')::numeric, 0)::numeric AS advance_amount,"
    ),
    good.replace("COALESCE(c.customer_name, 'Unknown Customer')::text AS customer_name\n", "'Unknown Customer'::text AS customer_name\n"),
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (checkRecourseViewSource(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const migrationFile = latestRecourseViewMigration();
if (!migrationFile) {
  console.error(`[${LABEL}] FAILED — no migration touching views.factoring_recourse_at_risk found in ${MIGRATIONS_DIR}`);
  process.exit(1);
}
const src = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationFile), "utf8");
const failures = checkRecourseViewSource(src);
if (failures.length) {
  console.error(`[${LABEL}] FAILED (${migrationFile}):\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — ${migrationFile} reads views.factoring_recourse_at_risk's money columns from the real *_cents columns, not a dead JSONB key probe`);
