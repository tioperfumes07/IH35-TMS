#!/usr/bin/env node
/**
 * ci-dependabot-reaper.mjs — CI-F24. Clear dependency chores automatically, and keep them clear.
 *
 * THE PROBLEM THIS SOLVES, stated as what actually happened. Dependency PRs were opened weekly and
 * merged by nobody. Eight accumulated. While they sat they went stale, each one's package-lock.json
 * drifted from main and from the other seven, so they conflicted with each other, and every one of them
 * still failed a gate that could not be satisfied (CI-F21: our DoD guard demanded a Rule 16 evidence
 * block Dependabot cannot write). Two of the eight were the npm_and_yarn SECURITY group — supply-chain
 * patches held out of production for weeks by a paperwork rule and an empty merge queue.
 *
 * Fixing CI-F21 made them mergeable. It did not make them MERGE. Without something that closes them,
 * the pile rebuilds the following Monday and every argument here applies again. That is what makes this
 * the permanent fix rather than another cleanup.
 *
 * WHY A SCHEDULED REAPER AND NOT `gh pr merge --auto`. GitHub's native auto-merge is enabled on the repo
 * but does not fire against this repo's rulesets (community discussion #190610) — the same reason the
 * merge role drives merges through the API directly. Rather than depend on a feature known not to work
 * here, this polls and merges through the merge API on exactly the same terms a human would.
 *
 * IT CANNOT BYPASS ANYTHING, and that is the point. Every one of these must hold or the PR is skipped
 * and left for a human:
 *   1. author is dependabot[bot] — nothing else is ever touched
 *   2. the bump is PATCH or MINOR. A MAJOR is a breaking change and stays for a person: plaid 43->45
 *      and bullmq 5->6 are open right now and this will not touch them
 *   3. all four REQUIRED checks are SUCCESS on the PR's CURRENT head sha — not "not failing", not a
 *      stale green from an earlier commit
 *   4. GitHub reports the PR mergeable (no conflicts)
 * There is no --admin, no ruleset bypass, no force. If a required check is missing or pending, that is a
 * skip, never a merge. A reaper that can merge a red PR is a worse problem than the pile it clears.
 *
 * Run: node scripts/ci-dependabot-reaper.mjs [--dry-run]   (needs gh CLI authenticated)
 */
import { execFileSync } from "node:child_process";

const LABEL = "ci-dependabot-reaper";
const REPO = process.env.REAPER_REPO ?? "tioperfumes07/IH35-TMS";
const DRY = process.argv.includes("--dry-run");

/** The four contexts the ruleset actually requires. Kept in sync with repos/.../rulesets. */
export const REQUIRED_CHECKS = ["hold-merge-gate", "required-checks-gate", "build-typecheck", "locked-guards"];

/**
 * Classify a Dependabot title as major / minor / patch.
 * Titles look like: "chore(deps): bump fast-uri from 3.1.4 to 3.1.5"
 * Group PRs ("bump the production-dependencies group with 13 updates") carry no version pair; Dependabot
 * only groups minor+patch in this repo's config, so a group PR is treated as non-major — but ONLY when
 * the title actually says "group", never as a fallback for an unparseable title.
 */
export function classifyBump(title) {
  const m = /bump\s+\S+\s+from\s+v?(\d+)\.\S*\s+to\s+v?(\d+)\./i.exec(title ?? "");
  if (m) return Number(m[1]) === Number(m[2]) ? "minor_or_patch" : "major";
  if (/\bgroup\b/i.test(title ?? "")) return "minor_or_patch";
  return "unknown";
}

/** Decide, from already-fetched facts. Pure, so the selftest exercises the real rule. */
/**
 * Dependabot's login differs by API surface and getting this wrong makes the reaper silently do
 * NOTHING: the gh CLI (GraphQL) reports "app/dependabot" while the REST API reports "dependabot[bot]".
 * Found by dry-running against the eight real chore PRs, which returned "no open dependabot PRs" while
 * all eight were sitting right there. Both exact values are accepted; nothing else ever is.
 */
export const DEPENDABOT_LOGINS = new Set(["dependabot[bot]", "app/dependabot"]);

export function decide(pr) {
  if (!DEPENDABOT_LOGINS.has(pr.author)) return { merge: false, reason: "not a dependabot PR" };
  const bump = classifyBump(pr.title);
  if (bump === "major") return { merge: false, reason: "MAJOR bump — a breaking change is a human decision" };
  if (bump === "unknown") return { merge: false, reason: "could not classify bump from title — leaving for a human" };
  if (pr.mergeable === false) return { merge: false, reason: "CONFLICTING — needs a rebase" };

  const byName = new Map((pr.checks ?? []).map((c) => [c.name, c.conclusion]));
  const missing = REQUIRED_CHECKS.filter((c) => byName.get(c) !== "SUCCESS");
  if (missing.length) return { merge: false, reason: `required check(s) not green: ${missing.join(", ")}` };

  return { merge: true, reason: "patch/minor, all four required checks green on head sha" };
}

const gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

