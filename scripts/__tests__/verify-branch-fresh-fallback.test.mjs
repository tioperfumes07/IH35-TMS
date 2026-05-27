import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveBaseSha } from "../verify-branch-fresh.mjs";

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
