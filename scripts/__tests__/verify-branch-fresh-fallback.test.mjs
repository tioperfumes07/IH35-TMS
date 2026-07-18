import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveBaseSha } from "../verify-branch-fresh.mjs";
import {
  attachBareOrigin,
  initFixtureRepo,
  runGitOrThrow,
  writeAndCommit,
} from "./fixtures/branch-tooling/git-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.join(root, "scripts/verify-branch-fresh.mjs");

test("preserves explicit GITHUB_BASE_SHA when set", () => {
  const original = process.env.GITHUB_BASE_SHA;
  process.env.GITHUB_BASE_SHA = "abc123";
  const value = resolveBaseSha([]);
  assert.equal(value, "abc123");
  process.env.GITHUB_BASE_SHA = original;
});

test("infers base from origin/main when env is unset", () => {
  const originalGithub = process.env.GITHUB_BASE_SHA;
  const originalBranchFresh = process.env.BRANCH_FRESH_BASE_SHA;
  const originalPr = process.env.PR_BASE_SHA;
  delete process.env.GITHUB_BASE_SHA;
  delete process.env.BRANCH_FRESH_BASE_SHA;
  delete process.env.PR_BASE_SHA;
  const value = resolveBaseSha([]);
  assert.ok(value && value.length >= 7);
  process.env.GITHUB_BASE_SHA = originalGithub;
  process.env.BRANCH_FRESH_BASE_SHA = originalBranchFresh;
  process.env.PR_BASE_SHA = originalPr;
});

test("strict freshness fails on one behind commit anywhere in the tree", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "branch-fresh-full-tree-"));
  initFixtureRepo(dir);
  writeAndCommit(dir, "README.md", "base\n", "base");
  const base = runGitOrThrow(["rev-parse", "HEAD"], { cwd: dir });
  runGitOrThrow(["branch", "-M", "main"], { cwd: dir });
  attachBareOrigin(dir);
  writeAndCommit(dir, "unrelated/full-tree.txt", "main moved\n", "main moved outside old allowlist");
  runGitOrThrow(["push", "origin", "main"], { cwd: dir });
  runGitOrThrow(["checkout", "-b", "fix/stale", base], { cwd: dir });

  const run = spawnSync(
    process.execPath,
    [scriptPath, "--base-sha", base, "--main-ref", "origin/main"],
    { cwd: dir, encoding: "utf8" }
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /1 full-tree commit\(s\) behind/);
  assert.match(run.stderr, /maximum allowed is 0/);
});
