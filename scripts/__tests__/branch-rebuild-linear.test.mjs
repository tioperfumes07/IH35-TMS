import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { attachBareOrigin, initFixtureRepo, runGitOrThrow, writeAndCommit } from "./fixtures/branch-tooling/git-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.resolve(root, "scripts/branch-rebuild-linear.mjs");

function runScript(args, env) {
  return spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, IH35_BRANCH_TOOLING_SKIP_FETCH: "1", ...env },
  });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-rebuild-"));
  initFixtureRepo(dir);
  writeAndCommit(dir, "README.md", "main\n", "main commit");
  runGitOrThrow(["branch", "-M", "main"], { cwd: dir });
  attachBareOrigin(dir);
  runGitOrThrow(["checkout", "-b", "feat/test"], { cwd: dir });
  return dir;
}

test("refuses dirty tree", () => {
  const dir = makeRepo();
  fs.writeFileSync(path.join(dir, "dirty.txt"), "x", "utf8");
  const run = runScript([], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Dirty working tree/);
});

test("refuses main branch", () => {
  const dir = makeRepo();
  runGitOrThrow(["checkout", "main"], { cwd: dir });
  const run = runScript(["--source", "HEAD", "--message", "x"], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /refusing to rebuild on main/);
});

test("refuses unknown source sha", () => {
  const dir = makeRepo();
  const run = runScript(
    ["--source", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "--message", "x"],
    { IH35_BRANCH_TOOLING_ROOT: dir }
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /unknown source commit/);
});

test("happy path rebuilds linear commit", () => {
  const dir = makeRepo();
  writeAndCommit(dir, "feature.txt", "feature\n", "feature on branch");
  const source = runGitOrThrow(["rev-parse", "HEAD"], { cwd: dir });
  runGitOrThrow(["reset", "--hard", "origin/main"], { cwd: dir });
  const run = runScript(["--source", source, "--message", "linearized"], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /branch:rebuild-linear OK/);
});

test("conflict path exits non-zero", () => {
  const dir = makeRepo();
  writeAndCommit(dir, "conflict.txt", "base\n", "base");
  const base = runGitOrThrow(["rev-parse", "HEAD"], { cwd: dir });
  runGitOrThrow(["checkout", "-b", "branch-a", base], { cwd: dir });
  writeAndCommit(dir, "conflict.txt", "line-a\n", "a");
  const sourceA = runGitOrThrow(["rev-parse", "HEAD"], { cwd: dir });
  runGitOrThrow(["checkout", "-b", "branch-b", base], { cwd: dir });
  writeAndCommit(dir, "conflict.txt", "line-b\n", "b");
  const sourceB = runGitOrThrow(["rev-parse", "HEAD"], { cwd: dir });
  runGitOrThrow(["checkout", "-B", "feat/test", "origin/main"], { cwd: dir });
  const run = runScript(
    ["--source", sourceA, "--source", sourceB, "--message", "rebuild"],
    { IH35_BRANCH_TOOLING_ROOT: dir }
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Apply conflicts detected/);
});
