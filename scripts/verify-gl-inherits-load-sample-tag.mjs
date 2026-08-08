#!/usr/bin/env node
/**
 * GUARD: the revenue latch must carry the LOAD's sample flag into the GL. ACCT-F210.
 *
 * THE CHAIN THAT WAS THREE-QUARTERS BUILT. FAIL-D6 (#4923) made a load taggable at Book, and two
 * money paths already inherited it — from-load.ts writes the invoice tag and
 * settlements-load-bookended.service.ts writes the settlement-line tag. The GENERAL LEDGER did not,
 * because createJournalEntry had no is_sample_data parameter at all, so NO poster could pass one.
 *
 * A sample load therefore produced a tagged invoice, tagged settlement lines, and UNTAGGED revenue
 * journal entries — DR 1150 Unbilled / CR 4000 Income, then DR 1100 A/R / CR 1150. The GL is the
 * surface financial statements are built from, so "exclude sample rows from this report" still
 * counted sample revenue as REAL. That is precisely what the sample tag exists to prevent, and it is
 * why fixing the load alone was not enough.
 *
 * WHAT THIS ASSERTS, both halves, because either alone is useless:
 *   A. createJournalEntry ACCEPTS the flag — otherwise no poster can propagate it, ever.
 *   B. the revenue latch READS it off the load and PASSES it — otherwise the parameter exists and
 *      nothing uses it, which looks fixed and is not.
 *
 * AND IT MUST COME FROM THE LOAD. A tag derived by matching a memo or a load number against
 * 'SAMPLE' / 'USMCA_GATEB' is the exact failure the structured column was introduced to replace: it
 * breaks the moment someone edits a note, and it makes a boolean lie. This guard therefore also fails
 * if the poster tries to string-match its way to the flag.
 *
 * Run:  node scripts/verify-gl-inherits-load-sample-tag.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const JE = "apps/backend/src/accounting/journal-entries.service.ts";
const REVREC = "apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";
const LABEL = "verify-gl-inherits-load-sample-tag";

export function stripComments(src) {
  return src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** createJournalEntry must accept the flag AND name it in the journal_entries INSERT. */
export function jeAcceptsFlag(src) {
  const clean = stripComments(src);
  const inInput = /is_sample_data\?\s*:\s*boolean/.test(clean);
  const inInsert = /INSERT\s+INTO\s+accounting\.journal_entries\s*\(([\s\S]{0,900}?)\)/i.test(clean)
    ? /INSERT\s+INTO\s+accounting\.journal_entries\s*\(([\s\S]{0,900}?)\)/gi
        .exec(clean)?.[1]
        ?.includes("is_sample_data") === true
    : false;
  return { inInput, inInsert };
}

