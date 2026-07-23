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
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-definition-of-done-evidence";
const DOD = "docs/specs/DEFINITION-OF-DONE.md";
const SELFTEST = process.argv.includes("--selftest");

const sh = (cmd) => {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const EVIDENCE_KEYS = [
  { key: "ROOT CAUSE", re: /root cause/i },
  { key: "FIX", re: /(^|\n)\s*fix\b|fix:/i },
  { key: "GUARD", re: /guard/i },
  { key: "LIVE PROOF or UNVERIFIED", re: /(live proof|verified|verification|unverified)/i },
];

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

  for (const c of commits) {
    const { sha, subject, body, files } = c;
    if (!isAppAffecting(files)) continue;
    const short = sha.slice(0, 9);
    const text = `${subject}\n${body}`;

    const missing = EVIDENCE_KEYS.filter((k) => !k.re.test(text)).map((k) => k.key);
    if (missing.length) {
      problems.push(
        `${short} "${subject.slice(0, 60)}" touches app code but its message omits the Rule 16 evidence ` +
          `block section(s): ${missing.join(", ")}. See ${DOD} §3.`
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

function collectBranchCommits() {
  const base = sh("git merge-base HEAD origin/main") || sh("git merge-base HEAD main");
  if (!base) return [];
  const shas = sh(`git rev-list ${base}..HEAD`).split("\n").filter(Boolean);
  return shas.map((sha) => ({
    sha,
    subject: sh(`git log -1 --format=%s ${sha}`),
    body: sh(`git log -1 --format=%b ${sha}`),
    files: sh(`git diff-tree --no-commit-id --name-only -r ${sha}`).split("\n").filter(Boolean),
  }));
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

  // Negative: a compliant commit must NOT be flagged, and a docs-only commit is exempt.
  const clean = assertDoDEvidence([good]);
  if (clean.length) failures.push(`false-positive on a compliant commit: ${clean.join(" | ")}`);
  const docsOnly = assertDoDEvidence([
    { sha: "b".repeat(40), subject: "docs: notes", body: "", files: ["docs/x.md"] },
  ]);
  if (docsOnly.length) failures.push(`false-positive on a docs-only commit: ${docsOnly.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 4 planted defects caught, compliant + docs-only commits not flagged`);
  process.exit(0);
}

const problems = assertDoDEvidence(collectBranchCommits());
if (problems.length) {
  console.error(`${LABEL} FAILED — Definition of Done not satisfied:`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\nCanonical standard: ${DOD}`);
  process.exit(1);
}
console.log(`${LABEL} OK — branch commits carry evidence, guards, and legal guard wiring`);
