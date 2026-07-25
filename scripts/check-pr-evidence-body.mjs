#!/usr/bin/env node
/**
 * GUARD: the Rule 16 evidence block must be in the PR BODY — the thing a reviewer actually reads,
 * and the thing that becomes the squash-merge message.
 *
 * WHY THIS EXISTS (the hole it closes):
 * `verify-definition-of-done-evidence.mjs` validates COMMITS via
 * `git rev-list $(git merge-base HEAD origin/main)..HEAD`. On `main` that range is EMPTY, so it
 * checks nothing post-merge; on a PR it checks the author's WIP commits — never the PR body or the
 * final squash message. docs/specs/DEFINITION-OF-DONE.md §3 says "required in every PR body", and
 * that sentence had no enforcement at all. Five per-entity catalog PRs (#3397/#3403/#3405/#3408/
 * #3409) merged with zero evidence-block sections in their bodies.
 *
 * Shares EVIDENCE_KEYS + proofLineIsSubstantiated with the commit guard so there is ONE definition
 * of the block and the two can never drift apart.
 *
 * Usage:  node scripts/check-pr-evidence-body.mjs --body-file <path> --files-file <path>
 *         node scripts/check-pr-evidence-body.mjs --selftest
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import { EVIDENCE_KEYS, proofLineIsSubstantiated } from "./verify-definition-of-done-evidence.mjs";

const LABEL = "check-pr-evidence-body";

/** Same scope rule as the commit guard: only PRs that ship app code must carry the block. */
export function isAppAffecting(files) {
  return files.some((f) => f.startsWith("apps/") || f.startsWith("db/"));
}

export function assertPrBodyEvidence(body, files) {
  const problems = [];
  if (!isAppAffecting(files)) return problems;

  const missing = EVIDENCE_KEYS.filter((k) => !k.re.test(body)).map((k) => k.key);
  if (missing.length) {
    problems.push(
      `PR body omits the Rule 16 evidence block section(s): ${missing.join(", ")}. ` +
        `Each must be its own labelled line (\`ROOT CAUSE:\` or \`### ROOT CAUSE\`). ` +
        `See docs/specs/PER-PR-CHECKLIST.md §3.`
    );
  } else if (!proofLineIsSubstantiated(body)) {
    problems.push(
      `PR body has a LIVE PROOF/UNVERIFIED section that names no artifact. Give a sha, endpoint, ` +
        `row count or screenshot path — or "UNVERIFIED: <named blocker>". The word "verified" alone ` +
        `is an assertion, not evidence. See docs/specs/PER-PR-CHECKLIST.md §3.`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const APP = ["apps/backend/src/x.ts"];
  const expect = (name, body, files, needle) => {
    const problems = assertPrBodyEvidence(body, files);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "no problems"})`);
    }
  };
  const refute = (name, body, files) => {
    const problems = assertPrBodyEvidence(body, files);
    if (problems.length) failures.push(`${name}: false positive — ${problems.join(" | ")}`);
  };

  // 1. Empty body on an app-affecting PR.
  expect("empty-body", "", APP, "omits the Rule 16 evidence block");

  // 2. THE REAL REGRESSION — the shape of the five merged per-entity catalog PR bodies: rich prose,
  //    the words "guard" and "verified" present, but no labelled block.
  expect(
    "prose-only-body",
    "## Owner ruling\nEach entity owns its rows. The shared guard covers the 8 tables and this was " +
      "verified on prod.\n## Migration\nadds operating_company_id and forces RLS.",
    APP,
    "omits the Rule 16 evidence block"
  );

  // 3. Block present but the proof is an assertion, not an artifact.
  expect(
    "proof-without-artifact",
    "ROOT CAUSE: y\nFIX: z\nGUARD: scripts/verify-x.mjs\nLIVE PROOF: verified\nREMAINING: none",
    APP,
    "names no artifact"
  );

  // 4. REMAINING omitted.
  expect(
    "missing-remaining",
    "ROOT CAUSE: y\nFIX: z\nGUARD: scripts/verify-x.mjs\nLIVE PROOF: healthz 2088757",
    APP,
    "REMAINING"
  );

  // Negatives — these must NOT be flagged.
  refute(
    "compliant-colon-form",
    "ROOT CAUSE: y\nFIX: z\nGUARD: scripts/verify-x.mjs\nLIVE PROOF: healthz sha 2088757\nREMAINING: none",
    APP
  );
  refute(
    "compliant-template-heading-form",
    "### ROOT CAUSE\nmechanism\n### FIX\nchange\n### GUARD\nscripts/verify-x.mjs\n" +
      "### LIVE PROOF\nhealthz sha 2088757\n### REMAINING\nnone",
    APP
  );
  refute(
    "honest-unverified",
    "ROOT CAUSE: y\nFIX: z\nGUARD: scripts/verify-x.mjs\n" +
      "UNVERIFIED: prod DB access is gated; owner must run the Neon check\nREMAINING: the live check",
    APP
  );
  refute("docs-only-pr-is-exempt", "just docs", ["docs/x.md"]);

  // ── PRE-FIX FIXTURES: the REAL PR bodies this guard exists because of ──────────────────────────
  // The five per-entity Lists PRs merged with no evidence block while the old keyword-anywhere
  // regexes went green. They are committed verbatim under scripts/__fixtures__/pr-bodies/ so the
  // guard is proven against real source, not a synthetic string. A selftest that only compares
  // literals declared inside the script proves nothing (DEFINITION-OF-DONE.md §4).
  const FIXTURE_DIR = new URL("./__fixtures__/pr-bodies/", import.meta.url);
  const readFixture = (n) => fs.readFileSync(new URL(`pr-${n}.md`, FIXTURE_DIR), "utf8");
  const NON_COMPLIANT = [3397, 3403, 3405, 3408, 3409];
  for (const n of NON_COMPLIANT) {
    const body = readFixture(n);
    if (!/\S/.test(body)) {
      failures.push(`fixture pr-${n}.md is empty — an empty fixture proves nothing, re-capture it`);
      continue;
    }
    const problems = assertPrBodyEvidence(body, APP);
    if (!problems.length) {
      failures.push(`PRE-FIX FIXTURE #${n}: the tightened guard did NOT reject this real non-compliant PR body`);
    }
  }
  // And it must PASS on a real compliant PR body from the same day/module.
  const compliant = readFixture(3387);
  const compliantProblems = assertPrBodyEvidence(compliant, APP);
  if (compliantProblems.length) {
    failures.push(`PRE-FIX FIXTURE #3387 (compliant) was wrongly rejected: ${compliantProblems.join(" | ")}`);
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — 4 planted defects + 5 real pre-fix PR bodies (#3397/#3403/#3405/#3408/#3409) ` +
      `rejected; real compliant body #3387, heading-form, UNVERIFIED and docs-only not flagged`
  );
  process.exit(0);
}

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};

