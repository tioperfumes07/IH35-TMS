import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { attachBareOrigin, initFixtureRepo, runGitOrThrow, writeAndCommit } from "./fixtures/branch-tooling/git-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.resolve(root, "scripts/branch-safe-switch.mjs");

function runScript(args, env) {
  return spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, IH35_BRANCH_TOOLING_SKIP_FETCH: "1", ...env },
  });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-switch-"));
  initFixtureRepo(dir);
  writeAndCommit(dir, "README.md", "main\n", "main");
  runGitOrThrow(["branch", "-M", "main"], { cwd: dir });
  attachBareOrigin(dir);
  runGitOrThrow(["checkout", "-b", "feat/a"], { cwd: dir });
  writeAndCommit(dir, "a.txt", "a\n", "a");
  runGitOrThrow(["checkout", "-b", "feat/b", "main"], { cwd: dir });
  writeAndCommit(dir, "b.txt", "b\n", "b");
  return dir;
}

test("refuses dirty tree", () => {
  const dir = makeRepo();
  fs.writeFileSync(path.join(dir, "dirty.txt"), "x", "utf8");
  const run = runScript(["feat/a"], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Dirty working tree/);
});

test("refuses in-progress merge state", () => {
  const dir = makeRepo();
  fs.writeFileSync(path.join(dir, ".git/MERGE_HEAD"), "deadbeef\n", "utf8");
  const run = runScript(["feat/a"], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /merge\/rebase\/cherry-pick/);
});

test("refuses excessive recent checkouts", () => {
  const dir = makeRepo();
  for (let i = 0; i < 4; i += 1) {
    runGitOrThrow(["checkout", i % 2 === 0 ? "feat/a" : "feat/b"], { cwd: dir });
  }
  const run = runScript(["feat/a"], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Too many recent checkouts/);
});

test("happy path switches branches", () => {
  const dir = makeRepo();
  const run = runScript(["feat/a"], { IH35_BRANCH_TOOLING_ROOT: dir });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /switched from feat\/b to feat\/a/);
});
