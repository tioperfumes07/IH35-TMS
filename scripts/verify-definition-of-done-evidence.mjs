#!/usr/bin/env node
/**
 * GUARD: the Definition of Done cannot be skipped silently.
 *
 * docs/specs/DEFINITION-OF-DONE.md is the canonical standard. Most of it (reverse drill-through,
 * live proof, entity scope) is not statically decidable — but the parts that make a change REVIEWABLE
 * are, and those are exactly the parts that get dropped under time pressure.
 *
 * This guard enforces three mechanical DoD obligations on every branch commit that touches app code:
 *
 *   1. RULE 16 EVIDENCE BLOCK — the commit message states ROOT CAUSE / FIX / GUARD / LIVE PROOF
 *      (or UNVERIFIED) / REMAINING. A change nobody can review is not done.
 *   2. GUARD ACCOMPANIMENT — a commit that fixes a defect adds or updates a scripts/verify-*.mjs.
 *      "Every bug fix ships a static CI guard. No guard = not done."
 *   3. LEGAL GUARD WIRING — any new scripts/verify-*.mjs is wired via scripts/verify-steps/NNNN-*.mjs,
 *      never by adding a verify:* entry to package.json (STOP-THE-THRASH-WORKORDER-2026-07-17), which
 *      is both forbidden and inert (no workflow executes it).
 *
 * SCOPE: only commits on the current branch that are not on origin/main, and only those touching
 * apps/ or db/. Docs-only, guard-only and chore commits are exempt — they carry no defect to prove.
 *
 * This is deliberately a FLOOR, not the whole standard. Passing it does NOT mean a change is done;
 * failing it means it definitely is not.
 *
 * ZERO-COMMIT FAKE-GREEN (fixed 2026-07-25, same family as verify-step 1430): `collectBranchCommits`
 * used to `return []` when `git merge-base` produced nothing, and an empty list means zero problems
 * means "OK". In a shallow clone — the actions/checkout default and the state this repo's shared
 * clone was actually found in — that is a green DoD gate that inspected no commits. The range
 * precondition is now shared with 1430 via scripts/lib/branch-range-guard.mjs and refuses.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCommitRange, collectGitFacts, rangeCommitShas } from "./lib/branch-range-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-definition-of-done-evidence";
const DOD = "docs/specs/DEFINITION-OF-DONE.md";
const HOOK = ".husky/commit-msg";
/**
 * Only self-execute when run directly. Without this, `import`ing this module from another guard
 * (check-pr-evidence-body.mjs) inherits its `--selftest` argv, runs THIS selftest, and
 * `process.exit(0)`s before the importer's own selftest executes — making the importer's selftest
 * structurally incapable of failing. Caught while wiring the PR-body guard.
 */
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const SELFTEST = IS_MAIN && process.argv.includes("--selftest");

