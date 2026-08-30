#!/usr/bin/env node
/** @independent-input origin/main — compares the working board with the committed base board. */
/**
 * GUARD: the findings board is APPEND-ONLY, and a completion claim must cite its evidence.
 *
 * `docs/audit/GUARD-WORKORDERS.md` is append-only BY LAW (Rule 28: never delete a row, supersede
 * instead) and until now NOTHING enforced it. Two independent failure modes hit real PRs on
 * 2026-08-08, both caught only because a human happened to read a numstat line:
 *
 *   1. SILENT DELETION — SIX near-misses in one day. A parked branch merged from behind removes rows
 *      other lanes wrote. #4752 alone would have deleted the MIGRATION-NUMBER-RACE row (0 additions /
 *      50 deletions); an earlier sync would have removed CC-2's P0 CI-ACTIONS-DEAD row. Every one of
 *      those diffs looks completely ordinary. The only tell is a NET-NEGATIVE row count.
 *
 *   2. FAKE COMPLETION — #4724 would have written "CLS-LOAD-STATUS-MONEY-EFFECTS DRAINED" crediting
 *      accounting/load-status-money-effects.service.ts, a file that does not exist on main and never
 *      will (its PR is the held latch trap). That row ADDED lines, so a deletion-only check waves it
 *      through. A board row OUTLIVES the PR that wrote it, which makes a false completion the more
 *      durable of the two defects.
 *
 * WHY CHECK B IS A RATCHET AND NOT AN ABSOLUTE. Measured on main before writing this: 35 rows assert
 * FIXED/DRAINED and **9 of them cite no PR or SHA**. A strict "must cite" rule would be RED ON DAY ONE
 * against correct history, and a permanently-red guard gets muted — destroying the one assertion that
 * catches the real defect. Same lesson as the A/R tie-out and the migration-collision baseline: freeze
 * what exists, fail only what is NEW.
 *
 * Run:  node scripts/verify-board-append-only.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const BOARD = "docs/audit/GUARD-WORKORDERS.md";
const BASE_REF = process.env.BOARD_BASE_REF || "origin/main";

/**
 * FROZEN BASELINE — completion rows that predate this guard and cite no PR/SHA. They are historical
 * and unfixable-by-me (rewriting another lane's row to add a citation I cannot verify would be worse
 * than the gap). RATCHET: a NEW uncited completion fails. NEVER add to this number to make a build
 * green — raising it is the one edit this guard exists to prevent.
 */
const UNCITED_BASELINE = 1;

/** A board row: a markdown table row that opens with bold. */
const ROW_RE = /^\|\s*\*\*/;
/**
 * Asserts completion — matched ONLY in the row's leading STATUS CELL, not anywhere in the prose.
 *
 * It used to be a bare /\b(FIXED|DRAINED)\b/ over the whole row, which is wrong for an obvious
 * reason I hit myself: a row whose narrative says "see the FIXED row for this id" is not a
 * completion claim, but the old pattern counted it as one and demanded a citation. Any row
 * DISCUSSING a fix — including every supersede pointer — was a false positive waiting to happen.
 *
 * The status cell is the first bold run at the start of the row, e.g. `| **FIXED** \`ACCT-F1\``.
 * Classifying on that is both stricter and more honest: it is the field that actually declares the
 * row's state.
 */
const STATUS_CELL_RE = /^\|\s*\*\*([^*]{0,120})\*\*/;
const COMPLETION_RE = /\b(FIXED|DRAINED)\b/;
function statusCell(line) {
  return STATUS_CELL_RE.exec(line)?.[1] ?? "";
}
/** Cites a PR (#1234) or a git sha (7-40 hex). */
const CITATION_RE = /#\d{3,5}|\b[0-9a-f]{7,40}\b/;

export function countRows(text) {
  return text.split("\n").filter((l) => ROW_RE.test(l)).length;
}

export function uncitedCompletions(text) {
  return text
    .split("\n")
    .filter((l) => ROW_RE.test(l) && COMPLETION_RE.test(statusCell(l)) && !CITATION_RE.test(l));
}

function git(args) {
  // maxBuffer MUST be raised: the board is >1 MB, and Node's 1 MB default KILLS the child, which
  // returns status=null with a truncated stdout. The first draft of this guard treated that as
  // "base unavailable" and SILENTLY SKIPPED the deletion check — permanently green on the check that
  // matters most. Caught by running it and reading the SKIP line instead of trusting the exit code.
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.signal) return null;
  return r.status === 0 ? r.stdout : null;
}

const SELFTEST = process.argv.includes("--selftest");

