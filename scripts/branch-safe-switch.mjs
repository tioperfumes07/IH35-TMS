#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  currentBranch,
  hasGitStateMarker,
  isDirty,
  listDirtyFiles,
  repoRoot,
  runGit,
  runGitOrThrow,
} from "./branch-rebuild-linear.mjs";

function fail(message) {
  console.error(`branch:safe-switch FAIL: ${message}`);
  process.exit(1);
}

function parseTargetBranch(argv) {
  return argv.find((token) => !token.startsWith("-"));
}

function countRecentCheckouts(cwd) {
  const reflog = runGit(
    ["reflog", "--grep-reflog=checkout", "--since=30.minutes.ago", "--format=%gs"],
    { cwd }
  );
  if (!reflog.ok || !reflog.stdout) return 0;
  return reflog.stdout.split(/\r?\n/).filter(Boolean).length;
}

export function safeSwitch(argv = process.argv.slice(2)) {
  const target = parseTargetBranch(argv);
  const root = repoRoot();

  if (!target) {
    fail("usage: npm run branch:safe-switch -- <target-branch>");
  }

  if (isDirty(root)) {
    console.error("Dirty working tree — stash or commit before switching:");
    for (const file of listDirtyFiles(root)) {
      console.error(` - ${file}`);
    }
    process.exit(1);
  }

  if (hasGitStateMarker(root)) {
    fail("in-progress merge/rebase/cherry-pick detected");
  }

  const recentCheckouts = countRecentCheckouts(root);
  if (recentCheckouts > 3) {
    console.error("Too many recent checkouts in the last 30 minutes:");
    console.error(runGitOrThrow(["reflog", "-10"], { cwd: root }));
    process.exit(1);
  }

  const fromBranch = currentBranch(root);
  if (process.env.IH35_BRANCH_TOOLING_SKIP_FETCH !== "1") {
    runGitOrThrow(["fetch", "origin"], { cwd: root });
  }

  const behind = runGit(["rev-list", "--count", `${target}..origin/main`], { cwd: root });
  const behindCount = Number(behind.stdout || "0");
  if (behindCount > 100) {
    console.warn(
      `branch:safe-switch WARN: target branch appears ${behindCount} commit(s) behind origin/main (warning only).`
    );
  }

  runGitOrThrow(["checkout", target], { cwd: root });
  console.log(`switched from ${fromBranch} to ${target}; main is ${behindCount} commits ahead`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  safeSwitch();
}
