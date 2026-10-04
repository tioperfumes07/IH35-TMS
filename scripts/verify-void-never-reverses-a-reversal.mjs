#!/usr/bin/env node
// ACCT-F397 — the void engine must never reverse a reversal, and must never reverse twice.
//
// WHY THIS GUARD EXISTS. void.service.ts's readOriginalGlPostings has two branches. The
// source-linked branch (invoice/bill/fuel/...) was fixed on 2026-09-23 with the canonical
// 4-column liveness predicate, after a confirmed live misstatement. The `journal_entry`
// branch -- voiding a JE directly -- got NONE of it and selected every posting on the
// header unconditionally. So voiding a JE that was itself a reversal reversed it AGAIN:
// credit -> debit -> CREDIT AGAIN.
//
// MEASURED LIVE ON USMCA (bypass_rls, read-only) the day this guard was written:
//    61 journal_entries reverse an entry that is itself a reversal
//   122 posting lines reverse a line that was itself a reversal, $5,955.26
// The trial balance never saw it -- debits = credits = $2,181,835.64 -- because a double
// reversal is balanced. It had to be found on the FK chain. A balanced ledger is not a
// correct ledger, and that is exactly what this guard is for.
//
// WHAT IT ASSERTS, statically, over void.service.ts:
//   1. the journal_entry branch checks all four liveness conditions: status='posted',
//      voided_at, reversed_by_je_id, reverses_je_id;
//   2. each one THROWS -- never filters, never returns zero rows. postVoidReversal treats
//      zero rows as "nothing to reverse" and returns SUCCESS, so a filter here would report
//      a completed void that moved no money. That is the fake green this forbids;
//   3. the reversal-of-a-reversal escape hatch is gated on an explicit caller flag;
//   4. no caller anywhere passes that flag except a declared allowlist (empty today).
//
// Rule 17: wired ONLY via scripts/verify-steps/14445-verify-void-never-reverses-a-reversal.mjs
//
// Usage: node scripts/verify-void-never-reverses-a-reversal.mjs [--selftest]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-void-never-reverses-a-reversal";
const VOID_SERVICE = "apps/backend/src/accounting/void.service.ts";
const BACKEND_SRC = "apps/backend/src";

/** Callers permitted to reverse a reversal on purpose. Adding one is a money decision. */
const ALLOWED_FLAG_CALLERS = new Set();

