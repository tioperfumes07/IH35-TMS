#!/usr/bin/env node
/**
 * GUARD: voiding an invoice must zero its open balance, not just its status.
 *
 * ACCT-F197 / Cascade FAIL-A1. The void route set `status='void'` and `voided_at=now()` and left
 * `amount_open_cents` at its full value. Every surface that sums that column kept counting a
 * receivable nobody owes.
 *
 * Measured on prod: ALL SEVEN voided USMCA invoices still carried their full open balance —
 * $3,983.07, which is 56.4% of the entity's reported A/R. TRANSP had the same fault at 49.7%.
 *
 * WHY ZEROING IS NOT INVENTING A NUMBER, which is the objection this fix has to survive:
 * amount_open_cents is a DERIVED CACHE of (total_cents - amount_paid_cents). For a voided invoice
 * the derived value IS zero, because a void owes nothing. Leaving the cache stale is the invention —
 * it asserts a balance that no longer exists. The GL is untouched here; the reversing JE is posted
 * separately by the void engine when VOID_ENFORCEMENT_ENABLED is on, and this guard says nothing
 * about that.
 *
 * BILLS DELIBERATELY EXCLUDED. accounting.bills has NO stored open column — it is always computed as
 * (amount_cents - paid_cents) — and voided bills carry status='void', so status-based readers exclude
 * them already. There is no cache to go stale, so there is nothing to assert.
 *
 * Run:  node scripts/verify-void-zeroes-open-balance.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/accounting/invoices.routes.ts";
const LABEL = "verify-void-zeroes-open-balance";

const read = (rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};
/** SQL line comments stripped: this fix ships with a long note naming every token checked. */
const strip = (s) => s.replace(/^[ \t]*--[^\n]*$/gm, "").replace(/\/\/[^\n]*/g, "");

export function collectProblems(src) {
  if (src == null) return [`missing ${ROUTES}`];
  const code = strip(src);
  const problems = [];

  const stmt = /UPDATE\s+accounting\.invoices\s+SET[\s\S]{0,900}?WHERE\s+id\s*=\s*\$1/i.exec(code)?.[0] ?? "";
  if (!stmt) {
    problems.push(`${ROUTES}: could not find the void UPDATE on accounting.invoices — re-verify the route.`);
    return problems;
  }
  if (!/status\s*=\s*'void'/i.test(stmt) || !/voided_at\s*=\s*now\(\)/i.test(stmt)) {
    problems.push(`${ROUTES}: the void UPDATE no longer sets status='void' and voided_at — that is the void itself.`);
  }
  if (!/amount_open_cents\s*=\s*0/i.test(stmt)) {
    problems.push(
      `${ROUTES}: voiding does not zero amount_open_cents. That column is a DERIVED CACHE of ` +
        `(total - paid); leaving it at its pre-void value makes every surface summing it report a ` +
        `receivable nobody owes — 56.4% of USMCA's A/R when this was found (ACCT-F197 / FAIL-A1).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const src = read(ROUTES);
  const baseline = collectProblems(src);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree is not green:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const failures = [];
  const mutations = [
    ["the FAIL-A1 defect verbatim — zeroing removed", src.replace(/\n\s*amount_open_cents = 0,/, "")],
    ["zeroed to a non-zero value", src.replace("amount_open_cents = 0", "amount_open_cents = 1")],
    ["the void itself removed", src.replace("status = 'void'", "status = 'sent'")],
  ];
  for (const [why, mutated] of mutations) {
    if (mutated === src) failures.push(`${why} — MUTATION INERT (changed nothing)`);
    else if (collectProblems(mutated).length === 0) failures.push(`${why} — NOT DETECTED`);
  }
  // A comment naming the column must not satisfy the check — this fix ships with exactly such a note.
  const commentOnly = src.replace("amount_open_cents = 0", "-- amount_open_cents = 0 (was here)");
  if (commentOnly !== src && collectProblems(commentOnly).length === 0) {
    failures.push("a COMMENTED-OUT zeroing satisfied the check — false green");
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of failures) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 4/4 (zeroing removed, non-zero value, void removed, commented-out cannot fake it)`);
  process.exit(0);
}

const problems = collectProblems(read(ROUTES));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — voiding an invoice zeroes its open balance, so no voided paper reaches an A/R total.`);
