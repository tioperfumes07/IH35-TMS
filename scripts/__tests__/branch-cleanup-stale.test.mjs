import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { attachBareOrigin, initFixtureRepo, runGitOrThrow, writeAndCommit } from "./fixtures/branch-tooling/git-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.resolve(root, "scripts/branch-cleanup-stale.mjs");

function runScript(args, env) {
  return spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, IH35_BRANCH_TOOLING_SKIP_FETCH: "1", ...env },
  });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-cleanup-"));
  initFixtureRepo(dir);
  writeAndCommit(dir, "README.md", "main\n", "main");
  runGitOrThrow(["branch", "-M", "main"], { cwd: dir });
  attachBareOrigin(dir);
  runGitOrThrow(["checkout", "-b", "feat/current"], { cwd: dir });
  runGitOrThrow(["checkout", "-b", "feat/merged"], { cwd: dir });
  writeAndCommit(dir, "merged.txt", "merged\n", "merged");
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  runGitOrThrow(["merge", "--ff-only", "feat/merged"], { cwd: dir });
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "feat/current"], { cwd: dir });
  runGitOrThrow(["checkout", "-b", "feat/unique"], { cwd: dir });
  writeAndCommit(dir, "unique.txt", "unique\n", "unique");
  runGitOrThrow(["checkout", "feat/current"], { cwd: dir });
  runGitOrThrow(["checkout", "-b", "wip/fresh"], { cwd: dir });
  writeAndCommit(dir, "wip.txt", "wip\n", "wip");
  runGitOrThrow(["checkout", "feat/current"], { cwd: dir });
  return dir;
}

test("dry-run lists merged stale branches", () => {
  const dir = makeRepo();
  const run = runScript(["--dry-run"], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /would-delete feat\/merged/);
  assert.doesNotMatch(run.stdout, /would-delete feat\/unique/);
  assert.doesNotMatch(run.stdout, /would-delete wip\/fresh/);
});

test("force deletes merged branches and keeps unique work", () => {
  const dir = makeRepo();
  const run = runScript(["--force"], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /deleted 1 branches/);
  const branches = runGitOrThrow(["branch", "--list"], { cwd: dir });
  assert.match(branches, /feat\/unique/);
  assert.doesNotMatch(branches, /feat\/merged/);
});

test("preserves wip/tmp branches younger than seven days", () => {
  const dir = makeRepo();
  const run = runScript(["--force"], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 0, run.stderr);
  const branches = runGitOrThrow(["branch", "--list"], { cwd: dir });
  assert.match(branches, /wip\/fresh/);
});
