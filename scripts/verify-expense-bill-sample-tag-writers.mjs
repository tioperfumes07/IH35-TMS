#!/usr/bin/env node
/**
 * GUARD: the expense and bill writers must be able to record that a document is TEST data.
 * FAIL-F2 / ACCT-F262.
 *
 * `accounting.expenses.is_sample_data` and `accounting.bills.is_sample_data` both exist and both
 * default false. NEITHER writer ever wrote them — measured: 0 references to `is_sample_data` in
 * expenses.routes.ts, bills.service.ts and bills.routes.ts. So every expense and bill the application
 * created was permanently indistinguishable from real money.
 *
 * IT DOES NOT STOP AT THE DOCUMENT. posting-engine resolves the sample flag from the SOURCE ROW
 * (ACCT-F212, SAMPLE_TAGGED_SOURCE_TABLES). An untagged expense or bill therefore produces an
 * UNTAGGED journal entry, and sample spend lands in the real ledger with nothing marking it.
 *
 * THE OPERATORS ALREADY TOLD US, IN THE ONLY FIELD THAT WOULD TAKE IT. Live on prod 2026-08-08:
 *   · bill `SAMPLE-CASCADE-1633` — the word SAMPLE is in its BILL NUMBER — is_sample_data=false,
 *     and its posting JE `bc094647` is false too
 *   · expense memo `USMCA_GATEB_SAMPLE_2026-08-08 … TEST data`     — is_sample_data=false
 *   · expense memo `SAMPLE expense for banking match test`         — is_sample_data=false
 * When people type SAMPLE into free text, the structured flag is MISSING, not declined. A guard that
 * only counted rows would have called this "0 sample expenses" and moved on.
 *
 * WHY THIS ASSERTS THE WRITE AND NOT A MENTION: an earlier guard of mine (ACCT-F220) passed because
 * the zod schema merely NAMED the field while the INSERT never carried it — accepted-then-dropped
 * reads exactly like fixed. So each half here requires evidence of an actual write:
 *   · expenses — `columns.push('is_sample_data')`, the file's own lockstep INSERT idiom
 *   · bills    — an UPDATE that sets it, which is how bills.service.ts already stamps display_id
 *                (ACCT-F186) precisely because FOUR positional INSERT variants make a new column a
 *                four-places-to-drift landmine
 *
 * Run:  node scripts/verify-expense-bill-sample-tag-writers.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPENSES = "apps/backend/src/accounting/expenses.routes.ts";
const BILLS = "apps/backend/src/accounting/bills.service.ts";
const PAYMENTS = "apps/backend/src/accounting/customer-payments.routes.ts";
const LABEL = "verify-expense-bill-sample-tag-writers";

/**
 * Strips JS *and* SQL comments.
 *
 * The SQL half is not decoration. My first version stripped only `//` and block comments, and the
 * customer-payment fix carries an explanatory `-- …` comment INSIDE the INSERT column list that happens
 * to contain the words `is_sample_data`. That comment satisfied the column check on its own: deleting
 * the real column left the guard GREEN. Mutation-testing caught it, which is the entire reason the
 * mutation step exists — a guard that reads its own explanation as evidence is worse than no guard.
 */
export function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