const sh = (cmd) => {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

/**
 * Each section must appear as its own LABELLED LINE — `ROOT CAUSE:` / `### ROOT CAUSE` / `**GUARD:**`.
 *
 * The previous regexes matched a bare keyword ANYWHERE in the message: `/guard/i` passed on the word
 * "guard" in prose, `/(live proof|verified|…)/i` passed on the word "verified", and `/\bfix\b/`
 * passed automatically on any `fix(scope):` subject. REMAINING was not checked at all. Five merged
 * per-entity catalog PRs (#3397/#3403/#3405/#3408/#3409) carried none of the block and still went
 * green. A label at line start cannot be satisfied by prose. See docs/specs/PER-PR-CHECKLIST.md §3.
 */
const label = (name) => new RegExp(String.raw`^[\s>*_#\-]*${name}\b\s*:?`, "im");

export const EVIDENCE_KEYS = [
  { key: "ROOT CAUSE", re: label("ROOT CAUSE") },
  { key: "FIX", re: label("FIX") },
  { key: "GUARD", re: label("GUARD") },
  { key: "LIVE PROOF or UNVERIFIED", re: /^[\s>*_#\-]*(LIVE PROOF|UNVERIFIED)\b\s*:?/im },
  { key: "REMAINING", re: label("REMAINING") },
];

/**
 * LIVE PROOF must name an ARTIFACT — a sha, an endpoint/URL, a count, a screenshot path — or declare
 * UNVERIFIED with a blocker. The bare word "verified" is an assertion, not evidence (PER-PR §3).
 */
const PROOF_ARTIFACT = /([0-9a-f]{7,40}\b|https?:\/\/|\/api\/|\brows?\b|\bcount\b|\d|screenshot|healthz)/i;

const IS_LABEL_LINE = /^[\s>*_#\-]*(ROOT CAUSE|FIX|GUARD|LIVE PROOF|UNVERIFIED|REMAINING)\b/i;

/**
 * The proof can sit on the label line (`LIVE PROOF: healthz 2088757`) or beneath it in the
 * PR-template heading form (`### LIVE PROOF` / newline / `healthz sha 2088757`). Read the label's
 * own remainder PLUS the lines under it, up to the next label — otherwise the template's own
 * shape is flagged, which the selftest caught.
 */
export function proofLineIsSubstantiated(text) {
  const lines = text.split(/\r?\n/);
  // Require a real LABEL (`LIVE PROOF:` / `UNVERIFIED:` / `### LIVE PROOF`), not prose that
  // happens to mention those words inside FIX/ROOT CAUSE (Cursor false-positive class 2026-07-29).
  const start = lines.findIndex(
    (l) =>
      /^[\s>*_#\-]*(LIVE PROOF|UNVERIFIED)\b\s*:/i.test(l) ||
      /^[\s>*_#\-]*#{1,6}\s+(LIVE PROOF|UNVERIFIED)\b/i.test(l)
  );
  if (start === -1) return true; // absence is already reported by EVIDENCE_KEYS
  const labelLine = lines[start];
  // Cursor agents often write `LIVE PROOF: UNVERIFIED — <blocker>` (or `:`) on one line.
  // Treat that as the UNVERIFIED form (named blocker required), not LIVE PROOF (artifact required).
  const isUnverified =
    /^[\s>*_#\-]*UNVERIFIED\b/i.test(labelLine) ||
    /^[\s>*_#\-]*#{0,6}\s*LIVE PROOF\b[^:\n]*:\s*UNVERIFIED\b/i.test(labelLine);
  let head = labelLine.replace(/^[\s>*_#\-]*(?:#{1,6}\s+)?(LIVE PROOF|UNVERIFIED)\b\s*:?/i, "");
  if (isUnverified) {
    head = head.replace(/^\s*UNVERIFIED\b\s*[:—–-]*\s*/i, "");
  }
  const rest = [];
  for (let i = start + 1; i < lines.length && !IS_LABEL_LINE.test(lines[i]); i += 1) rest.push(lines[i]);
  const section = [head, ...rest].join(" ").trim();
  // UNVERIFIED needs a named blocker (any substance); LIVE PROOF needs a concrete artifact.
  return isUnverified ? /\S/.test(section) : PROOF_ARTIFACT.test(section);
}

/** A commit is "app-affecting" when it touches shipped code. */
function isAppAffecting(files) {
  return files.some((f) => f.startsWith("apps/") || f.startsWith("db/"));
}

/** Fix-shaped commits must carry a guard. Features/chores are not exempted from evidence, only guards. */
function isFixShaped(subject) {
  return /^(fix|hotfix)[(:]/i.test(subject.trim());
}

/**
 * Injectable core so the selftest exercises the real assertions against synthetic commits
 * instead of re-deriving them.
 */
export function assertDoDEvidence(commits, opts = {}) {
  const problems = [];
  const dodPresent = opts.dodPresent ?? fs.existsSync(path.join(ROOT, DOD));
  if (!dodPresent) {
    problems.push(
      `${DOD} is missing — the canonical Definition of Done must exist for this guard to mean anything`
    );
  }

  // The commit-msg hook is the fast local half of this rule. It is bypassable with --no-verify (by
  // design, and this repo uses that), so CI is the real gate — but nothing should be able to DELETE
  // the local hook silently. Assert it is present and still calls the shared checker.
  const hookPresent = opts.hookPresent ?? fs.existsSync(path.join(ROOT, HOOK));
  const hookWired =
    opts.hookWired ??
    (hookPresent && /check-commit-evidence\.mjs/.test(fs.readFileSync(path.join(ROOT, HOOK), "utf8")));
  if (!hookPresent) {
    problems.push(
      `${HOOK} is missing — the commit-time evidence check was removed. Restore it (see ${DOD} §3).`
    );
  } else if (!hookWired) {
    problems.push(
      `${HOOK} exists but no longer invokes scripts/check-commit-evidence.mjs — the hook is inert.`
    );
  }

  for (const c of commits) {
    const { sha, subject, body, files } = c;
    if (!isAppAffecting(files)) continue;
    const short = sha.slice(0, 9);
    const text = `${subject}\n${body}`;

    const missing = EVIDENCE_KEYS.filter((k) => !k.re.test(text)).map((k) => k.key);
    if (missing.length) {
      problems.push(
        `${short} "${subject.slice(0, 60)}" touches app code but its message omits the Rule 16 evidence ` +
          `block section(s): ${missing.join(", ")}. Each must be its own labelled line. See ${DOD} §3.`
      );
    } else if (!proofLineIsSubstantiated(text)) {
      problems.push(
        `${short} "${subject.slice(0, 60)}" has a LIVE PROOF/UNVERIFIED line that names no artifact. ` +
          `Give a sha, endpoint, row count or screenshot — or "UNVERIFIED: <blocker>". ` +
          `The word "verified" alone is an assertion, not evidence. See docs/specs/PER-PR-CHECKLIST.md §3.`
      );
    }

    if (isFixShaped(subject)) {
      const touchesGuard = files.some(
        (f) => /^scripts\/verify-.*\.mjs$/.test(f) || /^scripts\/verify-steps\/.*\.mjs$/.test(f)
      );
      if (!touchesGuard) {
        problems.push(
          `${short} "${subject.slice(0, 60)}" is a fix but adds/updates no scripts/verify-*.mjs guard. ` +
            `"Every bug fix ships a static CI guard. No guard = not done." See ${DOD} §4.`
        );
      }
    }

    // A new guard wired through package.json is forbidden AND inert.
    const addsGuard = files.some((f) => /^scripts\/verify-[^/]*\.mjs$/.test(f));
    const addsStep = files.some((f) => /^scripts\/verify-steps\//.test(f));
    const touchesPkg = files.includes("package.json");
    if (addsGuard && touchesPkg && !addsStep) {
      problems.push(
        `${short} "${subject.slice(0, 60)}" adds a guard and edits package.json without a ` +
          `scripts/verify-steps/NNNN-*.mjs entry. package.json wiring is forbidden and never executes. ` +
          `See ${DOD} §4.`
      );
    }
  }
  return problems;
}

/** Set by collectBranchCommits so the PASS line can state WHAT was checked, never a bare "OK". */
let RANGE_NOTE = "";

/**
 * Parse a commit message the same way the commit-msg hook does (first LINE = subject, rest = body
 * with newlines preserved) — NOT git's `%s`/`%b`.
 *
 * Git treats the first *paragraph* (everything before the first blank line) as the subject and
 * collapses internal newlines to spaces in `%s`. Cursor/agents often put FINDING + DOD-A…E +
 * Rule 16 on consecutive lines with NO blank line after the subject. `%s` then becomes one giant
 * line; labelled `^ROOT CAUSE:` checks fail even though the raw message has correct newlines.
 * That local-hook-green / CI-red drift burned #4211 (2026-08-03). Always read `%B`.
 */
export function splitCommitMessage(fullMessage) {
  const lines = String(fullMessage ?? "").replace(/\r\n/g, "\n").split("\n");
  const subject = (lines[0] ?? "").trimEnd();
  const body = lines.slice(1).join("\n").replace(/^\n+/, "").trimEnd();
  return { subject, body };
}

function collectBranchCommits() {
  const facts = collectGitFacts(ROOT);
  const shas = rangeCommitShas(facts, ROOT);
  const verdict = classifyCommitRange({ ...facts, commitCount: shas.length });
  if (verdict.fatal) {
    console.error(`${LABEL} FAILED [${verdict.code}] — the branch range cannot be checked:\n  ${verdict.fatal}`);
    process.exit(1);
  }
  RANGE_NOTE = `${verdict.note} [${verdict.code}]`;
  return shas.map((sha) => {
    const full = sh(`git log -1 --format=%B ${sha}`);
    const { subject, body } = splitCommitMessage(full);
    return {
      sha,
      subject,
      body,
      files: sh(`git diff-tree --no-commit-id --name-only -r ${sha}`).split("\n").filter(Boolean),
    };
  });
}

if (SELFTEST) {
  const failures = [];
  const expect = (name, commits, needle, opts) => {
    const problems = assertDoDEvidence(commits, opts);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(
        `${name}: planted defect NOT caught (expected "${needle}", got: ${
          problems.length ? problems.join(" | ") : "no problems"
        })`
      );
    }
  };

  const good = {
    sha: "a".repeat(40),
    subject: "fix(x): thing was broken",
    body: "ROOT CAUSE: y\nFIX: z\nGUARD: scripts/verify-x.mjs\nLIVE PROOF: endpoint 200\nREMAINING: none",
    files: ["apps/backend/src/x.ts", "scripts/verify-x.mjs", "scripts/verify-steps/1400-verify-x.mjs"],
  };

  // Case 1: app change with no evidence block.
  expect(
    "missing-evidence",
    [{ ...good, body: "made it better" }],
    "omits the Rule 16 evidence block"
  );

  // Case 2: a fix with no guard.
  expect(
    "fix-without-guard",
    [{ ...good, files: ["apps/backend/src/x.ts"] }],
    "adds/updates no scripts/verify-*.mjs guard"
  );

  // Case 3: guard wired through package.json instead of verify-steps.
  expect(
    "pkg-json-wiring",
    [{ ...good, files: ["apps/backend/src/x.ts", "scripts/verify-x.mjs", "package.json"] }],
    "package.json wiring is forbidden"
  );

  // Case 4: the canonical DoD file going missing must fail.
  expect("dod-missing", [good], "canonical Definition of Done must exist", { dodPresent: false });

  // Case 5: deleting the commit-msg hook must fail (nobody removes the local check quietly).
  expect("hook-deleted", [good], "commit-time evidence check was removed", { hookPresent: false });

  // Case 6: a hook that exists but no longer calls the shared checker is inert and must fail.
  expect("hook-inert", [good], "the hook is inert", { hookPresent: true, hookWired: false });

  // Case 7: REMAINING omitted — previously not checked at all, so it always passed.
  expect(
    "missing-remaining",
    [{ ...good, body: "ROOT CAUSE: y\nFIX: z\nGUARD: scripts/verify-x.mjs\nLIVE PROOF: endpoint 200" }],
    "REMAINING"
  );

  // Case 8: THE REAL REGRESSION — the shape of the five merged per-entity catalog PRs. Prose that
  // happens to contain the words "guard" and "verified" but carries no labelled block. The old
  // keyword-anywhere regexes passed this; labelled lines must not.
  expect(
    "prose-keywords-not-a-block",
    [
      {
        ...good,
        subject: "feat(lists): per-entity fleet catalogs",
        body:
          "Each entity owns its rows. The shared guard covers the 8 tables and this was verified on prod.\n" +
          "Migration adds operating_company_id and forces RLS.",
      },
    ],
    "omits the Rule 16 evidence block"
  );

  // Case 9: a LIVE PROOF line that asserts rather than evidences.
  expect(
    "proof-without-artifact",
    [{ ...good, body: "ROOT CAUSE: y\nFIX: z\nGUARD: scripts/verify-x.mjs\nLIVE PROOF: verified\nREMAINING: none" }],
    "names no artifact"
  );

  // Negative: the PR-template heading form (### ROOT CAUSE, no colon) must NOT be flagged.
  const headingForm = assertDoDEvidence([
    {
      ...good,
      body:
        "### ROOT CAUSE\nmechanism\n### FIX\nchange\n### GUARD\nscripts/verify-x.mjs\n" +
        "### LIVE PROOF\nhealthz sha 2088757\n### REMAINING\nnone",
    },
  ]);
  if (headingForm.length) failures.push(`false-positive on the PR-template heading form: ${headingForm.join(" | ")}`);

  // Negative: LIVE PROOF: UNVERIFIED — <blocker> (Cursor habit) must NOT be flagged.
  const liveProofUnverified = assertDoDEvidence([
    {
      ...good,
      body:
        "ROOT CAUSE: y\nFIX: z\nGUARD: scripts/verify-x.mjs\n" +
        "LIVE PROOF: UNVERIFIED — browser click-through not re-proven this PR\nREMAINING: the live check",
    },
  ]);
  if (liveProofUnverified.length) {
    failures.push(`false-positive on LIVE PROOF: UNVERIFIED — blocker: ${liveProofUnverified.join(" | ")}`);
  }

  // Negative: FIX prose that mentions the words LIVE PROOF / UNVERIFIED without a labelled line
  // must still use the real LIVE PROOF: line below — not treat the prose as the proof section.
  const proseMention = assertDoDEvidence([
    {
      ...good,
      body:
        "ROOT CAUSE: y\nFIX: keep LIVE PROOF UNVERIFIED format accepted by prior commit.\n" +
        "GUARD: scripts/verify-x.mjs\nLIVE PROOF: UNVERIFIED: CI pending\nREMAINING: none",
    },
  ]);
  if (proseMention.length) {
    failures.push(`false-positive on LIVE PROOF words inside FIX prose: ${proseMention.join(" | ")}`);
  }

  // Negative: an honest UNVERIFIED with a named blocker must NOT be flagged.
  const unverified = assertDoDEvidence([
    {
      ...good,
      body:
        "ROOT CAUSE: y\nFIX: z\nGUARD: scripts/verify-x.mjs\n" +
        "UNVERIFIED: prod DB access is gated, owner must run the Neon check\nREMAINING: the live check",
    },
  ]);
  if (unverified.length) failures.push(`false-positive on an honest UNVERIFIED: ${unverified.join(" | ")}`);

  // Negative: a compliant commit must NOT be flagged, and a docs-only commit is exempt.
  const clean = assertDoDEvidence([good]);
  if (clean.length) failures.push(`false-positive on a compliant commit: ${clean.join(" | ")}`);
  const docsOnly = assertDoDEvidence([
    { sha: "b".repeat(40), subject: "docs: notes", body: "", files: ["docs/x.md"] },
  ]);
  if (docsOnly.length) failures.push(`false-positive on a docs-only commit: ${docsOnly.join(" | ")}`);

  // #4211 class: FINDING + Rule 16 on consecutive lines with NO blank line after subject.
  // splitCommitMessage must keep labelled lines; git %s would flatten and falsely fail.
  const noBlankFull =
    "FINDING: X\nLANE: NON-FINANCIAL\n" +
    "ROOT CAUSE: y\nFIX: z\nGUARD: scripts/verify-x.mjs\nLIVE PROOF: neon count 1\nREMAINING: none";
  const split = splitCommitMessage(noBlankFull);
  const noBlankProblems = assertDoDEvidence([
    { sha: "c".repeat(40), subject: split.subject, body: split.body, files: ["apps/frontend/src/x.tsx"] },
  ]);
  if (noBlankProblems.length) {
    failures.push(`#4211 no-blank-line false-positive: ${noBlankProblems.join(" | ")}`);
  }
  // Flattened %s shape (spaces, no newlines) must still FAIL — labels are not line-anchored.
  expect(
    "flattened-percent-s-subject",
    [
      {
        sha: "d".repeat(40),
        subject: noBlankFull.replace(/\n/g, " "),
        body: "Co-authored-by: Cursor <cursoragent@cursor.com>",
        files: ["apps/frontend/src/x.tsx"],
      },
    ],
    "omits the Rule 16 evidence block"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted defects caught; compliant, heading-form, LIVE PROOF:UNVERIFIED, honest-UNVERIFIED and docs-only commits not flagged`);
  process.exit(0);
}

// Guarded by IS_MAIN for the same reason as SELFTEST: importing this module must not run the
// branch scan (it printed a spurious "OK" line into the importer's output before this was added).
const problems = IS_MAIN ? assertDoDEvidence(collectBranchCommits()) : [];
if (IS_MAIN && problems.length) {
  console.error(`${LABEL} FAILED — Definition of Done not satisfied:`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\nCanonical standard: ${DOD}`);
  process.exit(1);
}
if (IS_MAIN) {
  console.log(`${LABEL} OK — ${RANGE_NOTE}: branch commits carry evidence, guards, and legal guard wiring`);
}
