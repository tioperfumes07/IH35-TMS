#!/usr/bin/env node
/**
 * GUARD — verify-root-claude-md-untracked
 *
 * GOV-F01 (docs/audit/GUARD-WORKORDERS.md): root CLAUDE.md was tracked in this PUBLIC repo
 * (commit 01648d102 / PR #4551) and disclosed prod infrastructure identifiers (Neon project
 * id, prod branch, operating_company_id, a sibling checkout path holding a real DATABASE_URL)
 * that the documented secrets-split deliberately keeps git-excluded. It was untracked again in
 * commit f5cdf067a (PR #5528) and root CLAUDE.md is back in .gitignore.
 *
 * This is a SHRINK-ONLY ratchet: root CLAUDE.md must never be tracked again. It does not (and
 * cannot) remove the old disclosure from PUBLIC git history — that needs an owner-approved
 * history rewrite + identifier rotation, which is destructive/outward-facing and out of scope
 * for an autonomous guard. This guard only stops the regression of re-tracking the file.
 *
 * METHOD: `git ls-files` on HEAD (works in CI without a checkout of full history) plus a
 * `.gitignore` pattern check. --selftest proves both a re-tracked file and a missing ignore
 * entry are caught.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";

const LABEL = "verify-root-claude-md-untracked";

function isTracked(cwd, env = process.env) {
  try {
    const out = execFileSync("git", ["ls-files", "--error-unmatch", "CLAUDE.md"], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.toString().trim().length > 0;
  } catch {
    return false; // ls-files --error-unmatch exits non-zero when the path is not tracked
  }
}

function gitignoreExcludesRoot(cwd) {
  const text = readFileSync(`${cwd}/.gitignore`, "utf8");
  return text.split("\n").some((line) => line.trim() === "CLAUDE.md");
}

function run(cwd = process.cwd(), env = process.env) {
  const tracked = isTracked(cwd, env);
  if (tracked) {
    return {
      ok: false,
      message:
        `${LABEL} FAILED — root CLAUDE.md is tracked in git again (GOV-F01 regression). ` +
        `This repo is PUBLIC; the prior disclosure (commit 01648d102 / PR #4551) is the exact ` +
        `failure this guard exists to stop. git rm --cached CLAUDE.md and keep it in .gitignore.`,
    };
  }
  if (!gitignoreExcludesRoot(cwd)) {
    return {
      ok: false,
      message: `${LABEL} FAILED — root CLAUDE.md is untracked but no longer listed in .gitignore; add it back.`,
    };
  }
  return {
    ok: true,
    message: `${LABEL} OK — root CLAUDE.md is untracked and excluded via .gitignore (GOV-F01 working-tree fix holds). Public git history from PR #4551 still contains the old disclosure; that removal needs an owner-approved history rewrite + identifier rotation and is out of scope for this guard.`,
  };
}

// GUARD-SELFTEST-MUTATES-SOURCE hardening (2026-09-01): this selftest already used a temp git
// repo (`git init tmp`, `git -C tmp ...`), never touching THIS repo's own tracked files — but
// live tonight, under heavy concurrent verify-sweep load, its "init" commit repeatedly landed in
// the INVOKING repo's own history instead (author "t <t@t.com>", always the same one-line
// .gitignore-truncating diff — hit at least 4 times across 3 different branches this session).
// `-C tmp` changes the working directory git resolves paths against, but does not stop git from
// honoring ambient GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE env vars if anything in a concurrently-
// running process tree ever sets them; `-C` alone is directory-scoped isolation, not env-scoped
// isolation. Every git call below now pins GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE explicitly to the
// temp repo (env-scoped isolation, on top of the existing directory-scoped -C), which is the
// stronger guarantee — a concurrently-set ambient git env var can no longer redirect these calls
// to the real repo, however that ambient value got set.
function gitEnv(tmp) {
  return {
    ...process.env,
    GIT_DIR: `${tmp}/.git`,
    GIT_WORK_TREE: tmp,
    GIT_INDEX_FILE: `${tmp}/.git/index`,
  };
}

// ACTUAL ROOT CAUSE, FOUND 2026-09-11 (supersedes the "transient noise" retry-wrapper mitigation
// below, which was a real improvement but treated a symptom): the crash was NEVER transient or
// load-related. `git` itself sets GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE in the environment of every
// subprocess a git hook spawns (pre-push, pre-commit, ...), pointed at the REAL invoking repo. The
// very first call below — `git init -q tmp` — was still passing raw `process.env`, so when this
// guard runs from inside a real pre-push hook (its actual, universal call site — see
// husky/pre-push -> verify:local-ci -> branch-precheck-push.mjs -> verify-static), that ambient
// GIT_DIR silently redirects `git init`'s bookkeeping away from the fresh `tmp` path, so `tmp/.git`
// is never actually created. Every subsequent call then fails with "fatal: not a git repository:
// '<tmp>/.git'" — 100% reproducible, not probabilistic, confirmed by exporting
// GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE ahead of a standalone `--selftest` run (4/4 attempts failed
// identically) and by the crash's total absence when run without those ambient vars set (multiple
// clean passes). The retry loop below "worked" only when the guard happened to run outside a hook
// (isolation, CI's own `npm run verify:...` step) and did nothing when it ran inside one — which is
// exactly backwards from a real hook-context guard. Fix: `bootstrapEnv()` strips the three ambient
// vars (plus GIT_CEILING_DIRECTORIES, which can equally redirect `git init`) before the `init` call,
// so it is never influenced by whatever repo context invoked this script.
function bootstrapEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_CEILING_DIRECTORIES;
  return env;
}

// TRANSIENT-GIT-ENV-RACE hardening (2026-09-11, retained as defense-in-depth): kept as a safety
// net for genuine transient noise (disk/CPU contention), even though the actual crash this comment
// originally described was the deterministic ambient-GIT_DIR bug fixed above, not load. Retry the
// whole bootstrap+assertions a few times with a fresh temp dir each attempt before actually
// failing — this does not change what isTracked()/gitignoreExcludesRoot()/run() check, or weaken
// the guard's real-repo behavior below.
function attemptSelftest() {
  const tmp = `/tmp/verify-root-claude-md-untracked-selftest-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`;
  execFileSync("git", ["init", "-q", tmp], { env: bootstrapEnv() });
  const env = gitEnv(tmp);
  writeFileSync(`${tmp}/.gitignore`, "CLAUDE.md\n");
  execFileSync("git", ["-C", tmp, "add", ".gitignore"], { env });
  execFileSync("git", ["-C", tmp, "-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", "init"], { env });

  // Baseline: untracked + ignored -> OK
  const baseline = run(tmp, env);
  if (!baseline.ok) {
    throw new Error(`baseline (untracked + ignored) should pass: ${baseline.message}`);
  }

  // Offender 1: CLAUDE.md re-tracked
  writeFileSync(`${tmp}/CLAUDE.md`, "# leaked\n");
  execFileSync("git", ["-C", tmp, "add", "-f", "CLAUDE.md"], { env });
  const offender1 = run(tmp, env);
  if (offender1.ok) {
    throw new Error("re-tracked CLAUDE.md was not caught");
  }
  execFileSync("git", ["-C", tmp, "rm", "-f", "--cached", "CLAUDE.md"], { env });
  unlinkSync(`${tmp}/CLAUDE.md`);

  // Offender 2: .gitignore entry removed
  writeFileSync(`${tmp}/.gitignore`, "\n");
  const offender2 = run(tmp, env);
  if (offender2.ok) {
    throw new Error("missing .gitignore entry was not caught");
  }
}

function selftest() {
  const MAX_ATTEMPTS = 4;
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      attemptSelftest();
      console.log(`${LABEL} --selftest PASS — 2/2 offenders caught, baseline clean${attempt > 1 ? ` (attempt ${attempt}/${MAX_ATTEMPTS}, transient noise on earlier attempt)` : ""}`);
      return;
    } catch (err) {
      lastError = err;
      console.error(`${LABEL} --selftest attempt ${attempt}/${MAX_ATTEMPTS} hit transient noise: ${err.message || err}`);
    }
  }
  console.error(`${LABEL} --selftest FAIL after ${MAX_ATTEMPTS} attempts — ${lastError?.message || lastError}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (!result.ok) process.exit(1);
}