export function stripComments(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The journal_entry branch of readOriginalGlPostings, comments stripped. */
function journalEntryBranch(src) {
  const code = stripComments(src);
  const start = code.indexOf('if (entityType === "journal_entry")');
  if (start < 0) return null;
  // to the start of the source-linked SELECT that follows the branch
  const end = code.indexOf("source_transaction_type = $3", start);
  return code.slice(start, end < 0 ? code.length : end);
}

export function findVoidReversalViolations(files) {
  const problems = [];
  const vs = files.find((f) => f.file === VOID_SERVICE);
  if (!vs || vs.src == null) {
    problems.push(`${VOID_SERVICE}: missing — the void engine is the thing this guard exists to check`);
  } else {
    const branch = journalEntryBranch(vs.src);
    if (!branch) {
      problems.push(`${VOID_SERVICE}: the journal_entry branch of readOriginalGlPostings was not found`);
    } else {
      const required = [
        ["status", /status\s*!==\s*["'`]posted["'`]/, "je.status = 'posted'"],
        ["voided_at", /\bvoided\b/, "voided_at IS NULL"],
        ["reversed_by_je_id", /already_reversed/, "reversed_by_je_id IS NULL"],
        ["reverses_je_id", /is_itself_a_reversal/, "reverses_je_id IS NULL"],
      ];
      for (const [name, re, sql] of required) {
        if (!re.test(branch)) {
          problems.push(
            `${VOID_SERVICE}: the journal_entry branch does not check ${name} (${sql}) — ` +
              `the source-linked branch has checked it since 2026-09-23 after a confirmed live misstatement`
          );
        }
      }
      // Each condition must THROW. Count the throws in the branch; four conditions, four throws
      // (plus not_found). A filter instead of a throw is the fake green.
      const throws = (branch.match(/throw new Error\(/g) ?? []).length;
      if (throws < 4) {
        problems.push(
          `${VOID_SERVICE}: the journal_entry branch has ${throws} throw(s), expected at least 4 — ` +
            `a liveness check that FILTERS returns zero rows, and postVoidReversal reports zero rows as a ` +
            `successful void that moved no money`
        );
      }
      if (!/is_itself_a_reversal\s*&&\s*!allowReversalOfReversal/.test(branch)) {
        problems.push(
          `${VOID_SERVICE}: reversal-of-a-reversal is not gated on the explicit allowReversalOfReversal flag`
        );
      }
    }
  }

  for (const { file, src } of files) {
    if (file === VOID_SERVICE || src == null) continue;
    if (/\ballowReversalOfReversal\b\s*:\s*true/.test(stripComments(src)) && !ALLOWED_FLAG_CALLERS.has(file)) {
      problems.push(
        `${file}: passes allowReversalOfReversal: true but is not in the declared allowlist — ` +
          `reversing a reversal is a money decision, not a convenience`
      );
    }
  }
  return problems;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && full.endsWith(".ts") && !/__tests__|\.test\.ts$/.test(full)) out.push(full);
  }
  return out;
}

function loadReal() {
  const abs = path.join(ROOT, BACKEND_SRC);
  const files = fs.existsSync(abs) ? walk(abs) : [];
  const out = files.map((f) => ({ file: path.relative(ROOT, f), src: fs.readFileSync(f, "utf8") }));
  if (!out.some((f) => f.file === VOID_SERVICE)) out.push({ file: VOID_SERVICE, src: null });
  return out;
}

function selftest() {
  const GOOD = `
    if (entityType === "journal_entry") {
      const je = live.rows[0];
      if (!je) throw new Error("not_found");
      if (je.status !== "posted") throw new Error("not_posted");
      if (je.voided) throw new Error("already_voided");
      if (je.already_reversed) throw new Error("already_reversed");
      if (je.is_itself_a_reversal && !allowReversalOfReversal) { throw new Error("is_itself_a_reversal"); }
      return rows;
    }
    source_transaction_type = $3
  `;
  const cases = [
    { label: "(i)   the fixed engine passes", files: [{ file: VOID_SERVICE, src: GOOD }], expectFail: false },
    {
      label: "(ii)  the REAL defect: journal_entry branch with no liveness check at all",
      files: [{ file: VOID_SERVICE, src: `if (entityType === "journal_entry") { return rows; }\nsource_transaction_type = $3` }],
      expectFail: true,
    },
    {
      label: "(iii) FILTERS instead of throwing — the fake green (zero rows reported as a void)",
      files: [{ file: VOID_SERVICE, src: `if (entityType === "journal_entry") {\n const r = q("AND je.status='posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL");\n return r.rows; }\nsource_transaction_type = $3` }],
      expectFail: true,
    },
    {
      label: "(iv)  reverses_je_id checked but NOT gated on the explicit flag",
      files: [{ file: VOID_SERVICE, src: GOOD.replace("&& !allowReversalOfReversal", "") }],
      expectFail: true,
    },
    {
      label: "(v)   an undeclared caller passing allowReversalOfReversal: true",
      files: [{ file: VOID_SERVICE, src: GOOD }, { file: "apps/backend/src/x.ts", src: "postVoidReversal(c,{allowReversalOfReversal: true},a)" }],
      expectFail: true,
    },
    {
      label: "(vi)  a COMMENT mentioning the flag does not count as passing it",
      files: [{ file: VOID_SERVICE, src: GOOD }, { file: "apps/backend/src/y.ts", src: "// allowReversalOfReversal: true is only for reinstate\nconst a=1;" }],
      expectFail: false,
    },
    { label: "(vii) void.service.ts missing entirely is a violation", files: [{ file: VOID_SERVICE, src: null }], expectFail: true },
  ];
  let pass = 0;
  for (const c of cases) {
    const p = findVoidReversalViolations(c.files);
    const failed = p.length > 0;
    if (failed === c.expectFail) { pass++; console.log(`ok    ${c.label}`); }
    else console.error(`FAIL  ${c.label} — expected ${c.expectFail ? "FAIL" : "PASS"}, got ${failed ? "FAIL" : "PASS"}` + (p.length ? `\n      ${p.join("\n      ")}` : ""));
  }
  console.log(`\n${LABEL} SELFTEST ${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
  process.exit(pass === cases.length ? 0 : 1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = findVoidReversalViolations(loadReal());
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} violation(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      `\nMeasured live on USMCA: 61 journal_entries reverse an entry that is itself a reversal; ` +
        `122 posting lines reverse a line that was itself a reversal, $5,955.26. The trial balance ` +
        `did not see it because a double reversal is balanced.`
    );
    process.exit(1);
  }
  console.log(`${LABEL} OK — the void engine's journal_entry branch fails closed on all four liveness conditions; reversal-of-a-reversal is gated and no caller claims it.`);
}

main();
