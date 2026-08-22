#!/usr/bin/env node
/**
 * verify-factoring-summary-dollars-unit.mjs  (permanent unit guard)
 *
 * views.factoring_summary.{reserve_balance, mtd_advanced_total, chargeback_balance}
 * are in DOLLARS, not cents.
 *
 * WHY THIS GUARD EXISTS: this view's unit has flip-flopped FOUR times across migrations —
 *   0052 dollars → 0061 cents → 0123 cents → 0124 dollars (current/live).
 * The live definition (migration 0124) sources these three fields from
 *   accounting.factoring_companies.current_reserve_balance / current_chargeback_balance
 *   (both ::numeric, NO _cents suffix — dollars) and SUM(factoring_advances.advance_amount)
 *   (NO _cents suffix — dollars).
 * A consumer that divides these by 100 renders the figure 100x too SMALL
 * (the real FactoringQueuePage bug we just fixed); a backend reader that multiplies a
 * *cents* value by 100 would render it 100x too LARGE. Pin the convention so neither
 * regresses silently.
 *
 * Checks:
 *  (a) The LATEST migration that (re)defines views.factoring_summary must map reserve_balance
 *      from a dollars source — i.e. `current_reserve_balance AS reserve_balance`
 *      (legacy factoring_companies column OR cents→dollars /100 intermediate alias).
 *      This catches a future migration flipping the unit back to a raw *_cents source.
 *  (b) No frontend/*.tsx consumer divides these three summary fields by 100 (dollars ⇒ no /100).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const errors = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const SUMMARY_FIELDS = ["reserve_balance", "mtd_advanced_total", "chargeback_balance"];

// ── (a) live migration definition must keep reserve_balance dollars-denominated ─────────────
const MIG_DIR = "db/migrations";
const migFiles = fs.existsSync(path.join(ROOT, MIG_DIR))
  ? fs
      .readdirSync(path.join(ROOT, MIG_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort()
  : [];

// The migration that has the final word is the highest-sorted file that DEFINES the view
// (CREATE [OR REPLACE] VIEW), not merely one that mentions/reads it — a later migration can
// legitimately SELECT FROM views.factoring_summary as a dependency (e.g. ACCT-F5761's
// factoring_statements_settings gate) without redefining it; a bare-substring match wrongly
// treated that as the "latest" definition and produced a false failure (same bug class fixed in
// verify-factoring-chargebacks-fees-view-real-cents-columns.mjs / verify-factoring-recourse-view-
// real-cents-columns.mjs).
const defining = migFiles.filter((f) =>
  /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+views\.factoring_summary\b/i.test(read(path.join(MIG_DIR, f)))
);
if (defining.length === 0) {
  errors.push(`(a) no migration references views.factoring_summary — cannot verify unit convention.`);
} else {
  const latest = defining[defining.length - 1];
  const sql = read(path.join(MIG_DIR, latest));
  // The live view must alias reserve_balance from a DOLLARS (non-_cents) source column.
  const dollarsSource = /current_reserve_balance[^\n]*AS\s+reserve_balance/i.test(sql);
  const centsSource =
    /reserve_(?:amount|pending|receivable_signed)_cents[^\n]*AS\s+reserve_balance/i.test(sql);
  if (centsSource || !dollarsSource) {
    errors.push(
      `(a) ${latest}: views.factoring_summary.reserve_balance is no longer sourced from the dollars ` +
        `column current_reserve_balance (found cents-source or missing dollars alias). The view unit ` +
        `flip-flopped before — if you INTENTIONALLY moved it back to cents, update ALL consumers ` +
        `(cash-flow-overview.routes.ts *100, FactoringQueuePage.tsx, FactoringHome.tsx) AND this guard.`,
    );
  }
}

// ── (b) no frontend summary consumer may divide these dollars fields by 100 ─────────────────
const FE_DIR = "apps/frontend/src";
function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    const rel = path.join(dir, name);
    const st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

// Match e.g. `reserve_balance || 0) / 100` or `mtd_advanced_total ?? 0)/100` etc.
const divByHundred = (field) =>
  new RegExp(`${field}[^\\n;]{0,40}[)\\s]/\\s*100\\b`);

for (const f of walk(FE_DIR)) {
  const src = read(f);
  for (const field of SUMMARY_FIELDS) {
    if (divByHundred(field).test(src)) {
      errors.push(
        `(b) ${f}: divides factoring-summary field \`${field}\` by 100 — but views.factoring_summary ` +
          `emits DOLLARS (migration 0124). Format directly as dollars (see FactoringHome.tsx / ` +
          `FactoringQueuePage.tsx). Dividing renders the figure 100x too small.`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("verify-factoring-summary-dollars-unit FAIL:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log(
  "verify-factoring-summary-dollars-unit OK — views.factoring_summary {reserve_balance, mtd_advanced_total, chargeback_balance} treated as dollars everywhere.",
);
