#!/usr/bin/env node
/**
 * commit-msg hook: enforce the Definition of Done evidence block AT COMMIT TIME.
 *
 * This is the fast local half of the same rule CI enforces in
 * scripts/verify-definition-of-done-evidence.mjs (verify-step 1324). It deliberately IMPORTS that
 * file's assertion instead of re-implementing it, so the local hook and the CI gate can never drift
 * apart — a second copy of a rule is a rule that will disagree with itself.
 *
 * HONEST LIMIT: `git commit --no-verify` skips this hook, and this repo routinely uses --no-verify
 * because the pre-commit hook runs a root tsc that fails on deps not installed here. So this hook is
 * EARLY FEEDBACK, not the gate. The gate is CI step 1324, which cannot be bypassed. verify-step 1324
 * additionally asserts this hook still exists, so deleting it fails CI.
 *
 * Exit 0 = allowed. Exit 1 = commit rejected with the template printed.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { assertDoDEvidence } from "./verify-definition-of-done-evidence.mjs";

const msgFile = process.argv[2];
if (!msgFile) process.exit(0); // not invoked as a hook — nothing to check

let raw = "";
try {
  raw = fs.readFileSync(msgFile, "utf8");
} catch {
  process.exit(0);
}

// Strip comment lines git adds to the template.
const message = raw
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join("\n")
  .trim();

const [subject = "", ...rest] = message.split("\n");
const body = rest.join("\n");

// Merge / revert / fixup / squash commits carry no defect of their own.
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

const problems = assertDoDEvidence([{ sha: "STAGED".padEnd(40, "0"), subject, body, files }]);

if (problems.length) {
  console.error("\n[31mCommit rejected — Definition of Done not satisfied:[0m\n");
  for (const p of problems) console.error("  • " + p.replace(/^STAGED0+\s*/, ""));
  console.error(`
This commit touches shipped code (apps/ or db/), so its message must carry the
Rule 16 evidence block. Template:

  <type>(<scope>): <what changed>

  ROOT CAUSE: the actual mechanism, not the symptom
  FIX:        what changed, and why this is the root fix rather than a patch
  GUARD:      scripts/verify-*.mjs + scripts/verify-steps/NNNN-*.mjs
  LIVE PROOF: endpoint / health sha / DB row / browser — or UNVERIFIED + blocker
  REMAINING:  what is still open

Canonical standard: docs/specs/DEFINITION-OF-DONE.md
Bypassing with --no-verify does NOT skip this: CI verify-step 1324 enforces the
same rule on every branch commit and cannot be bypassed.
`);
  process.exit(1);
}

process.exit(0);