/**
 * The PR BODY is the gate. Resolution order, and the SOURCE IS ALWAYS PRINTED so a silent fallback
 * can never be mistaken for a real check:
 *   1. $GITHUB_EVENT_PATH -> .pull_request.body   (authoritative in CI)
 *   2. --body-file                                 (explicit path)
 *   3. commit message                              (LOCAL ONLY — announced as a weaker check)
 */
function resolveBody(bodyFile) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    try {
      const ev = JSON.parse(fs.readFileSync(eventPath, "utf8"));
      if (typeof ev?.pull_request?.body === "string") {
        return { body: ev.pull_request.body, source: "PR body (GITHUB_EVENT_PATH .pull_request.body)" };
      }
    } catch {
      /* fall through to the next source */
    }
  }
  if (bodyFile && fs.existsSync(bodyFile)) {
    return { body: fs.readFileSync(bodyFile, "utf8"), source: `PR body (--body-file ${bodyFile})` };
  }
  try {
    const msg = execSync("git log -1 --format=%B", { encoding: "utf8" });
    return {
      body: msg,
      source: "COMMIT MESSAGE fallback — no PR context available; this is the weaker local check, not the CI gate",
    };
  } catch {
    return { body: "", source: "no source available" };
  }
}

const bodyFile = arg("--body-file");
const filesFile = arg("--files-file");
if (!filesFile) {
  console.error(`${LABEL}: usage --files-file <path> [--body-file <path>] [--selftest]`);
  process.exit(2);
}
const resolved = resolveBody(bodyFile);
console.log(`${LABEL}: evidence source = ${resolved.source}`);
const body = resolved.body;
const files = fs.existsSync(filesFile)
  ? fs.readFileSync(filesFile, "utf8").split(/\r?\n/).filter(Boolean)
  : [];

const problems = assertPrBodyEvidence(body, files);
if (problems.length) {
  console.error(`${LABEL} FAILED — the PR body is not reviewable:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — PR body carries the Rule 16 evidence block with a named proof artifact`);
