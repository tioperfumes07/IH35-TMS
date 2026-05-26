#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function repoRoot() {
  return process.env.IH35_BRANCH_TOOLING_ROOT ?? process.cwd();
}

export function runGit(args, options = {}) {
  const cwd = options.cwd ?? repoRoot();
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  });
  return {
    ok: (result.status ?? 1) === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

export function runGitOrThrow(args, options = {}) {
  const result = runGit(args, options);
  if (!result.ok) throw new Error(result.output || `git ${args.join(" ")} failed`);
  return result.stdout;
}

export function currentBranch(cwd = repoRoot()) {
  return runGitOrThrow(["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
}

export function isDirty(cwd = repoRoot()) {
  return runGitOrThrow(["status", "--porcelain"], { cwd }).length > 0;
}

export function listDirtyFiles(cwd = repoRoot()) {
  const status = runGitOrThrow(["status", "--porcelain"], { cwd });
  if (!status) return [];
  return status.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim());
}

export function hasGitStateMarker(cwd = repoRoot()) {
  const gitDir = path.join(cwd, ".git");
  return ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD"].some((name) => fs.existsSync(path.join(gitDir, name)));
}

export function parseRebuildArgs(argv) {
  const args = { sources: [], branch: null, message: null, resume: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--source" && argv[i + 1]) {
      args.sources.push(argv[i + 1]);
      i += 1;
    } else if (token === "--branch" && argv[i + 1]) {
      args.branch = argv[i + 1];
      i += 1;
    } else if (token === "--message" && argv[i + 1]) {
      args.message = argv[i + 1];
      i += 1;
    } else if (token === "--resume") {
      args.resume = true;
    }
  }
  return args;
}

function fail(message) {
  console.error(`branch:rebuild-linear FAIL: ${message}`);
  process.exit(1);
}

function verifyCommitExists(sha, root) {
  if (!runGit(["cat-file", "-e", `${sha}^{commit}`], { cwd: root }).ok) fail(`unknown source commit: ${sha}`);
}

function applySourceDiff(sourceSha, root) {
  const diff = runGitOrThrow(["diff", `origin/main..${sourceSha}`], { cwd: root });
  if (!diff) return;
  const patchFile = path.join(root, ".git", "branch-rebuild-linear.patch");
  fs.writeFileSync(patchFile, `${diff}\n`, "utf8");
  const apply = runGit(["apply", "--3way", patchFile], { cwd: root });
  fs.rmSync(patchFile, { force: true });
  if (!apply.ok) {
    const files = runGit(["diff", "--name-only", "--diff-filter=U"], { cwd: root }).stdout.split(/\r?\n/).filter(Boolean);
    console.error("Apply conflicts detected:");
    for (const file of files) console.error(`  - ${file}`);
    console.error("Resolve conflicts, then rerun with --resume");
    fail(`conflicts while applying ${sourceSha}`);
  }
}

export function rebuildLinear(argv = process.argv.slice(2)) {
  const args = parseRebuildArgs(argv);
  const root = repoRoot();
  if (!args.resume && isDirty(root)) {
    console.error("Dirty working tree:");
    for (const file of listDirtyFiles(root)) console.error(`  ${file}`);
    fail("refusing to rebuild on dirty tree");
  }
  if (currentBranch(root) === "main") fail("refusing to rebuild on main — checkout a feature branch first");

  if (!args.resume) {
    if (args.sources.length === 0) fail("at least one --source <sha> is required");
    if (!args.message) fail("--message is required for a new rebuild commit");
    if (process.env.IH35_BRANCH_TOOLING_SKIP_FETCH !== "1") runGitOrThrow(["fetch", "origin"], { cwd: root });
    runGitOrThrow(["rev-parse", "--verify", "origin/main"], { cwd: root });
    for (const source of args.sources) verifyCommitExists(source, root);
    const originalTip = runGitOrThrow(["rev-parse", "HEAD"], { cwd: root });
    runGitOrThrow(["reset", "--hard", "origin/main"], { cwd: root });
    if (args.branch) runGitOrThrow(["checkout", "-B", args.branch], { cwd: root });
    for (const source of args.sources) applySourceDiff(source, root);
    runGitOrThrow(["add", "-A"], { cwd: root });
    runGitOrThrow(["commit", "-m", args.message], { cwd: root });
    const newTip = runGitOrThrow(["rev-parse", "HEAD"], { cwd: root });
    const filesChanged = runGitOrThrow(["diff", "--name-only", `${originalTip}..${newTip}`], { cwd: root }).split(/\r?\n/).filter(Boolean);
    console.log("branch:rebuild-linear OK");
    console.log(`original-tip=${originalTip}`);
    console.log(`new-tip=${newTip}`);
    console.log(`files-changed-count=${filesChanged.length}`);
    console.log("Next: npm run branch:precheck-push && git push --force-with-lease");
    return { originalTip, newTip, filesChangedCount: filesChanged.length };
  }

  const conflictFiles = runGit(["diff", "--name-only", "--diff-filter=U"], { cwd: root }).stdout.split(/\r?\n/).filter(Boolean);
  if (conflictFiles.length > 0) fail(`unresolved conflicts remain: ${conflictFiles.join(", ")}`);
  if (!args.message) fail("--message is required with --resume");
  const originalTip = runGitOrThrow(["rev-parse", "HEAD"], { cwd: root });
  runGitOrThrow(["add", "-A"], { cwd: root });
  runGitOrThrow(["commit", "-m", args.message], { cwd: root });
  const newTip = runGitOrThrow(["rev-parse", "HEAD"], { cwd: root });
  console.log("branch:rebuild-linear OK (resume)");
  console.log(`original-tip=${originalTip}`);
  console.log(`new-tip=${newTip}`);
  return { originalTip, newTip };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) rebuildLinear();
