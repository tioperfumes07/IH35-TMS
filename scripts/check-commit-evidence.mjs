#!/usr/bin/env node
/**
 * commit-msg hook: enforce the Definition of Done evidence block AT COMMIT TIME.
 *
 * This is the fast local half of the same rule CI enforces in
 * scripts/verify-definition-of-done-evidence.mjs (verify-step 1324). It deliberately IMPORTS that
 * file's assertion instead of re-implementing it, so the local hook and the CI gate can never drift
 * apart ù a second copy of a rule is a rule that will disagree with itself.
 *
 * Money paths ALSO run assertNoMoneyTheater (DoD ß10 / verify-step 1430) ó FINDING + LANE +
 * DOD-A..E + VERIFY-1..8 + Rule 16 required or the commit is rejected.
 *
 * HONEST LIMIT: `git commit --no-verify` skips this hook. CI verify-steps 1324 + 1430 cannot be
 * bypassed. verify-step 1324 asserts this hook still exists.
 *
 * Exit 0 = allowed. Exit 1 = commit rejected with the template printed.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { assertDoDEvidence } from "./verify-definition-of-done-evidence.mjs";
import {
  assertNoMoneyTheater,
  isMoneyAppCommit,
  MONEY_DOD_COMMIT_TEMPLATE,
} from "./verify-no-money-theater.mjs";

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

const [subject = "", ...rest] = message.split("\n");
const body = rest.join("\n");

if (/^(Merge|Revert|fixup!|squash!)\b/i.test(subject.trim())) process.exit(0);

let files = [];
try {
  files = execSync("git diff --cached --name-only", { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
} catch {
  process.exit(0);
}
if (files.length === 0) process.exit(0);

const staged = [{ sha: "STAGED".padEnd(40, "0"), subject, body, files }];
const problems = assertDoDEvidence(staged);
if (isMoneyAppCommit(files)) {
  for (const p of assertNoMoneyTheater(staged)) problems.push(p);
}

if (problems.length) {
  console.error("\n\u001b[31mCommit rejected ù Definition of Done not satisfied:\u001b[0m\n");
  for (const p of problems) console.error("  ù " + p.replace(/^STAGED0+\s*/, ""));
  console.error(`
This commit touches shipped code (apps/ or db/), so its message must carry the
Rule 16 evidence block. Template:

  <type>(<scope>): <what changed>

  ROOT CAUSE: the actual mechanism, not the symptom
  FIX:        what changed, and why this is the root fix rather than a patch
  GUARD:      scripts/verify-*.mjs + scripts/verify-steps/NNNN-*.mjs
  LIVE PROOF: endpoint / health sha / DB row / browser ù or UNVERIFIED + blocker
  REMAINING:  what is still open

Canonical standard: docs/specs/DEFINITION-OF-DONE.md
Bypassing with --no-verify does NOT skip this: CI verify-step 1324 enforces the
same rule on every branch commit and cannot be bypassed.
`);
  if (isMoneyAppCommit(files)) {
    console.error(`
MONEY PATH (accounting / banking / qbo-sync) ù also required (DoD ù10 / Rule 23):

${MONEY_DOD_COMMIT_TEMPLATE}

CI: verify-step 1430 (verify-no-money-theater) cannot be bypassed.
`);
  }
  process.exit(1);
}

process.exit(0);
