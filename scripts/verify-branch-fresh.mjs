#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { unionMergedPatterns, isUnionMerged } from "./branch-precheck-push.mjs";

// Repo root — needed to read .gitattributes for the union-merge exemption.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_MAX_COMMITS_BEHIND = 0;

export function runGit(args, cwd = process.cwd()) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `${result.stderr ?? result.stdout ?? `git ${args.join(" ")} failed`}`.trim()
    );
  }
  return `${result.stdout ?? ""}`.trim();
}

export function validateCommitSha(value) {
  if (!/^[0-9a-f]{7,40}$/i.test(value ?? "")) {
    throw new Error(`invalid commit SHA: ${String(value)}`);
  }
  return value;
}

export function validateGitRef(value) {
  const ref = String(value ?? "");
  if (
    !ref ||
    ref.startsWith("-") ||
    ref.includes("..") ||
    ref.includes("@{") ||
    ref.includes("//") ||
    /[~^:?*[\]\\\s]/.test(ref) ||
    ref.endsWith("/") ||
    ref.endsWith(".lock")
  ) {
    throw new Error(`invalid git ref: ${ref}`);
  }
  return ref;
}

function fail(message) {
  console.error(`verify:branch-fresh FAIL: ${message}`);
  process.exit(1);
}

export function resolveBaseSha(cliArgs = process.argv.slice(2)) {
  const cliBaseIdx = cliArgs.indexOf("--base-sha");
  const resolved =
    (cliBaseIdx >= 0 ? cliArgs[cliBaseIdx + 1] : undefined) ??
    process.env.BRANCH_FRESH_BASE_SHA ??
    process.env.GITHUB_BASE_SHA ??
    process.env.PR_BASE_SHA;
  if (resolved) return resolved;
  try {
    const inferred = runGit(["rev-parse", "origin/main"]);
    process.env.GITHUB_BASE_SHA = inferred;
    console.warn(
      "[verify:branch-fresh] GITHUB_BASE_SHA inferred from origin/main (no CI env detected)"
    );
    return inferred;
  } catch {
    return undefined;
  }
}

/**
 * The commit that represents THIS BRANCH'S OWN WORK.
 *
 * On a `pull_request` event `actions/checkout` checks out `refs/pull/<n>/merge` — the branch with
 * main ALREADY MERGED IN — so bare `HEAD` in CI is not the branch, it is branch+main. Diffing from
 * the merge base to that HEAD therefore reports every file main touched as a file "this branch also
 * changes", which made the overlap test fire on branches that overlap nothing. See the merge-ref
 * case in verify-branch-fresh-selftest.mjs.
 */
export function resolveHeadSha(cliArgs = process.argv.slice(2)) {
  const cliHeadIdx = cliArgs.indexOf("--head-sha");
  return (
    (cliHeadIdx >= 0 ? cliArgs[cliHeadIdx + 1] : undefined) ??
    process.env.BRANCH_FRESH_HEAD_SHA ??
    process.env.GITHUB_HEAD_SHA ??
    process.env.PR_HEAD_SHA ??
    "HEAD"
  );
}

