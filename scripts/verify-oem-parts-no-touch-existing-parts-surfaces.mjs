#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN_CHANGED_FILES = [
  /(^|\/)catalogs\.maintenance_parts(\.|\/|$)/,
  /(^|\/)catalogs\/maintenance_parts(\.|\/|$)/,
  /(^|\/)catalogs\.parts(\.|\/|$)/,
  /(^|\/)catalogs\/parts(\.|\/|$)/,
  /(^|\/)maintenance\.parts_inventory(\.|\/|$)/,
  /(^|\/)maintenance\/parts_inventory(\.|\/|$)/,
  /(^|\/)maint\.part(\.|\/|$)/,
  /(^|\/)maint\/part(\.|\/|$)/,
];

function fail(message) {
  console.error(`verify:oem-parts-no-touch-existing-parts-surfaces FAIL: ${message}`);
  process.exit(1);
}

function runGit(args) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function resolveBaseSha() {
  const fromEnv =
    process.env.GITHUB_BASE_SHA || process.env.BRANCH_FRESH_BASE_SHA || process.env.PR_BASE_SHA;
  if (fromEnv) return fromEnv.trim();

  // NEVER --depth 1 here: a shallow fetch mid-pipeline re-shallows the WHOLE checkout for every
  // later verify:pre-commit step in this same process, including 1430/1324/1431's branch-range-guard
  // (scripts/lib/branch-range-guard.mjs), which now correctly REFUSES to report success on a shallow
  // clone. This guard is not the only reader of the working copy's history — don't truncate it.
  const baseRef = (process.env.GITHUB_BASE_REF || "main").trim();
  runGit(["fetch", "origin", `${baseRef}:refs/remotes/origin/${baseRef}`]);

  const remoteRef = `origin/${baseRef}`;
  const mergeBase = runGit(["merge-base", "HEAD", remoteRef]);
  if (mergeBase.status === 0 && mergeBase.stdout.trim()) {
    return mergeBase.stdout.trim();
  }

  const originMain = runGit(["rev-parse", remoteRef]);
  if (originMain.status === 0 && originMain.stdout.trim()) {
    return originMain.stdout.trim();
  }

  return null;
}

const baseSha = resolveBaseSha();
const diffRange = baseSha ? `${baseSha}..HEAD` : "HEAD~1..HEAD";

const diff = runGit(["diff", diffRange, "--name-only"]);

if (diff.status !== 0) {
  fail(diff.stderr || diff.stdout || "git diff failed");
}

const changedFiles = diff.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (changedFiles.length === 0) {
  console.log("verify:oem-parts-no-touch-existing-parts-surfaces PASS (no diff in range)");
  process.exit(0);
}

for (const file of changedFiles) {
  for (const pattern of FORBIDDEN_CHANGED_FILES) {
    if (pattern.test(file)) {
      fail(`forbidden inventory surface file touched: ${file}`);
    }
  }
}

console.log("verify:oem-parts-no-touch-existing-parts-surfaces PASS");
