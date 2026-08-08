#!/usr/bin/env node
/**
 * GUARD: writing `status='void'` without its timestamp is a ROLLBACK, not a cosmetic slip. FAIL-V1.
 *
 * `accounting.invoices` and `accounting.bills` each carry a CHECK that makes the void state
 * authoritative — verified on prod `br-fancy-credit-akjnd07a` 2026-08-08:
 *
 *   invoices_void_state_authoritative   CHECK ((status = 'void') = (voided_at IS NOT NULL))
 *   bills_void_state_authoritative      CHECK ((status = 'void') = (voided_at IS NOT NULL
 *                                                                  OR revoked_at IS NOT NULL))
 *
 * Both are an IFF, in both directions. So `SET status='void'` on its own does not "leave voided_at
 * NULL" — it RAISES 23514 and rolls back the enclosing transaction.
 *
 * WHY THIS GUARD EXISTS RATHER THAN A CODE REVIEW NOTE: the failing site was
 * dispatch/cancellation.service.ts, and because its UPDATE ran inside the cancellation transaction,
 * the visible symptom was not a bad invoice row. It was **a dispatched load could not be cancelled at
 * all**, surfacing a raw Postgres constraint name to the dispatcher. The money bug was disguised as a
 * dispatch bug. Reproduced live on L-20260808-0093 / INV-2026-00024.
 *
 * The correct shape already existed elsewhere — invoices.routes.ts writes both halves, and
 * INV-2026-00020 on prod is void WITH voided_at. One branch simply did not use it. That is precisely
 * the class a static guard catches and a spot review does not: not a wrong idea, a missed site.
 *
 * SCOPED TO THE TWO TABLES THAT ACTUALLY CARRY THE CONSTRAINT. Other tables legitimately void with a
 * different column — governance/void-cancel-executors.ts writes `status='void', revoked_at=now()`,
 * and cash-flow's voider never writes voided_at at all. Flagging those would be a false positive that
 * teaches people to ignore this guard.
 *
 * Run:  node scripts/verify-void-writes-voided-at.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "apps/backend/src");
const LABEL = "verify-void-writes-voided-at";

/** invoices: only voided_at satisfies the CHECK. bills: voided_at OR revoked_at. */
const GUARDED = [
  { table: "accounting.invoices", satisfiers: ["voided_at"] },
  { table: "accounting.bills", satisfiers: ["voided_at", "revoked_at"] },
];

