#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { currentBranch, repoRoot, runGitOrThrow } from "./branch-rebuild-linear.mjs";

function tailLines(text, count = 30) {
  return `${text ?? ""}`.split(/\r?\n/).slice(-count).join("\n");
}

function listVerifyScripts(root) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(root, "package.json"), "utf8"));
  return Object.keys(pkg.scripts ?? {})
    .filter((name) => name.startsWith("verify:"))
    .sort();
}

function readVerifyMeta(root) {
  const metaPath = path.resolve(root, "scripts/verify-meta.json");
  if (!fs.existsSync(metaPath)) return [];
  const data = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  return Array.isArray(data.db_gated_verify_scripts) ? data.db_gated_verify_scripts : [];
}

export function discoverVerifyScripts(root, dbGated = []) {
  const gated = new Set(dbGated);
  return listVerifyScripts(root).filter((name) => !gated.has(name));
}

export function isFeatureBranch(branchName) {
  return Boolean(branchName && branchName !== "main" && branchName !== "HEAD");
}

export function behindOriginMainCount(root) {
  return Number(runGitOrThrow(["rev-list", "--count", "HEAD..origin/main"], { cwd: root }) || "0");
}

function runStep(command, label, root) {
  console.log(`[branch:precheck-push] RUN ${label}: ${command}`);
  const res = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", env: process.env });
  const merged = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
  if (res.status === 0) return { ok: true };
  return { ok: false, tail: tailLines(merged, 30), label };
}

export function buildPrecheckSteps(root) {
  void root;
  return [
    { label: "build-backend", command: "npm run build:backend" },
    { label: "frontend-tsc", command: "cd apps/frontend && npx tsc -b && cd ../.." },
    { label: "block-ready", command: "npm run block-ready" },
  ];
}

export function runPrecheckPush(options = {}) {
  const root = options.root ?? repoRoot();
  const branch = options.branch ?? currentBranch(root);
  if (!isFeatureBranch(branch)) {
    return { ok: false, reason: "not on a feature branch", step: "branch-guard" };
  }
  if (!options.skipFetch) {
    const fetch = runStep("git fetch origin", "git-fetch", root);
    if (!fetch.ok) return { ok: false, reason: "git fetch origin failed", step: "git-fetch", tail: fetch.tail };
  }
  const behind = behindOriginMainCount(root);
  if (behind > 0) {
    return {
      ok: false,
      reason: `local branch is ${behind} commit(s) behind origin/main — run npm run branch:rebuild-linear`,
      step: "branch-freshness",
    };
  }

  if (!process.env.GITHUB_BASE_SHA && !process.env.BRANCH_FRESH_BASE_SHA) {
    process.env.GITHUB_BASE_SHA = runGitOrThrow(["merge-base", "HEAD", "origin/main"], { cwd: root });
  }

  const steps =
    options.steps ??
    (process.env.BRANCH_PRECHECK_STEPS_JSON
      ? JSON.parse(process.env.BRANCH_PRECHECK_STEPS_JSON)
      : buildPrecheckSteps(root));
  for (const step of steps) {
    const result = runStep(step.command, step.label, root);
    if (!result.ok) {
      console.error(`branch:precheck-push FAIL at step: ${step.label}`);
      if (result.tail) console.error(result.tail);
      return { ok: false, reason: `${step.label} failed`, step: step.label, tail: result.tail };
    }
  }
  const sha = runGitOrThrow(["rev-parse", "HEAD"], { cwd: root });
  const message = `READY TO PUSH: ${branch} at ${sha}`;
  console.log(message);
  return { ok: true, branch, sha, message };
}

function main() {
  const result = runPrecheckPush({ skipFetch: process.env.IH35_BRANCH_TOOLING_SKIP_FETCH === "1" });
  if (!result.ok) {
    console.error(`branch:precheck-push FAIL: ${result.reason}`);
    if (result.tail) {
      console.error("Last output:");
      console.error(result.tail);
    }
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
