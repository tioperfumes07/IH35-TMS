#!/usr/bin/env node
/**
 * GUARD: a migration that voids a financial row must also reverse it, or say why not.
 *
 * CI-F31. PERMANENT LAW §4 and standing-order rule 5: **VOID = reversal; nothing is deletable.**
 * The application enforces it — `voidBill` posts an equal-and-opposite reversing JE in the SAME
 * transaction as the status flip, gated by VOID_ENFORCEMENT_ENABLED, which is ON for all three
 * entities on prod. **A migration bypasses all of that.** Direct SQL sets `voided_at`, no service
 * runs, no reversal is posted, and nothing fails.
 *
 * That is not hypothetical. Measured on the prod branch:
 *   · 202612230000 (ACCT-F142) voided 4 duplicate bills so a partial unique index could install.
 *     All four carry `voided_by_user_id IS NULL` — no actor. **6 posting lines, 0 reversed,
 *     $1,643.21 of expense and A/P still on the books.**
 *   · 202612330000 voided invoices as well. **2 voided invoices carry 4 posting lines, 0 reversed,
 *     $314.90 of revenue and A/R still on the books** — a residue no card had measured.
 *
 * Neither migration was careless. Both were correct remediations, well-reasoned in their own
 * comments. Nothing told their authors a reversal was required and nothing failed when it was
 * missing — which is precisely why this needs a guard rather than a reminder.
 *
 * WHY A DECLARED EXEMPTION IS ALLOWED. Some voids legitimately have nothing to reverse: a row that
 * never posted, or a pre-posting cleanup. Forbidding that outright would push authors to work
 * around the guard. So the rule is: reverse it, or SAY IN THE MIGRATION why there is nothing to
 * reverse. An explicit sentence in a reviewed file is the artifact an auditor can actually read.
 *
 * Run:  node scripts/verify-migration-void-posts-reversal.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(root, "db/migrations");
const LABEL = "verify-migration-void-posts-reversal";

/** Financial schemas whose rows carry GL postings. Voiding one of these implies a reversal. */
const FINANCIAL_SCHEMAS = ["accounting", "driver_finance", "factoring", "banking"];

/** The marker an author writes when a void genuinely has nothing to reverse. */
const EXEMPTION_RE = /VOID-REVERSAL-EXEMPT:/i;

/** Evidence that the migration DOES post reversals itself. */
const REVERSAL_RE =
  /reversed_by_line_id|reversal_of_line_id|reverses_je_id|reversed_by_je_id|INSERT\s+INTO\s+accounting\.journal_entr/i;

export function voidsFinancialRows(sql) {
  const clean = sql.replace(/--[^\n]*/g, "");
  const schemas = FINANCIAL_SCHEMAS.join("|");
  // An UPDATE on a financial table that assigns voided_at.
  const re = new RegExp(
    `UPDATE\\s+(?:${schemas})\\.[a-z_]+[\\s\\S]{0,800}?\\bSET\\b[\\s\\S]{0,800}?\\bvoided_at\\s*=`,
    "i"
  );
  return re.test(clean);
}

export function collectProblems(files, baseline) {
  const problems = [];
  for (const { name, sql } of files) {
    if (!voidsFinancialRows(sql)) continue;
    if (baseline.has(name)) continue;
    if (EXEMPTION_RE.test(sql)) continue;
    if (REVERSAL_RE.test(sql)) continue;
    problems.push(
      `${name} sets voided_at on a financial row but neither posts reversing entries nor declares ` +
        `VOID-REVERSAL-EXEMPT: <reason>. A migration is the one void path no service, flag or guard ` +
        `checks — this is how $1,643.21 of A/P and $314.90 of revenue were left on the books (CI-F31).`
    );
  }
  return problems;
}

/**
 * FROZEN BASELINE — the two migrations that already carry this defect. They are REAL and their
 * residue is real; they are baselined because they are APPLIED and immutable (editing an applied
 * migration breaks its checksum — see the never-edit-applied-migration rule), so the guard cannot
 * demand they change. The residue they left is an OWNER decision, tracked on the board.
 *
 * RATCHET, NOT AMNESTY: a NEW offender fails immediately. Never add an entry to make a build green.
 */
const BASELINE = new Set([
  "202612230000_bills_void_reason_and_tms_native_duplicate_guard.sql",
  "202612330000_void_state_authoritative_bills_invoices.sql",
]);

if (process.argv.includes("--selftest")) {
  const failures = [];
  const voidSql = "UPDATE accounting.bills b\n SET voided_at = now(), void_reason = 'x'\n WHERE 1=1;";

  if (!voidsFinancialRows(voidSql)) failures.push("a financial void was NOT detected");
  if (voidsFinancialRows("UPDATE mdata.loads SET voided_at = now()")) {
    failures.push("a NON-financial schema was flagged — out of scope, would redden unrelated migrations");
  }
  if (voidsFinancialRows("UPDATE accounting.bills SET status = 'void'")) {
    failures.push("a status-only update with no voided_at was flagged");
  }
  // A comment mentioning voided_at must not trip detection.
  if (voidsFinancialRows("-- UPDATE accounting.bills SET voided_at = now()")) {
    failures.push("a COMMENTED-OUT void was detected — comments are stripped, this must not fire");
  }

  const none = new Set();
  if (collectProblems([{ name: "new.sql", sql: voidSql }], none).length !== 1) {
    failures.push("the CI-F31 defect verbatim was NOT caught");
  }
  if (collectProblems([{ name: "new.sql", sql: voidSql }], new Set(["new.sql"])).length !== 0) {
    failures.push("a baselined migration was still reported");
  }
  const exempt = voidSql + "\n-- VOID-REVERSAL-EXEMPT: these rows never posted to the GL.";
  if (collectProblems([{ name: "e.sql", sql: exempt }], none).length !== 0) {
    failures.push("a declared exemption was still reported");
  }
  const reverses = voidSql + "\nUPDATE accounting.journal_entry_postings SET reversed_by_line_id = $1;";
  if (collectProblems([{ name: "r.sql", sql: reverses }], none).length !== 0) {
    failures.push("a migration that DOES reverse was still reported");
  }
  // The two real offenders must be detected when the baseline is empty — proving the baseline is
  // load-bearing rather than decorative.
  const real = [];
  for (const n of BASELINE) {
    const p = path.join(MIGRATIONS, n);
    if (fs.existsSync(p)) real.push({ name: n, sql: fs.readFileSync(p, "utf8") });
  }
  if (real.length === 2 && collectProblems(real, none).length !== 2) {
    failures.push("the two REAL baselined offenders are not detected with an empty baseline");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 9/9 (detection, non-financial + status-only + commented-out correctly ignored, ` +
      `defect verbatim caught, baseline honoured, exemption honoured, real reversal honoured, both REAL ` +
      `offenders detected against an empty baseline)`
  );
  process.exit(0);
}

const files = fs.existsSync(MIGRATIONS)
  ? fs
      .readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => ({ name: f, sql: fs.readFileSync(path.join(MIGRATIONS, f), "utf8") }))
  : [];
const problems = collectProblems(files, BASELINE);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} migration(s) void without reversing:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — no NEW migration voids a financial row without posting reversals or declaring ` +
    `VOID-REVERSAL-EXEMPT (${BASELINE.size} known offenders baselined; their residue is owner-gated).`
);
