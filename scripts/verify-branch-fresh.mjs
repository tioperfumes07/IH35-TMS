#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

export function verifyBranchFresh(cliArgs = process.argv.slice(2)) {
  const argMainRefIdx = cliArgs.indexOf("--main-ref");
  const argMaxIdx = cliArgs.indexOf("--max-commits");
  const baseSha = resolveBaseSha(cliArgs);
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

  if (behindCount > maxBehind) {
    fail(
      `base ${baseSha} is ${behindCount} full-tree commit(s) behind ${mainRef}; maximum allowed is ${maxBehind}`
    );
  }

  console.log(
    `verify:branch-fresh OK (base=${baseSha} behind=${behindCount} threshold=${maxBehind} ref=${mainRef})`
  );
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  verifyBranchFresh();
}
