#!/usr/bin/env node
/**
 * commit-msg hook: enforce the Definition of Done evidence block AT COMMIT TIME.
 *
 * This is the fast local half of the same rule CI enforces in
 * scripts/verify-definition-of-done-evidence.mjs (verify-step 1324). It deliberately IMPORTS that
 * file's assertion instead of re-implementing it, so the local hook and the CI gate can never drift
 * apart ? a second copy of a rule is a rule that will disagree with itself.
 *
 * Money paths ALSO run assertNoMoneyTheater (DoD ?10 / verify-step 1430) ? FINDING + LANE +
 * DOD-A..E + VERIFY-1..8 + MODULE_PROGRESS + Rule 16 required or the commit is rejected.
 *
 * AMEND HOLE (fixed Rule 25 / 2026-07-28): `git commit --amend` with a message-only rewrite leaves
 * `git diff --cached` empty. The old hook exited 0 and let bad FINDING / MODULE_PROGRESS ship ?
 * then CI burned ~15m before verify-no-money-theater failed. When staged is empty we classify
 * files from HEAD (the commit being rewritten) via scripts/lib/commit-msg-files.mjs.
 *
 * HONEST LIMIT: `git commit --no-verify` skips this hook. CI verify-steps 1324 + 1430 + 1431 cannot be
 * bypassed. verify-step 1324 asserts this hook still exists. Pre-push money-pr-local-gate is the
 * second local backstop (Rule 25).
 *
 * Exit 0 = allowed. Exit 1 = commit rejected with the template printed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCommitMsgFiles } from "./lib/commit-msg-files.mjs";
import { assertDoDEvidence, splitCommitMessage } from "./verify-definition-of-done-evidence.mjs";
import {
  assertNoMoneyTheater,
  isMoneyAppCommit,
  MONEY_DOD_COMMIT_TEMPLATE,
} from "./verify-no-money-theater.mjs";

export { resolveCommitMsgFiles } from "./lib/commit-msg-files.mjs";

function main() {
  const msgFile = process.argv[2];
  if (!msgFile) process.exit(0);

  let raw = "";
  try {
    raw = fs.readFileSync(msgFile, "utf8");
  } catch {
    process.exit(0);
  }

  const message = raw
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .trim();

  // Same splitter as CI (verify-definition-of-done-evidence collectBranchCommits) ? first LINE
  // is subject; rest keeps newlines so Rule 16 labels stay line-anchored.
  const { subject, body } = splitCommitMessage(message);

  if (/^(Merge|Revert|fixup!|squash!)\b/i.test(subject.trim())) process.exit(0);

  const { files } = resolveCommitMsgFiles();
  if (files.length === 0) process.exit(0);

  const staged = [{ sha: "STAGED".padEnd(40, "0"), subject, body, files }];
  const problems = assertDoDEvidence(staged);
  if (isMoneyAppCommit(files) || files.some((f) => /^db\/migrations\//i.test(f))) {
    for (const p of assertNoMoneyTheater(staged)) problems.push(p);
  }

  if (problems.length) {
    console.error("\n\u001b[31mCommit rejected ? Definition of Done not satisfied:\u001b[0m\n");
    for (const p of problems) console.error("  ? " + p.replace(/^STAGED0+\s*/, ""));
    console.error(`
This commit touches shipped code (apps/ or db/), so its message must carry the
Rule 16 evidence block. Put a BLANK LINE after the one-line subject, then:

  FINDING: ?
  LANE: ?
  DOD-A: ? through DOD-E: ?
  VERIFY-1: ? through VERIFY-8: ?
  MODULE_PROGRESS: <module> N of M
  ROOT CAUSE: the actual mechanism, not the symptom
  FIX:        what changed (root fix, not a patch)
  GUARD:      scripts/verify-*.mjs + scripts/verify-steps/NNNN-*.mjs
  LIVE PROOF: endpoint / health sha / DB row / browser ? or UNVERIFIED: <blocker>
  REMAINING:  what is still open (or "none")

Canonical standard: docs/specs/DEFINITION-OF-DONE.md
Bypassing with --no-verify does NOT skip this: CI verify-step 1324 enforces the
same rule on every branch commit and cannot be bypassed.
Pre-push also runs scripts/money-pr-local-gate.mjs (Rule 25).
`);
    if (isMoneyAppCommit(files) || files.some((f) => /^db\/migrations\//i.test(f))) {
      console.error(`
MONEY / MIGRATION PATH ? also required (DoD ?10 / Rules 23?25):

${MONEY_DOD_COMMIT_TEMPLATE}

CI: verify-steps 1430 (verify-no-money-theater) + 1431 (verify-module-completion) cannot be bypassed.
`);
    }
    process.exit(1);
  }

  process.exit(0);
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) main();
