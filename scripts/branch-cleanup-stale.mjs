#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { currentBranch, repoRoot, runGit, runGitOrThrow } from "./branch-rebuild-linear.mjs";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

function parseCleanupArgs(argv) {
  return { dryRun: argv.includes("--dry-run"), force: argv.includes("--force") };
}

function isProtectedBranch(name, current) {
  return name === current || name === "main" || name === "master";
}

function isYoungWipBranch(name, cwd) {
  if (!/^(wip|tmp)\//.test(name)) return false;
  const lastCommit = runGit(["log", "-1", "--format=%ct", name], { cwd });
  if (!lastCommit.ok) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - Number(lastCommit.stdout || "0");
  return ageSeconds < SEVEN_DAYS_SECONDS;
}

function hasUniqueWork(branch, cwd) {
  const unique = runGit(["log", branch, "--not", "origin/main", "--oneline"], { cwd });
  return Boolean(unique.ok && unique.stdout.trim());
}

export async function cleanupStale(argv = process.argv.slice(2)) {
  const args = parseCleanupArgs(argv);
  const root = repoRoot();
  const current = currentBranch(root);

  if (process.env.IH35_BRANCH_TOOLING_SKIP_FETCH !== "1") {
    runGitOrThrow(["fetch", "origin", "--prune"], { cwd: root });
  }

  const branches = runGitOrThrow(["for-each-ref", "--format=%(refname:short)", "refs/heads/"], { cwd: root })
    .split(/\r?\n/)
    .filter(Boolean);

  const candidates = [];
  let kept = 0;

  for (const branch of branches) {
    if (isProtectedBranch(branch, current)) {
      kept += 1;
      continue;
    }
    if (isYoungWipBranch(branch, root)) {
      kept += 1;
      continue;
    }
    if (hasUniqueWork(branch, root)) {
      kept += 1;
      continue;
    }
    candidates.push(branch);
  }

  if (args.dryRun) {
    for (const branch of candidates) {
      console.log(`would-delete ${branch}`);
    }
    console.log(`deleted 0 branches, kept ${kept} with unique work`);
    return;
  }

  if (candidates.length === 0) {
    console.log(`deleted 0 branches, kept ${kept} with unique work`);
    return;
  }

  if (!args.force) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(`Delete ${candidates.length} stale branch(es)? [y/N] `);
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log("Aborted — no branches deleted");
      process.exit(1);
    }
  }

  for (const branch of candidates) {
    runGitOrThrow(["branch", "-D", branch], { cwd: root });
  }

  console.log(`deleted ${candidates.length} branches, kept ${kept} with unique work`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  cleanupStale();
}