/** The latch must read the flag off mdata.loads and pass it to createJournalEntry. */
export function revrecPropagates(src) {
  const clean = stripComments(src);
  const readsLoad = /is_sample_data/.test(clean) && /FROM\s+mdata\.loads/i.test(clean);
  // The pass-through must be INSIDE the createJournalEntry call. A bare /is_sample_data:/ anywhere in
  // the file is not evidence: the LoadRow type declares `is_sample_data: boolean` and the row mapper
  // writes `is_sample_data: row.is_sample_data === true`, so a file-wide match stayed green even after
  // the actual argument was deleted. That false green was caught by mutation-testing this guard, and
  // it is exactly the "a guard that cannot fail is worthless" trap — hence the scoped window.
  const callIdx = clean.search(/createJournalEntry(?:OnClient)?\s*\(/);
  const passes =
    callIdx !== -1 && /\bis_sample_data\s*:/.test(clean.slice(callIdx, callIdx + 900));
  const stringMatched = /(memo|load_number|display_id)[^\n]{0,80}(ILIKE|includes|match|test)\s*\(?[^\n]{0,40}(SAMPLE|GATEB|USMCA)/i.test(
    clean
  );
  return { readsLoad, passes, stringMatched };
}

export function collectProblems(jeSrc, revrecSrc) {
  const problems = [];
  const je = jeAcceptsFlag(jeSrc);
  if (!je.inInput) {
    problems.push(
      `${JE}: CreateJournalEntryInput has no is_sample_data. Without it NO poster can mark a journal ` +
        `entry as sample, so a sample load's revenue lands in the GL indistinguishable from real ` +
        `money (ACCT-F210).`
    );
  }
  if (!je.inInsert) {
    problems.push(
      `${JE}: the accounting.journal_entries INSERT does not name is_sample_data, so the parameter is ` +
        `accepted and then dropped — which reads as fixed and is not (ACCT-F210).`
    );
  }
  const rr = revrecPropagates(revrecSrc);
  if (!rr.readsLoad) {
    problems.push(
      `${REVREC}: does not read is_sample_data from mdata.loads. The load is the single source of ` +
        `truth for whether this freight is sample money (ACCT-F210).`
    );
  }
  if (!rr.passes) {
    problems.push(
      `${REVREC}: reads the flag but never passes is_sample_data to createJournalEntry, so the GL ` +
        `entries stay untagged (ACCT-F210).`
    );
  }
  if (rr.stringMatched) {
    problems.push(
      `${REVREC}: derives the sample flag by string-matching a memo or load number. That is the exact ` +
        `failure the structured column replaced — it breaks the moment someone edits a note. Read the ` +
        `boolean off the load (ACCT-F210).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const goodJe =
    "type X = { is_sample_data?: boolean; };\nINSERT INTO accounting.journal_entries (operating_company_id, is_sample_data, created_at)";
  const goodRr =
    "SELECT id, COALESCE(is_sample_data,false) AS is_sample_data FROM mdata.loads WHERE id=$1\nawait createJournalEntry({ is_sample_data: prepared.isSampleData })";

  if (collectProblems(goodJe, goodRr).length !== 0) failures.push("the corrected chain was flagged");

  // Missing input param.
  const jeNoParam = "INSERT INTO accounting.journal_entries (operating_company_id, is_sample_data)";
  if (!collectProblems(jeNoParam, goodRr).some((p) => /has no is_sample_data/.test(p))) {
    failures.push("a missing input parameter was NOT caught");
  }

  // Accepted then dropped — the "looks fixed" case.
  const jeDropped = "type X = { is_sample_data?: boolean; };\nINSERT INTO accounting.journal_entries (operating_company_id, memo)";
  if (!collectProblems(jeDropped, goodRr).some((p) => /accepted and then dropped/.test(p))) {
    failures.push("accepted-then-dropped was NOT caught");
  }

  // Latch not reading / not passing.
  const rrSilent = "SELECT id FROM mdata.loads WHERE id=$1";
  if (collectProblems(goodJe, rrSilent).length < 1) failures.push("a latch that never reads the flag was NOT caught");

  // The string-match anti-pattern must be rejected even when everything else is present.
  const rrStringy = goodRr + "\nconst isSample = load.load_number.includes('USMCA_GATEB');";
  if (!collectProblems(goodJe, rrStringy).some((p) => /string-matching/.test(p))) {
    failures.push("deriving the flag from a string match was NOT caught");
  }

  // A comment must not satisfy either half.
  const commentOnly = "// is_sample_data?: boolean and INSERT names is_sample_data\nconst x=1;";
  if (collectProblems(commentOnly, goodRr).length < 2) {
    failures.push("a COMMENT satisfied the checks — false green");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 6/6 (chain passes, missing param caught, accepted-then-dropped caught, ` +
      `silent latch caught, string-match anti-pattern caught, comment cannot fake a pass)`
  );
  process.exit(0);
}

for (const f of [JE, REVREC]) {
  if (!fs.existsSync(path.join(root, f))) {
    console.error(`${LABEL} FAIL — ${f} is missing; the GL sample-tag chain cannot be verified.`);
    process.exit(1);
  }
}
const problems = collectProblems(
  fs.readFileSync(path.join(root, JE), "utf8"),
  fs.readFileSync(path.join(root, REVREC), "utf8")
);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} break(s) in the load → GL sample-tag chain:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — createJournalEntry carries is_sample_data and the revenue latch propagates it from ` +
    `the load, so a sample load's GL entries are tagged.`
);