/** The expense route must ACCEPT the flag and PUSH it onto the dynamic column list. */
export function expenseWritesTag(src) {
  const clean = stripComments(src);
  return {
    accepts: /is_sample_data\s*:\s*z\.boolean\(\)/.test(clean),
    writes: /columns\.push\s*\(\s*[`'"]is_sample_data[`'"]\s*\)/.test(clean),
  };
}

/** The bill service must ACCEPT the flag and SET it on accounting.bills. */
export function billWritesTag(src) {
  const clean = stripComments(src);
  // Either shape is acceptable: an in-transaction UPDATE (what bills.service.ts does, mirroring how
  // ACCT-F186 stamps display_id) or the column named directly in an INSERT, should the four positional
  // variants ever be consolidated into one.
  const setsIt =
    /UPDATE\s+accounting\.bills[\s\S]{0,200}?SET\s+is_sample_data\s*=/i.test(clean) ||
    /INSERT\s+INTO\s+accounting\.bills\s*\([\s\S]{0,900}?\bis_sample_data\b/i.test(clean);
  return {
    accepts: /isSampleData\?\s*:\s*boolean/.test(clean),
    writes: setsIt,
  };
}

/** The customer-payment route must ACCEPT the flag and name it in the accounting.payments INSERT. */
export function paymentWritesTag(src) {
  const clean = stripComments(src);
  const insert = /INSERT\s+INTO\s+accounting\.payments\s*\(([\s\S]{0,900}?)\)/i.exec(clean);
  return {
    accepts: /is_sample_data\s*:\s*z\.boolean\(\)/.test(clean),
    writes: insert ? /\bis_sample_data\b/.test(insert[1]) : false,
  };
}

export function collectProblems(expenseSrc, billSrc, paymentSrc = "") {
  const problems = [];
  const e = expenseWritesTag(expenseSrc);
  if (!e.accepts) {
    problems.push(
      `${EXPENSES}: the create body schema has no is_sample_data, so the flag cannot be SUPPLIED and ` +
        `the writer has nothing to write. Every app-created expense stays indistinguishable from real ` +
        `money, and posting-engine propagates that into an untagged journal entry (FAIL-F2).`
    );
  }
  if (!e.writes) {
    problems.push(
      `${EXPENSES}: is_sample_data is never pushed onto the INSERT column list. Naming the field in the ` +
        `schema without writing it is accepted-then-dropped — it reads as fixed and is not (FAIL-F2).`
    );
  }
  const b = billWritesTag(billSrc);
  if (!b.accepts) {
    problems.push(
      `${BILLS}: the create input has no isSampleData, so a bill cannot be marked TEST data. Live proof ` +
        `this matters: bill SAMPLE-CASCADE-1633 carries SAMPLE in its bill NUMBER and is_sample_data ` +
        `false (FAIL-F2).`
    );
  }
  if (!b.writes) {
    problems.push(
      `${BILLS}: nothing sets accounting.bills.is_sample_data. Set it in-transaction after the insert, ` +
        `the way display_id is stamped (ACCT-F186) — four positional INSERT variants make a new column ` +
        `four places to drift (FAIL-F2).`
    );
  }
  // ACCT-F264 — same class, third writer. accounting.payments.is_sample_data exists on 12,129 rows and
  // nothing wrote it. posting-engine resolves customer_payment from the SOURCE row, so an untagged
  // payment produces an untagged journal entry.
  if (paymentSrc) {
    const pm = paymentWritesTag(paymentSrc);
    if (!pm.accepts) {
      problems.push(
        `${PAYMENTS}: the create body schema has no is_sample_data, so a customer payment cannot be ` +
          `marked TEST data and the INSERT has nothing to write (ACCT-F264).`
      );
    }
    if (!pm.writes) {
      problems.push(
        `${PAYMENTS}: the accounting.payments INSERT does not name is_sample_data, so the field is ` +
          `accepted and dropped — which reads as fixed and is not (ACCT-F264).`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const GOOD_E = "is_sample_data: z.boolean().optional(),\ncolumns.push(`is_sample_data`);";
  const GOOD_B = "isSampleData?: boolean;\nawait c.query(`UPDATE accounting.bills SET is_sample_data = true WHERE id=$1`);";

  if (collectProblems(GOOD_E, GOOD_B).length !== 0) failures.push("the corrected pair was flagged");

  if (!collectProblems("columns.push(`is_sample_data`);", GOOD_B).some((p) => /cannot be SUPPLIED/.test(p))) {
    failures.push("an expense schema missing the field was NOT caught");
  }
  // THE ACCT-F220 TRAP: schema names it, INSERT never carries it.
  if (
    !collectProblems("is_sample_data: z.boolean().optional(),", GOOD_B).some((p) =>
      /accepted-then-dropped/.test(p)
    )
  ) {
    failures.push("accepted-then-dropped was NOT caught — the exact ACCT-F220 false green");
  }
  if (!collectProblems(GOOD_E, "isSampleData?: boolean;").some((p) => /nothing sets accounting\.bills/.test(p))) {
    failures.push("a bill service that never writes the flag was NOT caught");
  }
  if (!collectProblems(GOOD_E, "await c.query(`UPDATE accounting.bills SET is_sample_data = true`);").some((p) => /no isSampleData/.test(p))) {
    failures.push("a bill input missing the field was NOT caught");
  }
  // Comments must not satisfy either half.
  const commentOnly = "// is_sample_data: z.boolean() and columns.push('is_sample_data')";
  if (collectProblems(commentOnly, GOOD_B).length !== 2) {
    failures.push("COMMENTS satisfied the expense checks — false green");
  }

  const GOOD_P = "is_sample_data: z.boolean().optional(),\nINSERT INTO accounting.payments (a, is_sample_data) VALUES ($1,$2)";
  if (collectProblems(GOOD_E, GOOD_B, GOOD_P).length !== 0) failures.push("the corrected payment writer was flagged");
  if (!collectProblems(GOOD_E, GOOD_B, "INSERT INTO accounting.payments (a, is_sample_data) VALUES ($1,$2)").some((p) => /cannot be marked TEST data/.test(p))) {
    failures.push("a payment schema missing the field was NOT caught");
  }
  if (!collectProblems(GOOD_E, GOOD_B, "is_sample_data: z.boolean().optional(),\nINSERT INTO accounting.payments (a, b) VALUES ($1,$2)").some((p) => /accepted and dropped/.test(p))) {
    failures.push("payment accepted-then-dropped was NOT caught");
  }

  // PINNED: an SQL comment inside the column list must NOT satisfy the payment check. This is the
  // exact false green my own fix produced — the explanatory `-- …is_sample_data…` comment sat inside
  // the INSERT parens and kept the guard green after the real column was deleted.
  const SQL_COMMENT_FAKE =
    "is_sample_data: z.boolean().optional(),\nINSERT INTO accounting.payments (a, -- is_sample_data lives here\n b) VALUES ($1,$2)";
  if (!collectProblems(GOOD_E, GOOD_B, SQL_COMMENT_FAKE).some((p) => /accepted and dropped/.test(p))) {
    failures.push("an SQL comment inside the column list faked a pass — the exact false green found by mutation");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 10/10 (corrected pair passes, missing expense schema caught, ` +
      `accepted-then-dropped caught, bill non-writer caught, missing bill input caught, comments cannot fake, payment writer covered, SQL comment cannot fake)`
  );
  process.exit(0);
}

for (const f of [EXPENSES, BILLS, PAYMENTS]) {
  if (!fs.existsSync(path.join(root, f))) {
    console.error(`${LABEL} FAIL — ${f} is missing; the sample-tag writers cannot be verified.`);
    process.exit(1);
  }
}
const problems = collectProblems(
  fs.readFileSync(path.join(root, EXPENSES), "utf8"),
  fs.readFileSync(path.join(root, BILLS), "utf8"),
  fs.existsSync(path.join(root, PAYMENTS)) ? fs.readFileSync(path.join(root, PAYMENTS), "utf8") : ""
);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} money writer(s) cannot mark a document as sample:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — expense, bill and customer-payment writers all accept and persist is_sample_data.`);
