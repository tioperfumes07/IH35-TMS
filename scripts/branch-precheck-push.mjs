#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { currentBranch, repoRoot, runGitOrThrow } from "./branch-rebuild-linear.mjs";

export const GATE_RESULT_CATEGORIES = Object.freeze({
  PASS: "pass",
  BRANCH: "branch",
  DIRTY: "dirty",
  CONFLICT: "conflict",
  FRESHNESS: "freshness",
  CAPABILITY: "capability",
  TEST: "test",
});

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
  if (res.status === 0) return { ok: true, category: GATE_RESULT_CATEGORIES.PASS };
  return {
    ok: false,
    category: GATE_RESULT_CATEGORIES.TEST,
    tail: tailLines(merged, 30),
    label,
  };
}

export function buildPrecheckSteps(root) {
  void root;
  return [
    { label: "build-backend", command: "npm run build:backend" },
    { label: "frontend-tsc", command: "cd apps/frontend && npx tsc -b && cd ../.." },
    { label: "verify-static", command: "node scripts/verify-static.mjs" },
    {
      label: "block-ready",
      command: "npm run block-ready",
      requiredCapabilities: ["database"],
      serverRequiredCiEquivalent: "ci / build-typecheck",
    },
  ];
}

export function detectLocalCapabilities(env = process.env) {
  return {
    database: Boolean(env.DATABASE_URL?.trim() || env.DATABASE_DIRECT_URL?.trim()),
  };
}

export function preflightStep(step, capabilities) {
  const missing = (step.requiredCapabilities ?? []).filter(
    (capability) => capabilities[capability] !== true
  );
  if (missing.length === 0) return { action: "run", missing: [] };
  if (!step.serverRequiredCiEquivalent) {
    return {
      action: "fail",
      missing,
      reason: `missing ${missing.join(", ")} without a named server-required CI equivalent`,
    };
  }
  return {
    action: "skip-capability",
    missing,
    ciEquivalent: step.serverRequiredCiEquivalent,
  };
}

export function runPrecheckPush(options = {}) {
  const root = options.root ?? repoRoot();
  const branch = options.branch ?? currentBranch(root);
  if (!isFeatureBranch(branch)) {
    return {
      ok: false,
      category: GATE_RESULT_CATEGORIES.BRANCH,
      reason: "not on a feature branch",
      step: "branch-guard",
    };
  }

  const unmerged = runGitOrThrow(["diff", "--name-only", "--diff-filter=U"], { cwd: root });
  const gitDir = runGitOrThrow(["rev-parse", "--git-dir"], { cwd: root });
  const stateDir = path.resolve(root, gitDir);
  const hasOperationState = ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"]
    .some((marker) => fs.existsSync(path.join(stateDir, marker)));
  if (unmerged || hasOperationState) {
    return {
      ok: false,
      category: GATE_RESULT_CATEGORIES.CONFLICT,
      reason: unmerged
        ? `unresolved conflict(s): ${unmerged.split(/\r?\n/).join(", ")}`
        : "merge/rebase/cherry-pick operation is still in progress",
      step: "conflict-guard",
    };
  }

  const dirty = runGitOrThrow(["status", "--porcelain"], { cwd: root });
  if (dirty) {
    return {
      ok: false,
      category: GATE_RESULT_CATEGORIES.DIRTY,
      reason: "working tree must be clean before push verification",
      step: "dirty-guard",
      tail: tailLines(dirty, 30),
    };
  }
  if (!options.skipFetch) {
    const fetch = runStep("git fetch origin", "git-fetch", root);
    if (!fetch.ok) {
      return {
        ...fetch,
        category: GATE_RESULT_CATEGORIES.CAPABILITY,
        reason: "git fetch origin failed",
        step: "git-fetch",
      };
    }
  }
  const behind = behindOriginMainCount(root);
  if (behind > 0) {
    return {
      ok: false,
      category: GATE_RESULT_CATEGORIES.FRESHNESS,
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
  const capabilities = options.capabilities ?? detectLocalCapabilities();
  const skippedCapabilities = [];
  for (const step of steps) {
    const preflight = preflightStep(step, capabilities);
    if (preflight.action === "fail") {
      return {
        ok: false,
        category: GATE_RESULT_CATEGORIES.CAPABILITY,
        reason: preflight.reason,
        step: step.label,
      };
    }
    if (preflight.action === "skip-capability") {
      const detail = `${preflight.missing.join("+")} → ${preflight.ciEquivalent}`;
      console.log(`[branch:precheck-push] SKIP-CAPABILITY ${step.label}: ${detail}`);
      skippedCapabilities.push({ step: step.label, ...preflight });
      continue;
    }
    const result = runStep(step.command, step.label, root);
    if (!result.ok) {
      console.error(
        `branch:precheck-push FAIL category=${result.category} at step: ${step.label}`
      );
      if (result.tail) console.error(result.tail);
      return {
        ok: false,
        category: result.category,
        reason: `${step.label} failed`,
        step: step.label,
        tail: result.tail,
      };
    }
  }
  const sha = runGitOrThrow(["rev-parse", "HEAD"], { cwd: root });
  const message = `READY TO PUSH: ${branch} at ${sha}`;
  console.log(message);
  return {
    ok: true,
    category: GATE_RESULT_CATEGORIES.PASS,
    branch,
    sha,
    message,
    skippedCapabilities,
  };
}

function main() {
  const result = runPrecheckPush({ skipFetch: process.env.IH35_BRANCH_TOOLING_SKIP_FETCH === "1" });
  if (!result.ok) {
    console.error(`branch:precheck-push FAIL category=${result.category}: ${result.reason}`);
    if (result.tail) {
      console.error("Last output:");
      console.error(result.tail);
    }
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