export function stripComments(src) {
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Collect each `UPDATE <table> ... SET ...` statement body. The body ends at the statement's
 * terminator — a backtick (end of the SQL template literal), a `;`, or a clause that cannot be part
 * of a SET list (WHERE / RETURNING). Bounding it matters: without a terminator a later, unrelated
 * `voided_at` in the same file would satisfy the check and the guard would pass on a broken write.
 */
export function updateBodies(src, table) {
  const re = new RegExp(`UPDATE\\s+${table.replace(".", "\\.")}\\b([\\s\\S]{0,1200}?)(?:\\bWHERE\\b|\\bRETURNING\\b|;|\`)`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

export function collectProblems(files) {
  const problems = [];
  for (const { file, src } of files) {
    const clean = stripComments(src);
    for (const { table, satisfiers } of GUARDED) {
      for (const body of updateBodies(clean, table)) {
        // Must be an ASSIGNMENT of the bare literal — `status = 'void'` followed by the next SET item
        // or the end of the statement. A `CASE WHEN status = 'void' THEN 'void' ELSE 'factored' END`
        // PRESERVES a row that is already void and can never transition one into void, so its
        // voided_at is already set; flagging it (the factoring poster does exactly this, twice) would
        // be a false positive, and a guard that cries wolf gets switched off.
        if (!/\bstatus\s*=\s*'void'\s*(?:,|$)/i.test(body.trim())) continue;
        if (satisfiers.some((c) => new RegExp(`\\b${c}\\s*=`, "i").test(body))) continue;
        problems.push(
          `${file}: an UPDATE on ${table} sets status='void' but writes none of ` +
            `[${satisfiers.join(", ")}] in the same statement. The CHECK on that table makes the void ` +
            `state authoritative in BOTH directions, so this does not leave a half-voided row — it ` +
            `raises 23514 and ROLLS BACK the whole enclosing transaction (FAIL-V1).`
        );
      }
    }
  }
  return problems;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, acc);
    } else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) {
      acc.push({ file: path.relative(root, p), src: fs.readFileSync(p, "utf8") });
    }
  }
  return acc;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const mk = (src) => [{ file: "x.ts", src }];

  // The corrected shape must pass.
  if (
    collectProblems(
      mk("UPDATE accounting.invoices SET status = 'void', voided_at = now() WHERE id = $1")
    ).length !== 0
  ) {
    failures.push("the corrected invoice void was flagged");
  }

  // The FAIL-V1 shape must fail.
  if (
    collectProblems(mk("UPDATE accounting.invoices SET status = 'void', updated_at = now() WHERE id = $1"))
      .length !== 1
  ) {
    failures.push("the FAIL-V1 shape (status only) was NOT caught");
  }

  // bills may satisfy the CHECK with revoked_at.
  if (
    collectProblems(mk("UPDATE accounting.bills SET status = 'void', revoked_at = now() WHERE id = $1"))
      .length !== 0
  ) {
    failures.push("a bill voided via revoked_at was wrongly flagged");
  }

  // invoices may NOT — only voided_at satisfies its CHECK.
  if (
    collectProblems(mk("UPDATE accounting.invoices SET status = 'void', revoked_at = now() WHERE id=$1"))
      .length !== 1
  ) {
    failures.push("an invoice voided via revoked_at was NOT caught");
  }

  // A voided_at BEYOND the statement terminator must not rescue it — the bug this bounding prevents.
  if (
    collectProblems(
      mk(
        "UPDATE accounting.invoices SET status='void' WHERE id=$1`;\nawait q(`UPDATE other SET voided_at = now()"
      )
    ).length !== 1
  ) {
    failures.push("a voided_at outside the statement wrongly satisfied the check");
  }

  // An untouched table must be ignored.
  if (collectProblems(mk("UPDATE mdata.loads SET status = 'void' WHERE id = $1")).length !== 0) {
    failures.push("a table without the CHECK was flagged");
  }

  // A CASE that PRESERVES an existing void must NOT be flagged — the factoring poster's real shape.
  // Pinned here because the guard's first draft flagged it twice, and a false positive on a correct
  // site is how a guard gets ignored.
  if (
    collectProblems(
      mk(
        "UPDATE accounting.invoices SET status = CASE WHEN status = 'void' THEN 'void' ELSE 'factored' END, x=1 WHERE id=$1"
      )
    ).length !== 0
  ) {
    failures.push("a CASE that only preserves an existing void was wrongly flagged");
  }

  // A comment must not fake a pass.
  if (
    collectProblems(mk("UPDATE accounting.invoices SET status='void', /* voided_at = now() */ x=1 WHERE i=1"))
      .length !== 1
  ) {
    failures.push("a COMMENT satisfied the check — false green");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 8/8 (correct shape passes, status-only caught, bills revoked_at allowed, ` +
      `invoice revoked_at caught, out-of-statement voided_at caught, unguarded table ignored, CASE-preserve allowed, comment cannot fake)`
  );
  process.exit(0);
}

if (!fs.existsSync(SRC)) {
  console.error(`${LABEL} FAIL — ${SRC} is missing.`);
  process.exit(1);
}
const problems = collectProblems(walk(SRC));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} void write(s) that roll back their transaction:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — every UPDATE that sets status='void' on accounting.invoices/bills writes the ` +
    `timestamp its CHECK requires in the same statement.`
);
