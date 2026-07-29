#!/usr/bin/env node
/**
 * Selftest for verify-branch-fresh's overlap rule.
 *
 * This gate is REQUIRED on main, so getting it wrong is worse than the problem it solves: too strict
 * and every PR needs a pointless rebase (the state this replaced — N open PRs cost N^2 full CI
 * rebuilds); too loose and CI validates a combination that will never exist in production.
 *
 * So it is tested against REAL git repositories built on disk, not mocks. Four cases, each of which
 * has actually happened in this repo:
 *
 *   1. behind + NO overlap        -> PASS  (the case that was costing hours)
 *   2. behind + SAME FILE changed -> FAIL  (genuinely stale; CI tested a combination that won't ship)
 *   3. behind + both add MIGRATIONS -> FAIL (different files, same global number space — this is the
 *                                     duplicate-migration-number collision that hit twice in one night)
 *   4. behind + both add VERIFY-STEPS -> FAIL (same, for verify-step number allocation)
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitChildEnv } from "./trusted-git-environment.mjs";

const SCRIPT = new URL("./verify-branch-fresh.mjs", import.meta.url).pathname;

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, env: gitChildEnv(), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

function write(cwd, rel, body) {
  const full = join(cwd, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body, "utf8");
}

/**
 * Build a repo where `main` advanced with `mainFiles` and a feature branch changed `branchFiles`,
 * both from a common base. Returns the base sha the gate should be told about.
 */
function buildRepo(mainFiles, branchFiles) {
  const dir = mkdtempSync(join(tmpdir(), "branch-fresh-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "selftest@local"]);
  git(dir, ["config", "user.name", "selftest"]);

  write(dir, "seed.txt", "seed\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "base"]);
  const base = git(dir, ["rev-parse", "HEAD"]);

  git(dir, ["checkout", "-q", "-b", "feature"]);
  for (const f of branchFiles) write(dir, f, "branch change\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "branch work"]);

  git(dir, ["checkout", "-q", "main"]);
  for (const f of mainFiles) write(dir, f, "main change\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "main moved"]);

  // The gate fetches origin/main and compares against it; point origin at this repo itself.
  git(dir, ["remote", "add", "origin", dir]);
  git(dir, ["fetch", "-q", "origin", "main"]);
  git(dir, ["checkout", "-q", "feature"]);
  return { dir, base };
}

function runGate(dir, base) {
  const r = spawnSync("node", [SCRIPT, "--base-sha", base], {
    cwd: dir,
    encoding: "utf8",
    // Scrubbed too: the gate under test shells out to git, so an inherited GIT_DIR would make it
    // grade the repo being pushed instead of the fixture and the arms would prove nothing.
    env: { ...gitChildEnv(), GITHUB_BASE_SHA: base },
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

const CASES = [
  {
    name: "behind but NO overlap -> PASS (unrelated PRs must not block each other)",
    main: ["docs/unrelated.md"],
    branch: ["apps/frontend/src/pages/safety/Thing.tsx"],
    expect: 0,
    expectText: /NO overlap/,
  },
  {
    name: "behind and the SAME FILE changed -> FAIL (genuinely stale)",
    main: ["apps/frontend/src/shared/Widget.tsx"],
    branch: ["apps/frontend/src/shared/Widget.tsx"],
    expect: 1,
    expectText: /this branch also changes/,
  },
  {
    name: "behind and BOTH add migrations -> FAIL (duplicate migration number race)",
    main: ["db/migrations/202610060000_other_lane.sql"],
    branch: ["db/migrations/202610060000_my_lane.sql"],
    expect: 1,
    expectText: /db\/migrations\//,
  },
  {
    name: "behind and BOTH add verify-steps -> FAIL (duplicate step number race)",
    main: ["scripts/verify-steps/1665-other.mjs"],
    branch: ["scripts/verify-steps/1665-mine.mjs"],
    expect: 1,
    expectText: /verify-steps/,
  },
];

let failures = 0;
for (const c of CASES) {
  const { dir, base } = buildRepo(c.main, c.branch);
  try {
    const { code, out } = runGate(dir, base);
    const okCode = code === c.expect;
    const okText = c.expectText.test(out);
    if (okCode && okText) {
      console.log(`  ok: ${c.name}`);
    } else {
      failures += 1;
      console.error(`  FAIL: ${c.name}\n    expected exit ${c.expect}, got ${code}\n    output: ${out.trim()}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// REGRESSION ARM (measured 2026-07-28): this file runs inside `.husky/pre-push`, which git invokes
// with GIT_DIR exported, and git's env outranks `cwd:`. Unscrubbed, buildRepo() aimed `git add -A`
// at the repo being pushed while pointed at an empty temp dir, staged the deletion of all 12,011
// tracked files and committed it over the branch. Proves the scrub, not just the four cases above.
{
  const victim = mkdtempSync(join(tmpdir(), "branch-fresh-victim-"));
  const savedGitDir = process.env.GIT_DIR;
  try {
    git(victim, ["init", "-q", "-b", "main"]);
    git(victim, ["config", "user.email", "victim@local"]);
    git(victim, ["config", "user.name", "victim"]);
    write(victim, "keep.txt", "keep\n");
    git(victim, ["add", "."]);
    git(victim, ["commit", "-qm", "victim seed"]);
    const trackedCount = () => git(victim, ["ls-files"]).split("\n").filter(Boolean).length;
    const before = trackedCount();

    process.env.GIT_DIR = join(victim, ".git");
    const { dir } = buildRepo(["a.txt"], ["b.txt"]);
    rmSync(dir, { recursive: true, force: true });

    const after = trackedCount();
    if (after === before) {
      console.log("  ok: fixture build under an exported GIT_DIR leaves the surrounding repo untouched");
    } else {
      failures += 1;
      console.error(
        `  FAIL: fixture build under an exported GIT_DIR rewrote the unrelated repo at ${victim}\n` +
          `    tracked files went ${before} -> ${after}; child git calls must run with the ` +
          `repository-local variables stripped (scripts/trusted-git-environment.mjs gitChildEnv)`
      );
    }
  } finally {
    if (savedGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = savedGitDir;
    rmSync(victim, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`verify-branch-fresh selftest FAILED — ${failures} case(s) wrong.`);
  process.exit(1);
}
console.log(`verify-branch-fresh selftest PASS — ${CASES.length} overlap cases + fixture isolation, on real git repos.`);
