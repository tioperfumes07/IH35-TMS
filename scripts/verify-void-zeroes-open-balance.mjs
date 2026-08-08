#!/usr/bin/env node
/**
 * verify-void-zeroes-open-balance — ACCT-F200. THIS GUARD NOW ASSERTS THE OPPOSITE OF ITS NAME,
 * AND THE NAME IS KEPT DELIBERATELY. Read this header before "fixing" anything here.
 *
 * WHAT THIS FILE USED TO DEMAND, AND WHY THAT WAS A PRODUCTION OUTAGE.
 * It required the invoice void route to run `SET amount_open_cents = 0`, on the theory that a voided
 * invoice left a phantom receivable behind. Both halves of that theory were wrong:
 *
 *   1. THE WRITE IS IMPOSSIBLE. accounting.invoices.amount_open_cents is a STORED GENERATED column on
 *      prod — pg_attribute.attgenerated = 's', expression (total_cents - amount_paid_cents). Postgres
 *      rejects any write to it, so the route 500'd on EVERY invoice void until the write was reverted
 *      in 6c73e28. A guard that demands an impossible write is not a safety net; it is a standing
 *      instruction to re-break production.
 *
 *   2. THERE WAS NO PHANTOM TO FIX. All nine open-A/R read paths already exclude voided invoices via
 *      `voided_at IS NULL` and/or `status NOT IN ('void', ...)`: ar-aging, fin20-aging, cash-forecast,
 *      invoices.routes, month-close, collections, consolidated-statements, customer-financial and
 *      relationship-score. The reported "56.4% of A/R" was 0.48% ($3,988.07 of $836,934.70, verified
 *      on prod) and reachable only by summing the raw column WITHOUT the voided filter — which is to
 *      say by querying the table in a way the application never does.
 *
 * WHY THE RAW VALUE IS CORRECT AND MUST NEVER BE "CLEANED UP". A voided $500 invoice legitimately has
 * total 500, paid 0, open 500. Voiding changes an invoice's VALIDITY, not its face amount or its
 * payments — which is exactly why the read paths filter on voided_at instead of mutating history.
 * Zeroing that column would require destroying total_cents, i.e. destroying the invoice's face value.
 *
 * WHY THE FILE AND STEP NUMBER SURVIVE RATHER THAN BEING DELETED. Deleting it would leave the next
 * agent free to rediscover the same wrong idea and re-add the same write. Keeping the number with the
 * invariant INVERTED means the build now fails the moment anyone tries. The guard is the tombstone.
 *
 * WHAT IT ASSERTS NOW, on apps/backend/src/accounting/invoices.routes.ts:
 *   A. The void route must NOT write amount_open_cents. (The regression, stated as the defect.)
 *   B. The void route must still actually void — status='void' AND voided_at. Without B, a route that
 *      had quietly stopped voidingLoads altogether would sail through A by doing nothing at all.
 *
 * Run:  node scripts/verify-void-zeroes-open-balance.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/accounting/invoices.routes.ts";
const LABEL = "verify-void-zeroes-open-balance";

/** Strip SQL/JS comments so a fix's own explanatory prose can never satisfy or trip a check. */
export function stripComments(src) {
  return src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * A write to amount_open_cents: either `SET ... amount_open_cents =` inside an UPDATE, or the column
 * named in an INSERT column list on accounting.invoices. Matching `amount_open_cents\s*=` alone would
 * false-positive on a WHERE clause comparison, so the SET form is anchored to an UPDATE of the table.
 */
export function writesGeneratedColumn(src) {
  const clean = stripComments(src);
  const hits = [];
  // Capture the statement body up to its terminator (`;` or a template-literal backtick) OR to end of
  // input. An earlier form REQUIRED a terminator, which silently missed a regression that happened to
  // sit at end-of-string — the selftest caught that, so the terminator is optional by construction.
  const updateRe = /UPDATE\s+accounting\.invoices\b((?:[^;`]){0,1600})/gi;
  let m;
  while ((m = updateRe.exec(clean)) !== null) {
    const body = m[1];
    const setIdx = body.search(/\bSET\b/i);
    if (setIdx === -1) continue;
    const setClause = body.slice(setIdx).split(/\bWHERE\b/i)[0];
    if (/\bamount_open_cents\s*=/i.test(setClause)) hits.push("UPDATE ... SET amount_open_cents");
  }
  const insertRe = /INSERT\s+INTO\s+accounting\.invoices\s*\(([\s\S]{0,2000}?)\)/gi;
  while ((m = insertRe.exec(clean)) !== null) {
    if (/\bamount_open_cents\b/i.test(m[1])) hits.push("INSERT naming amount_open_cents");
  }
  return hits;
}

/** The void must still be a void: status='void' and voided_at both set somewhere in the file. */
export function stillVoids(src) {
  const clean = stripComments(src);
  return /status\s*=\s*'void'/i.test(clean) && /\bvoided_at\s*=/i.test(clean);
}

export function collectProblems(src, file = TARGET) {
  const problems = [];
  for (const hit of writesGeneratedColumn(src)) {
    problems.push(
      `${file}: ${hit}. accounting.invoices.amount_open_cents is a STORED GENERATED column on prod ` +
        `(attgenerated='s', expr total_cents - amount_paid_cents). Postgres rejects every write to ` +
        `it, so this 500s on EVERY invoice void — the exact ACCT-F197 outage reverted in 6c73e28. ` +
        `A voided invoice keeping its face amount is CORRECT; all nine open-A/R read paths already ` +
        `exclude voided invoices, so there is nothing here to zero.`
    );
  }
  if (!stillVoids(src)) {
    problems.push(
      `${file}: the void route no longer sets both status='void' and voided_at. Those are what every ` +
        `open-A/R read path filters on, so dropping them re-creates the phantom receivable for real ` +
        `— this time with no column to blame.`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const ok = "UPDATE accounting.invoices SET status = 'void', voided_at = now() WHERE id = $1";

  // The exact ACCT-F197 regression must be caught.
  const bad =
    "UPDATE accounting.invoices SET status = 'void', voided_at = now(), amount_open_cents = 0 WHERE id = $1";
  if (collectProblems(bad).length !== 1) failures.push("the ACCT-F197 write verbatim was NOT caught");
  if (collectProblems(ok).length !== 0) failures.push("the corrected void route was flagged");

  // A comment describing the removed write must not trip the guard — this fix ships with a long
  // header naming that exact token, which is the false-red this file would otherwise hand itself.
  if (collectProblems("-- never SET amount_open_cents = 0 here\n" + ok).length !== 0) {
    failures.push("a COMMENT naming the write tripped the guard — false red");
  }

  // A WHERE-clause comparison is a READ, not a write, and must be allowed.
  const whereRead =
    "UPDATE accounting.invoices SET status = 'void', voided_at = now() WHERE amount_open_cents = 0";
  if (collectProblems(whereRead).length !== 0) failures.push("a WHERE comparison was treated as a write");

  // An INSERT naming the generated column is equally fatal and must be caught.
  const badInsert = ok + "; INSERT INTO accounting.invoices (id, amount_open_cents) VALUES ($1,$2)";
  if (collectProblems(badInsert).length !== 1) failures.push("an INSERT naming the column was NOT caught");

  // Check B must bite: a file that stopped voiding altogether cannot pass by doing nothing.
  if (collectProblems("SELECT 1").length !== 1) failures.push("a route that no longer voids was not caught");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 6/6 (F197 write caught, correct void passes, comment cannot fake a red, ` +
      `WHERE-read allowed, INSERT form caught, non-voiding route caught)`
  );
  process.exit(0);
}

const abs = path.join(root, TARGET);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL — ${TARGET} is missing; the invoice void route cannot be verified.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — the invoice void route sets status='void' + voided_at and does NOT write the ` +
    `STORED GENERATED column amount_open_cents (ACCT-F200; inverted from its original ACCT-F197 form).`
);
