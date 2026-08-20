#!/usr/bin/env node
/**
 * ACCT-F5604 regression guard — bank-recon auto-match must keep BOTH halves of the fix:
 *   (1) AUTO_MATCH_MEMO_SIMILARITY_MIN stays recalibrated to 0.5 (not reverted to the old 0.8,
 *       which structurally rejected every bank-categorization JE candidate — measured live,
 *       banking.reconciliation_matches had 0 rows database-wide for as long as the table existed —
 *       because the poster's own boilerplate memo wrapper dilutes a real content match to ~0.6).
 *   (2) the memo similarity term is still present in the autoMatch gate at all (not deleted
 *       entirely, which would auto-match genuinely unrelated candidates that merely share an
 *       amount+date coincidence — the exact protection match-auto-vs-manual.test.ts's "similarity
 *       is too low" case locks in).
 *
 * This is a narrow, deliberate financial-logic constant: too high silently reverts the bug (auto-
 * match never fires), too low or removed entirely risks false-positive auto-matches that post real
 * GL entries against the wrong ledger row. Both directions are asserted so neither regression class
 * can land silently.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-automatch-memo-threshold-calibrated";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/bank-recon/match.service.ts";

const THRESHOLD_LINE = "const AUTO_MATCH_MEMO_SIMILARITY_MIN = 0.5;";
const GATE_LINE = "similarity >= AUTO_MATCH_MEMO_SIMILARITY_MIN;";

function assertAll(src) {
  const problems = [];
  if (!src.includes(THRESHOLD_LINE)) {
    problems.push(
      "AUTO_MATCH_MEMO_SIMILARITY_MIN is not set to the recalibrated 0.5 -- either reverted to the " +
        "old 0.8 (which structurally blocked every bank-categorization JE auto-match) or changed to " +
        "an unreviewed value. If a new value is genuinely correct, update this guard deliberately " +
        "with fresh evidence, don't silence it."
    );
  }
  if (!src.includes(GATE_LINE)) {
    problems.push(
      "autoMatch no longer gates on memo similarity at all -- this removes the only protection " +
        "against auto-matching an unrelated candidate that coincidentally shares an amount+date " +
        "(see match-auto-vs-manual.test.ts's 'similarity is too low' case). Recalibrate the " +
        "threshold, don't drop the check."
    );
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const revertedToOldValue = src.replace(THRESHOLD_LINE, "const AUTO_MATCH_MEMO_SIMILARITY_MIN = 0.8;");
  const revertedProblems = assertAll(revertedToOldValue);
  if (!revertedProblems.some((p) => p.includes("recalibrated"))) {
    console.error(`${LABEL} SELFTEST FAILED: reverting threshold to 0.8 not caught`);
    process.exit(1);
  }

  const gateIdx = src.indexOf(GATE_LINE);
  if (gateIdx === -1) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: gate line not found in real code (guard text drifted)`);
    process.exit(1);
  }
  const lineStart = src.lastIndexOf("\n", gateIdx) + 1;
  const prevLineEnd = src.lastIndexOf("\n", lineStart - 2) + 1;
  // Remove the whole `similarity >= AUTO_MATCH_MEMO_SIMILARITY_MIN;` line AND the `&&` line above it,
  // replacing with a harmless no-op boolean so the planted source stays syntactically valid.
  const andLineStart = src.lastIndexOf("\n", prevLineEnd - 2) + 1;
  const droppedGate =
    src.slice(0, andLineStart) + "          amountGapCents <= toleranceCents && dateGapDays <= AUTO_MATCH_DATE_WINDOW_DAYS;\n" + src.slice(src.indexOf("\n", gateIdx) + 1);
  const droppedProblems = assertAll(droppedGate);
  if (!droppedProblems.some((p) => p.includes("no longer gates"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping the memo gate entirely not caught\n  got: ${droppedProblems.join(" | ") || "(no problems)"}`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — AUTO_MATCH_MEMO_SIMILARITY_MIN recalibrated to 0.5 and still gates autoMatch`);