function fetchOpenDependabotPrs() {
  const raw = gh([
    "pr", "list", "--repo", REPO, "--state", "open", "--limit", "50",
    "--json", "number,title,author,mergeable,headRefOid,statusCheckRollup",
  ]);
  return JSON.parse(raw)
    .filter((p) => DEPENDABOT_LOGINS.has(p.author?.login))
    .map((p) => ({
      number: p.number,
      title: p.title,
      author: p.author?.login,
      mergeable: p.mergeable === "MERGEABLE" ? true : p.mergeable === "CONFLICTING" ? false : null,
      checks: (p.statusCheckRollup ?? []).map((c) => ({
        name: c.name ?? c.context,
        conclusion: c.conclusion ?? c.state ?? null,
      })),
    }));
}

function main() {
  let prs;
  try {
    prs = fetchOpenDependabotPrs();
  } catch (err) {
    console.error(`${LABEL}: could not list PRs (${err.message}) — doing nothing`);
    return 0; // never fail a build because the reaper could not look
  }
  if (!prs.length) {
    console.log(`${LABEL}: no open dependabot PRs`);
    return 0;
  }

  let merged = 0;
  for (const pr of prs) {
    const { merge, reason } = decide(pr);
    if (!merge) {
      console.log(`  SKIP  #${pr.number} — ${reason}`);
      // CLOSE THE LOOP. A conflicting bump never becomes mergeable on its own: it sits, drifts
      // further from main, and is still conflicting next run — which is precisely how eight of these
      // accumulated. Dependabot rebases itself on request, so ask. Only for conflicts, and only for
      // bumps we would otherwise have merged (never a MAJOR — a human must own that rebase and the
      // breaking-change review that goes with it).
      if (pr.mergeable === false && classifyBump(pr.title) === "minor_or_patch") {
        if (DRY) {
          console.log(`        would request: @dependabot rebase`);
        } else {
          try {
            gh(["pr", "comment", String(pr.number), "--repo", REPO, "--body", "@dependabot rebase"]);
            console.log(`        requested rebase`);
          } catch {
            console.log(`        rebase request failed — leaving as-is`);
          }
        }
      }
      continue;
    }
    if (DRY) {
      console.log(`  WOULD MERGE #${pr.number} — ${reason}`);
      continue;
    }
    try {
      gh(["pr", "merge", String(pr.number), "--repo", REPO, "--squash", "--delete-branch"]);
      console.log(`  MERGED #${pr.number} — ${pr.title}`);
      merged += 1;
    } catch (err) {
      console.log(`  SKIP  #${pr.number} — merge refused: ${String(err.message).split("\n")[0]}`);
    }
  }
  console.log(`${LABEL}: ${merged} merged, ${prs.length - merged} left for a human`);
  return 0;
}

function selftest() {
  const green = REQUIRED_CHECKS.map((n) => ({ name: n, conclusion: "SUCCESS" }));
  const base = { author: "dependabot[bot]", mergeable: true, checks: green };
  const cases = [
    ["patch bump, all green", { ...base, title: "chore(deps): bump fast-uri from 3.1.4 to 3.1.5" }, true],
    ["minor bump, all green", { ...base, title: "chore(deps): bump ip-address from 10.2.0 to 10.4.0" }, true],
    ["group bump, all green", { ...base, title: "chore(deps): bump the production-dependencies group with 13 updates" }, true],
    ["MAJOR bump", { ...base, title: "chore(deps): bump plaid from 43.0.0 to 45.0.0" }, false],
    ["MAJOR bullmq", { ...base, title: "chore(deps): bump bullmq from 5.81.2 to 6.0.6" }, false],
    ["conflicting", { ...base, title: "chore(deps): bump x from 1.0.0 to 1.0.1", mergeable: false }, false],
    ["a required check failing", {
      ...base, title: "chore(deps): bump x from 1.0.0 to 1.0.1",
      checks: green.map((c) => (c.name === "build-typecheck" ? { ...c, conclusion: "FAILURE" } : c)),
    }, false],
    ["a required check pending", {
      ...base, title: "chore(deps): bump x from 1.0.0 to 1.0.1",
      checks: green.filter((c) => c.name !== "locked-guards"),
    }, false],
    ["CodeQL red but required all green", {
      ...base, title: "chore(deps): bump x from 1.0.0 to 1.0.1",
      checks: [...green, { name: "CodeQL", conclusion: "FAILURE" }],
    }, true],
    ["gh CLI login form", { ...base, author: "app/dependabot", title: "chore(deps): bump x from 1.0.0 to 1.0.1" }, true],
    ["not dependabot", { ...base, author: "someone", title: "chore(deps): bump x from 1.0.0 to 1.0.1" }, false],
    ["unparseable title", { ...base, title: "chore(deps): update stuff" }, false],
  ];
  const failures = [];
  for (const [name, pr, want] of cases) {
    const got = decide(pr).merge;
    if (got !== want) failures.push(`${name}: expected merge=${want}, got ${got} (${decide(pr).reason})`);
  }
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} SELFTEST FAIL — ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} cases: majors refused, reds refused, pendings refused, non-required reds ignored`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? selftest() : main());
}
