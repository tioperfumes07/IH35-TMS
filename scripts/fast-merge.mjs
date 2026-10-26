#!/usr/bin/env node
/**
 * Fast 4-minute merge (owner law) — the ONE merge command for every seat.
 *
 *   node scripts/fast-merge.mjs --branch <head> --title "<title>" --body-file <path>
 *
 * Why this exists: seats squash-merged through `gh api .../merge` with no commit_message, so the commit that
 * lands on main carried only the PR title. verify-claude-green-evidence-shape reads the TIP commit of main
 * for the Rule 30 block (ROOT CAUSE / FIX / GUARD / REMAINING + LIVE PROOF: or UNVERIFIED:) and went red on
 * every fast merge. This script refuses a body that fails that same check (the guard's own exported
 * function — not a copy), then opens the PR and squash-merges with the body as the commit message, so the
 * evidence that reviewed the change is the evidence on main.
 *
 * The branch must already be pushed (`git push --no-verify -u origin <head>`).
 * --selftest proves a bad body is refused and a good body is accepted, without touching GitHub.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assertClaudeGreenEvidenceShape } from "./verify-claude-green-evidence-shape.mjs";

const LABEL = "fast-merge";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** The exact message that lands on main: squash title line, blank line, body. Judged whole. */
export function landedMessage(title, body, number = "N") {
  return `${title} (#${number})\n\n${body}`;
}
export function bodyProblems(body, title = "FINDING: selftest") {
  return assertClaudeGreenEvidenceShape(landedMessage(title, body));
}

function gh(args) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    console.error(`${LABEL}: gh ${args[0]} ${args[1] ?? ""} failed — ${String(e.stdout || e.stderr || e.message).trim()}`);
    console.error(`${LABEL}: is the branch pushed (git push --no-verify -u origin <branch>)?`);
    process.exit(1);
  }
}

function selftest() {
  const good = [
    "ROOT CAUSE: x",
    "FIX: y",
    "GUARD: node scripts/verify-x.mjs PASS",
    "REMAINING: none",
    "LIVE PROOF: node scripts/verify-x.mjs --selftest exit 0",
  ].join("\n");
  const cases = [
    ["Rule 30 body accepted", bodyProblems(good).length === 0],
    ["body without ROOT CAUSE refused", bodyProblems(good.replace("ROOT CAUSE: x\n", "")).length > 0],
    ["body without LIVE PROOF/UNVERIFIED refused", bodyProblems(good.replace(/LIVE PROOF:.*$/m, "")).length > 0],
    ["bare UNVERIFIED theater refused", bodyProblems(good.replace(/LIVE PROOF:.*$/m, "LIVE PROOF: UNVERIFIED browser")).length > 0],
    ["empty body refused", bodyProblems("").length > 0],
    ["title not FINDING-first refused", bodyProblems(good, "fix: something").length > 0],
  ];
  let ok = 0;
  for (const [name, pass] of cases) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
    if (pass) ok += 1;
  }
  console.log(`${LABEL} SELFTEST ${ok === cases.length ? "OK" : "FAIL"} (${ok}/${cases.length})`);
  process.exit(ok === cases.length ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();

const branch = arg("--branch");
const title = arg("--title");
const bodyFile = arg("--body-file");
if (!branch || !title || !bodyFile) {
  console.error(`${LABEL}: usage: node scripts/fast-merge.mjs --branch <head> --title "<title>" --body-file <path>`);
  process.exit(2);
}
const body = readFileSync(bodyFile, "utf8");
const problems = bodyProblems(body, title);
if (problems.length) {
  console.error(`${LABEL}: REFUSED — title+body is not Claude-green (Rule 30; title must start with FINDING:). Fix the text, not the guard:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const repo = gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
const number = gh(["api", `repos/${repo}/pulls`, "-X", "POST", "-f", `head=${branch}`, "-f", "base=main", "-f", `title=${title}`, "-f", `body=${body}`, "-q", ".number"]);
const merged = gh([
  "api", `repos/${repo}/pulls/${number}/merge`, "-X", "PUT",
  "-f", "merge_method=squash",
  "-f", `commit_title=${title} (#${number})`,
  "-f", `commit_message=${body}`,
  "-q", ".merged",
]);
console.log(`${LABEL}: PR #${number} merged=${merged}`);
process.exit(merged === "true" ? 0 : 1);