if (SELFTEST) {
  const failures = [];
  const row = (body) => `| **${body}** | — | C | CC-1 | detail | — | OPEN |`;

  // A — deletion detection
  const before = [row("A"), row("B"), row("C")].join("\n");
  const afterDel = [row("A"), row("C")].join("\n");
  const afterAdd = [row("A"), row("B"), row("C"), row("D")].join("\n");
  if (countRows(before) !== 3) failures.push("countRows miscounted a 3-row board");
  if (countRows(afterDel) >= countRows(before) === false) {
    /* placeholder — real assertion below */
  }
  if (!(countRows(afterDel) < countRows(before))) failures.push("a DELETED row was not detected as net-negative");
  if (!(countRows(afterAdd) > countRows(before))) failures.push("an ADDED row was miscounted");
  if (countRows("no rows here at all") !== 0) failures.push("non-row text counted as rows");

  // B — completion must cite
  const citedPr = row("FIXED `ACCT-F1` — done in #4753");
  const citedSha = row("DRAINED `CLS-X` — landed cf748b44b");
  const uncited = row("FIXED `ACCT-F2` — trust me it is done");
  const openRow = row("OPEN `ACCT-F3` — no completion claimed");
  if (uncitedCompletions(citedPr).length !== 0) failures.push("a PR-cited completion was flagged");
  if (uncitedCompletions(citedSha).length !== 0) failures.push("a SHA-cited completion was flagged");
  if (uncitedCompletions(uncited).length !== 1) failures.push("an UNCITED completion was NOT caught — the #4724 defect");
  if (uncitedCompletions(openRow).length !== 0) failures.push("an OPEN row was flagged as an uncited completion");

  // The false positive I created for myself: a row that merely MENTIONS a fix in its prose is not a
  // completion claim. Superseding a stale duplicate produces exactly this shape.
  const mentionsFix =
    "| **\u26a0 SUPERSEDED (duplicate row — see the resolved row for this id)** `CLS-X` — the other copy is FIXED | — | C | CC-1 | detail | — | SUPERSEDED |";
  if (uncitedCompletions(mentionsFix).length !== 0) {
    failures.push("a row that only MENTIONS 'FIXED' in its prose was counted as an uncited completion");
  }
  // And the real defect must still be caught when FIXED is the STATUS.
  if (uncitedCompletions(row("FIXED `ACCT-F9` — no citation anywhere")).length !== 1) {
    failures.push("an uncited completion in the STATUS CELL was missed — the #4724 defect");
  }

  if (failures.length) {
    console.error("verify-board-append-only SELFTEST FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-board-append-only SELFTEST OK — 9/9 (row deletion detected, additions fine, uncited completion caught, PR/SHA-cited and OPEN rows pass, prose mentioning FIXED is not a claim, status-cell FIXED still caught)"
  );
  process.exit(0);
}

const problems = [];
let current;
try {
  current = readFileSync(BOARD, "utf8");
} catch {
  console.log(`verify-board-append-only SKIP — ${BOARD} not present`);
  process.exit(0);
}

// CHECK A — append-only. Absolute: a row deletion is never correct (Rule 28 says supersede).
const baseText = git(["show", `${BASE_REF}:${BOARD}`]);
if (baseText == null) {
  console.log(`verify-board-append-only: base ${BASE_REF} unavailable — deletion check SKIPPED (degrade-safe)`);
} else {
  const before = countRows(baseText);
  const after = countRows(current);
  if (after < before) {
    problems.push(
      `board LOST ${before - after} row(s) vs ${BASE_REF} (${before} -> ${after}). The board is APPEND-ONLY ` +
        `(Rule 28: supersede, never delete). This is almost always a stale branch merged from behind ` +
        `silently removing another lane's rows — restore with: git checkout ${BASE_REF} -- ${BOARD}`
    );
  }
}

// CHECK C — a finding id must not be simultaneously OPEN and FIXED.
//
// The board uses a UNION merge strategy (.gitattributes), which on a conflicting edit keeps BOTH
// sides — so one finding ends up with two rows. An in-place status edit then updates only the copy
// the editor happened to match, and the stale copy reads OPEN forever, sending the next agent to
// redo finished work. Measured on 2026-08-08: ELEVEN ids were OPEN and FIXED at the same time, six
// of them findings fixed that same day.
//
// ABSOLUTE, not ratcheted: the count is 0 after the sweep, and a contradiction is never correct.
// Superseding a duplicate (Rule 28 — never delete) clears it; deleting the row does not, and the
// deletion check above would catch that anyway.
const statusOf = (l) => statusCell(l);
const OPEN_RE = /\bOPEN\b/;
const ID_RE = /`((?:ACCT|BANK|LST|CI|CLS|LV)-[A-Z0-9-]+)`/g;
{
  const st = new Map();
  for (const l of current.split("\n")) {
    if (!ROW_RE.test(l)) continue;
    const cell = statusOf(l);
    const isOpen = OPEN_RE.test(cell);
    const isDone = COMPLETION_RE.test(cell) || /\b(CLOSED|RESOLVED)\b/.test(cell);
    if (!isOpen && !isDone) continue;
    for (const m of l.slice(0, 400).matchAll(ID_RE)) {
      const e = st.get(m[1]) ?? { open: 0, done: 0 };
      if (isOpen) e.open += 1;
      if (isDone) e.done += 1;
      st.set(m[1], e);
    }
  }
  const contradictions = [...st].filter(([, v]) => v.open && v.done).map(([k]) => k);
  if (contradictions.length) {
    problems.push(
      `${contradictions.length} finding id(s) are simultaneously OPEN and FIXED/CLOSED on this board: ` +
        `${contradictions.slice(0, 10).join(", ")}. The union merge strategy duplicates rows, and an ` +
        `in-place status edit updates only one copy — the stale one then sends the next agent to redo ` +
        `finished work. Supersede the duplicate (never delete it).`
    );
  }
}

// CHECK B — a completion claim must cite its evidence. RATCHET against the frozen baseline.
const uncited = uncitedCompletions(current);
if (uncited.length > UNCITED_BASELINE) {
  problems.push(
    `${uncited.length} completion row(s) cite no PR or SHA, baseline is ${UNCITED_BASELINE} — ` +
      `${uncited.length - UNCITED_BASELINE} NEW uncited completion(s). A FIXED/DRAINED row that names no ` +
      `PR or sha is a claim, not a record: #4724 credited a file that does not exist on main. Cite the ` +
      `merged PR (#1234) or sha.`
  );
  for (const l of uncited.slice(0, 20)) console.error(`    uncited: ${l.slice(0, 120)}`);
}

if (problems.length) {
  console.error(`verify-board-append-only FAILED — ${problems.length} issue(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

console.log(
  `verify-board-append-only OK — no row deleted vs ${BASE_REF}; uncited completions ${uncited.length} <= baseline ${UNCITED_BASELINE}`
);