export function verifyBranchFresh(cliArgs = process.argv.slice(2)) {
  const argMainRefIdx = cliArgs.indexOf("--main-ref");
  const argMaxIdx = cliArgs.indexOf("--max-commits");
  const baseSha = resolveBaseSha(cliArgs);
  const headSha = resolveHeadSha(cliArgs);
  const mainRef = (argMainRefIdx >= 0 ? cliArgs[argMainRefIdx + 1] : undefined) ?? "origin/main";
  const maxBehind = Number(
    (argMaxIdx >= 0 ? cliArgs[argMaxIdx + 1] : undefined) ??
      process.env.BRANCH_FRESH_MAX ??
      DEFAULT_MAX_COMMITS_BEHIND
  );

  if (!baseSha) {
    fail("missing base SHA (set GITHUB_BASE_SHA or pass --base-sha)");
  }
  if (!Number.isFinite(maxBehind) || maxBehind < 0) {
    fail(`invalid max commits threshold: ${String(maxBehind)}`);
  }

  let behindCount = 0;
  try {
    validateCommitSha(baseSha);
    validateGitRef(mainRef);
    runGit(["rev-parse", "--verify", `${baseSha}^{commit}`]);
    runGit(["fetch", "origin", "main"]);
    runGit(["rev-parse", "--verify", `${mainRef}^{commit}`]);
    const output = runGit(["rev-list", "--count", `${baseSha}..${mainRef}`]);
    behindCount = Number(output || "0");
    if (!Number.isFinite(behindCount)) {
      fail(`could not parse behind count from: ${output}`);
    }
  } catch (error) {
    fail((error instanceof Error ? error.message : String(error)).trim());
  }

  // ── Freshness by OVERLAP, not by distance ────────────────────────────────────────────────────
  //
  // This gate used to fail whenever the base was ANY commits behind main. That is a hard
  // serialization: every merge invalidates every other open PR, so N open PRs cost N^2 full CI
  // rebuilds at ~20-40 minutes each, and a single PR can take hours to land through no fault of its
  // own. GitHub's own ruleset already sets strict_required_status_checks_policy=false — the
  // zero-behind rule was ours alone.
  //
  // What the gate is actually FOR is catching a branch that is stale in a way that matters: main
  // changed something this branch also changed (so CI validated a combination that will never
  // exist), or main moved something whose correctness depends on global allocation. Distance from
  // main is a proxy for that, and a bad one — it punishes every unrelated PR equally.
  //
  // So: being behind is fine. Being behind ON THE SAME FILES is not.
  if (behindCount > maxBehind) {
    let mainFiles = [];
    let branchFiles = [];
    let mergeBase = "";
    try {
      // Anchor on merge-base(mainRef, headSha), NOT merge-base(baseSha, mainRef), so the two sides
      // are symmetric three-dot diffs — the same thing GitHub shows as "files changed". This is what
      // makes the gate correct in both directions:
      //   • CI checks out the PR MERGE REF, so bare HEAD already contains main. Anchoring off the
      //     resolved head sha keeps branchFiles to the branch's own work.
      //   • A branch that has legitimately merged main is now FRESH: the merge base moves up to
      //     main's tip, mainFiles goes empty, and it stops being punished for staying current.
      mergeBase = runGit(["merge-base", mainRef, headSha]);
      mainFiles = runGit(["diff", "--name-only", `${mergeBase}..${mainRef}`]).split("\n").filter(Boolean);
      branchFiles = runGit(["diff", "--name-only", `${mergeBase}..${headSha}`]).split("\n").filter(Boolean);
    } catch (error) {
      // If the comparison itself cannot be made, fall back to the strict rule rather than guessing.
      fail(
        `base ${baseSha} is ${behindCount} commit(s) behind ${mainRef} and the overlap could not be ` +
          `computed (${(error instanceof Error ? error.message : String(error)).trim()}) — rebase and re-run.`
      );
    }

    // Verify-step numbers are claimed from a BANDED namespace (Claude odd / Cursor even) and recorded
    // in CLAIMED-NUMBERS.json. The filename carries the claim, so the file list is the claim list.
    const stepNumbers = (files) => {
      const out = new Set();
      for (const f of files) {
        const m = /^scripts\/verify-steps\/(\d+)-/.exec(f);
        if (m) out.add(m[1]);
      }
      return out;
    };
    const CLAIMED_REGISTRY = "scripts/verify-steps/CLAIMED-NUMBERS.json";
    const mainSteps = stepNumbers(mainFiles);
    const branchSteps = stepNumbers(branchFiles);
    const stepCollisions = [...branchSteps].filter((n) => mainSteps.has(n));

    // TOOL-F02: the migration NUMBER is the shared resource, not the directory. db-migrate.mjs is
    // LEDGER-BASED — it applies every migration not already in the ledger, over a filename-sorted
    // list, with no comparison against a maximum. A migration numbered below main's current max
    // therefore still applies when its branch merges later. Order dependencies are caught by the
    // fresh-database replay every PR already runs (verify:db:reset), not by this gate.
    const migrationNumbers = (files) => {
      const out = new Set();
      for (const f of files) {
        const m = /^db\/migrations\/(\d+)_/.exec(f);
        if (m) out.add(m[1]);
      }
      return out;
    };
    const mainMigrations = migrationNumbers(mainFiles);
    const branchMigrations = migrationNumbers(branchFiles);
    const migrationCollisions = [...branchMigrations].filter((n) => mainMigrations.has(n));

    // CLAIMED-NUMBERS.json is an append-only union registry, and adding a step file is the normal
    // shape of any guard PR. Two guard PRs both touching them is NOT a conflict — only claiming the
    // SAME number is. Excluded from plain overlap and judged by stepCollisions instead. (Keeping the
    // whole directory coupled made every guard PR block every other guard PR, which is the N^2
    // treadmill relocated rather than removed — and nearly every quality PR in this repo adds a guard.)
    // Union-merged paths cannot conflict. This list is DERIVED from .gitattributes and shares its
    // implementation with scripts/branch-precheck-push.mjs — the local gate and this CI gate must
    // never disagree again. They already had: the local gate hardcoded one exemption while
    // .gitattributes declared eleven, so ten conflict-proof files still forced rebases (2026-07-31:
    // 15 CANCELLED ci runs vs 10 real failures over 60 runs). Importing rather than re-implementing is
    // the durable fix — a new union path in .gitattributes now takes effect in BOTH gates at once.
    const unionPatterns = unionMergedPatterns(
      fs.existsSync(path.join(REPO_ROOT, ".gitattributes"))
        ? fs.readFileSync(path.join(REPO_ROOT, ".gitattributes"), "utf8")
        : ""
    );
    const branchSet = new Set(branchFiles);
    const overlap = mainFiles.filter(
      (f) =>
        branchSet.has(f) &&
        f !== CLAIMED_REGISTRY &&
        !isUnionMerged(f, unionPatterns) &&
        !/^scripts\/verify-steps\/\d+-/.test(f) &&
        !/^db\/migrations\/\d+_/.test(f)
    );

    // Paths where correctness is GLOBAL, not per-file: two PRs can touch different files here and
    // still collide, because the thing being allocated is a number shared across the repo. Migration
    // numbering is "strictly above main's max", so two DIFFERENT migration files still collide — that
    // one stays unconditional.
    const COUPLED = [{ prefix: "package-lock.json", why: "lockfile resolution is global" }];
    const coupled = COUPLED.filter(
      (c) => mainFiles.some((f) => f.startsWith(c.prefix)) && branchFiles.some((f) => f.startsWith(c.prefix))
    );

    if (overlap.length > 0 || coupled.length > 0 || stepCollisions.length > 0 || migrationCollisions.length > 0) {
      const reasons = [];
      if (overlap.length > 0) {
        reasons.push(
          `main changed ${overlap.length} file(s) this branch also changes: ${overlap.slice(0, 10).join(", ")}` +
            (overlap.length > 10 ? `, +${overlap.length - 10} more` : "")
        );
      }
      for (const c of coupled) {
        reasons.push(`both touch ${c.prefix} — ${c.why}`);
      }
      if (stepCollisions.length > 0) {
        reasons.push(`both claim verify-step number(s) ${stepCollisions.join(", ")} — banded namespace collision`);
      }
      if (migrationCollisions.length > 0) {
        reasons.push(`both claim migration number(s) ${migrationCollisions.join(", ")} — same filename would collide`);
      }
      fail(
        `base ${baseSha} is ${behindCount} commit(s) behind ${mainRef} AND overlaps it. Rebase.\n  - ` +
          reasons.join("\n  - ")
      );
    }

    console.log(
      `verify:branch-fresh OK (base=${baseSha} head=${headSha} behind=${behindCount} but NO overlap ` +
        `with ${mainRef}: ${mainFiles.length} file(s) moved on main, ${branchFiles.length} changed ` +
        `here, 0 shared, no globally-allocated path touched by both) — rebase not required`
    );
    return { baseSha, behindCount, mainRef, maxBehind, overlapFree: true };
  }

  console.log(
    `verify:branch-fresh OK (base=${baseSha} behind=${behindCount} threshold=${maxBehind} ref=${mainRef})`
  );
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  verifyBranchFresh();
}
