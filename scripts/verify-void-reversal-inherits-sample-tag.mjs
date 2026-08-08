#!/usr/bin/env node
/**
 * GUARD: a void reversal must inherit the sample flag of the entry it reverses. ACCT-F211.
 *
 * THE DEFECT. void.service.ts writes its reversing journal entry with a DIRECT INSERT — it does not go
 * through createJournalEntry — and named only seven columns, none of them is_sample_data. So voiding a
 * SAMPLE entry produced a REAL reversal.
 *
 * WHY THAT IS WORSE THAN A COSMETIC MISLABEL. The two halves then disagree: the original is excluded
 * from a real-money report while its reversal is included, so the reversal appears as a standalone real
 * entry with no matching original — unexplained money in the GL, created by the act of cleaning up test
 * data. A void is supposed to make the books whole; this made them contradict themselves.
 *
 * WHAT IS ASSERTED:
 *   A. the reversal INSERT names is_sample_data — otherwise the flag cannot be carried at all;
 *   B. the value is DERIVED from the original entry (a read of accounting.journal_entries), not
 *      hardcoded and not string-matched. `is_sample_data` bound to a literal false would satisfy A
 *      while reintroducing the exact defect, which is why A alone is not enough.
 *
 * NOT string-matching: deriving "is this sample?" from a memo containing SAMPLE / GATEB / USMCA is the
 * failure the structured column replaced — it breaks the moment someone edits a note.
 *
 * Run:  node scripts/verify-void-reversal-inherits-sample-tag.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/accounting/void.service.ts";
const LABEL = "verify-void-reversal-inherits-sample-tag";

export function stripComments(src) {
  return src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The reversal INSERT into accounting.journal_entries must name the column. */
export function insertNamesFlag(src) {
  const clean = stripComments(src);
  const m = /INSERT\s+INTO\s+accounting\.journal_entries([\s\S]{0,600}?)VALUES/i.exec(clean);
  if (!m) return null;
  return /\bis_sample_data\b/.test(m[1]);
}

/** The value must come from reading the ORIGINAL entry, not a literal and not a memo match. */
export function derivesFromOriginal(src) {
  const clean = stripComments(src);
  const readsOriginal =
    /FROM\s+accounting\.journal_entries/i.test(clean) && /is_sample_data/.test(clean);
  const hardcoded = /is_sample_data\s*[,)]?\s*(?:=|:)\s*(?:true|false)\b/.test(clean);
  const stringMatched = /(memo|description)[^\n]{0,80}(ILIKE|includes|match|test)\s*\(?[^\n]{0,40}(SAMPLE|GATEB|USMCA)/i.test(
    clean
  );
  return { readsOriginal, hardcoded, stringMatched };
}

export function collectProblems(src, file = TARGET) {
  const problems = [];
  const named = insertNamesFlag(src);
  if (named === null) {
    problems.push(
      `${file}: no INSERT INTO accounting.journal_entries found. If the reversal writer moved, move ` +
        `this guard with it — an unparsed file must not read as a pass (ACCT-F211).`
    );
    return problems;
  }
  if (!named) {
    problems.push(
      `${file}: the reversing journal entry does not name is_sample_data, so voiding a SAMPLE entry ` +
        `creates a REAL reversal. The original is then excluded from a real-money report while its ` +
        `reversal is included — unexplained money in the GL (ACCT-F211).`
    );
  }
  const d = derivesFromOriginal(src);
  if (named && !d.readsOriginal) {
    problems.push(
      `${file}: names is_sample_data but never reads it from accounting.journal_entries. The value ` +
        `must be DERIVED from the entry being reversed (ACCT-F211).`
    );
  }
  if (d.hardcoded) {
    problems.push(
      `${file}: binds is_sample_data to a literal. That satisfies the column check while reproducing ` +
        `the defect exactly — the reversal stops matching the entry it reverses (ACCT-F211).`
    );
  }
  if (d.stringMatched) {
    problems.push(
      `${file}: derives the sample flag by string-matching a memo. That is the failure the structured ` +
        `column replaced; it breaks the moment someone edits a note (ACCT-F211).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad =
    "INSERT INTO accounting.journal_entries (operating_company_id, entry_date, memo) VALUES ($1,$2,$3)";
  if (!collectProblems(bad).some((p) => /does not name is_sample_data/.test(p))) {
    failures.push("the ACCT-F211 defect verbatim was NOT caught");
  }

  const good =
    "SELECT COALESCE(is_sample_data,false) AS is_sample_data FROM accounting.journal_entries WHERE id=$2\n" +
    "INSERT INTO accounting.journal_entries (operating_company_id, is_sample_data) VALUES ($1,$5)";
  if (collectProblems(good).length !== 0) failures.push("the corrected derivation was flagged");

  // Named but hardcoded — satisfies the column check, reproduces the defect.
  const hardcoded =
    "SELECT is_sample_data FROM accounting.journal_entries\n" +
    "INSERT INTO accounting.journal_entries (operating_company_id, is_sample_data) VALUES ($1, false)\n" +
    "const x = { is_sample_data: false };";
  if (!collectProblems(hardcoded).some((p) => /literal/.test(p))) {
    failures.push("a hardcoded literal was NOT caught");
  }

  // Named but never derived.
  const notDerived =
    "INSERT INTO accounting.journal_entries (operating_company_id, is_sample_data) VALUES ($1,$5)";
  if (!collectProblems(notDerived).some((p) => /never reads it/.test(p))) {
    failures.push("a named-but-underived flag was NOT caught");
  }

  // String-match anti-pattern.
  const stringy = good + "\nconst s = memo.includes('USMCA_GATEB');";
  if (!collectProblems(stringy).some((p) => /string-matching/.test(p))) {
    failures.push("the memo string-match anti-pattern was NOT caught");
  }

  // Unparsable must fail closed.
  if (collectProblems("const x = 1;").length !== 1) {
    failures.push("an unparsed file read as a pass — a guard that cannot see must not say OK");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 6/6 (defect caught, derivation passes, hardcoded literal caught, ` +
      `named-but-underived caught, string-match caught, unparsable fails closed)`
  );
  process.exit(0);
}

const abs = path.join(root, TARGET);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL — ${TARGET} is missing; the void reversal cannot be verified.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — the void reversal inherits is_sample_data from the entry it reverses.`);
