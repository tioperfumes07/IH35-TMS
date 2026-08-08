#!/usr/bin/env node
/**
 * GUARD: application code must never write a column that is GENERATED on prod. ACCT-F200.
 *
 * THE OUTAGE THIS EXISTS FOR. The invoice void route shipped `SET amount_open_cents = 0`. That column
 * is STORED GENERATED on prod, so Postgres rejected the statement and EVERY invoice void returned 500
 * until it was reverted in 6c73e28. There is no partial failure mode here and no way to discover it in
 * review: a write to a generated column is a guaranteed runtime error on first execution, every time.
 *
 * WHY AN EXISTING GUARD DID NOT CATCH IT. scripts/verify-generated-column-immutability.mjs sounds like
 * it covers this and does not. It checks that a generated column's EXPRESSION is immutable — no now(),
 * random(), nextval() — when a MIGRATION declares one. Nothing anywhere checked the far more dangerous
 * direction: application SQL writing such a column. That gap is precisely why a green build shipped a
 * P0, and closing it is the whole point of this file.
 *
 * WHY THE LIST IS STATIC AND PROD-DERIVED. These four are read off the prod branch
 * br-fancy-credit-akjnd07a via pg_attribute (attgenerated <> ''), 2026-08-08, across the money schemas.
 * db/migrations does not describe this state — amount_open_cents is not declared GENERATED in any
 * migration in the repo — so a repo-derived list would confidently report the wrong answer, which is
 * the same failure that produced the outage. This is a recorded prod fact carrying its verification
 * date, deliberately not auto-discovered.
 *
 * ADDING TO THIS LIST IS SAFE AND CORRECT when prod gains a generated column. REMOVING an entry is
 * only ever right when prod genuinely stops generating that column — never to make a build green.
 *
 * Run:  node scripts/verify-no-write-to-generated-column.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "apps/backend/src");
const LABEL = "verify-no-write-to-generated-column";

/** Verified live on Neon prod branch br-fancy-credit-akjnd07a via pg_attribute, 2026-08-08. */
export const GENERATED_COLUMNS = [
  { table: "accounting.invoices", column: "amount_open_cents", expr: "total_cents - amount_paid_cents" },
  { table: "accounting.payments", column: "amount_unapplied_cents", expr: "amount_cents - amount_applied_cents" },
  { table: "accounting.vendor_credits", column: "amount_unapplied_cents", expr: "amount_cents - amount_applied_cents" },
  { table: "driver_finance.driver_escrow_separations", column: "eligible_release_date", expr: "separation_date + 90" },
];

export function stripComments(src) {
  return src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Writes to `column` on `table`: an UPDATE whose SET clause assigns it, or an INSERT naming it in the
 * column list. A WHERE-clause comparison is a READ and is deliberately allowed — reading a generated
 * column is not merely legal, it is the entire reason the column exists.
 */
export function writesTo(src, { table, column }) {
  const clean = stripComments(src);
  const esc = table.replace(".", "\\.");
  const hits = [];
  const updateRe = new RegExp(`UPDATE\\s+${esc}\\b((?:[^;\`]){0,1600})`, "gi");
  let m;
  while ((m = updateRe.exec(clean)) !== null) {
    const setIdx = m[1].search(/\bSET\b/i);
    if (setIdx === -1) continue;
    const setClause = m[1].slice(setIdx).split(/\bWHERE\b/i)[0];
    if (new RegExp(`\\b${column}\\s*=`, "i").test(setClause)) hits.push(`UPDATE ${table} SET ${column}`);
  }
  const insertRe = new RegExp(`INSERT\\s+INTO\\s+${esc}\\s*\\(([\\s\\S]{0,2000}?)\\)`, "gi");
  while ((m = insertRe.exec(clean)) !== null) {
    if (new RegExp(`\\b${column}\\b`, "i").test(m[1])) hits.push(`INSERT INTO ${table} naming ${column}`);
  }
  return hits;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

export function collectProblems(sources, columns = GENERATED_COLUMNS) {
  const problems = [];
  for (const { file, src } of sources) {
    for (const col of columns) {
      for (const hit of writesTo(src, col)) {
        problems.push(
          `${file}: ${hit}. That column is GENERATED on prod (expr: ${col.expr}), so Postgres rejects ` +
            `the statement and this endpoint 500s on EVERY call — not intermittently, always. This is ` +
            `the ACCT-F197 outage class, reverted in 6c73e28. Derive the value at READ time or change ` +
            `the columns the expression is computed from; the generated column itself is never writable.`
        );
      }
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const INV = GENERATED_COLUMNS[0];

  // The exact outage, verbatim.
  const bad = "UPDATE accounting.invoices SET status='void', amount_open_cents = 0 WHERE id=$1";
  if (writesTo(bad, INV).length !== 1) failures.push("the ACCT-F197 write verbatim was NOT caught");

  // The reverted, correct form must pass.
  if (writesTo("UPDATE accounting.invoices SET status='void', voided_at=now() WHERE id=$1", INV).length !== 0) {
    failures.push("the corrected void statement was flagged");
  }

  // Reading a generated column is legal and must never be flagged — including in a WHERE clause.
  if (writesTo("SELECT amount_open_cents FROM accounting.invoices WHERE amount_open_cents > 0", INV).length !== 0) {
    failures.push("a SELECT/WHERE read was treated as a write");
  }
  if (writesTo("UPDATE accounting.invoices SET status='x' WHERE amount_open_cents = 0", INV).length !== 0) {
    failures.push("a WHERE comparison in an UPDATE was treated as a write");
  }

  // A comment naming the write must not trip it — every fix here ships with prose naming that token.
  if (writesTo("-- do not SET amount_open_cents = 0\nSELECT 1", INV).length !== 0) {
    failures.push("a COMMENT naming the write tripped the guard — false red");
  }

  // INSERT form, and a same-named column on a DIFFERENT generated table.
  if (writesTo("INSERT INTO accounting.invoices (id, amount_open_cents) VALUES ($1,$2)", INV).length !== 1) {
    failures.push("the INSERT form was NOT caught");
  }
  const pay = GENERATED_COLUMNS[1];
  if (writesTo("UPDATE accounting.payments SET amount_unapplied_cents = 5 WHERE id=$1", pay).length !== 1) {
    failures.push("the payments generated column was NOT caught");
  }
  // The same column name on a table that does NOT generate it must be ignored.
  if (writesTo("UPDATE accounting.bills SET amount_open_cents = 0 WHERE id=$1", INV).length !== 0) {
    failures.push("an unrelated table was flagged");
  }

  // End-to-end through collectProblems, including the end-of-string case that has no terminator.
  if (collectProblems([{ file: "x.ts", src: bad }]).length !== 1) {
    failures.push("collectProblems did not surface the write");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 9/9 (outage caught, fix passes, SELECT+WHERE reads allowed, comment cannot ` +
      `fake a red, INSERT caught, second table caught, unrelated table ignored, end-to-end)`
  );
  process.exit(0);
}

const sources = fs.existsSync(SRC)
  ? walk(SRC).map((p) => ({ file: path.relative(root, p), src: fs.readFileSync(p, "utf8") }))
  : [];
const problems = collectProblems(sources);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} write(s) to a prod-GENERATED column:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — no application write to any of the ${GENERATED_COLUMNS.length} prod-verified GENERATED ` +
    `columns (${sources.length} files scanned).`
);
