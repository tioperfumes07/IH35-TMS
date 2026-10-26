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
 * function — not a copy) and WARNS on a miss, then opens the PR and squash-merges with the body as the commit
 * message. It never blocks a tested merge (owner fast 4-minute merge law).
 *
 * The branch must already be pushed (`git push --no-verify -u origin <head>`).
 * --selftest proves a bad body is refused and a good body is accepted, without touching GitHub.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assertClaudeGreenEvidenceShape } from "./verify-claude-green-evidence-shape.mjs";
import { checkNoRegressions } from "./lib/affected-guard-regressions.mjs";

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
// Owner law (fast 4-minute merge): tested + passing = merged. The evidence check WARNS, it never blocks a merge.
if (problems.length) {
  console.error(`${LABEL}: WARNING — title+body is not Claude-green (Rule 30); merging anyway (owner fast-merge law):`);
  for (const p of problems) console.error(`  - ${p}`);
}
// TESTED = every guard that reads a changed file passes (or was already red on main). A guard this branch
// broke is a regression: owner law "there should be no regressions" — the merge does not happen.
{
  const r = checkNoRegressions(process.cwd());
  const allowed = new Set(process.argv.flatMap((a, i) => (a === "--allow-delete" ? [process.argv[i + 1]] : [])));
  const undeclared = r.deleted.filter((f) => !allowed.has(f));
  if (undeclared.length) {
    console.error(`${LABEL}: NOT MERGED — this branch deletes ${undeclared.length} file(s) (additive-only law). If intended, pass --allow-delete <path> for each:`);
    for (const f of undeclared) console.error(`  - ${f}`);
    process.exit(1);
  }
  if (r.regressions.length) {
    console.error(`${LABEL}: NOT MERGED — ${r.regressions.length} regression(s): guard(s) that pass on main fail on this branch:`);
    for (const x of r.regressions) console.error(`  - ${x}`);
    console.error(`${LABEL}: fix the code (or a guard made stale by a correct refactor, with its selftest), then re-run.`);
    process.exit(1);
  }
  console.log(`${LABEL}: no regressions (${r.guards.length} affected guard(s) checked).`);
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
