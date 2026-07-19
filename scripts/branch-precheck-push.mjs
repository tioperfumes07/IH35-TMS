#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { currentBranch, repoRoot, runGitOrThrow } from "./branch-rebuild-linear.mjs";
import {
  loadCapabilityPolicy,
  validateCapabilitySkip,
} from "./push-gate-capability-policy.mjs";
import {
  VLCI_ENV,
  isLocalVerifyDatabaseUrl,
  validateOwnershipProof,
} from "./vlci-lifecycle.mjs";

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

function runStep(command, label, root, env = process.env) {
  console.log(`[branch:precheck-push] RUN ${label}: ${command}`);
  const res = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", env });
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
  // verify:static is owned once by block-ready (in-process proof). Do not duplicate here.
  return [
    { label: "build-backend", command: "npm run build:backend" },
    { label: "frontend-tsc", command: "cd apps/frontend && npx tsc -b && cd ../.." },
    {
      label: "block-ready",
      command: "npm run block-ready",
      requiredCapabilities: ["database"],
      serverRequiredCiEquivalent: "ci / build-typecheck",
    },
  ];
}

/**
 * Probe that a local-verify Postgres endpoint accepts TCP.
 * Sync (child) so precheck capability detection stays synchronous.
 * Never treats URL-string presence alone as proof.
 */
export function probeLocalVerifyTcp(url, { timeoutMs = 750, run = spawnSync } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return false;
  const port = Number(parsed.port || "5432");
  if (!Number.isInteger(port) || port <= 0) return false;
  const script = `
const net = require("node:net");
const host = ${JSON.stringify(host)};
const port = ${JSON.stringify(port)};
const timeoutMs = ${JSON.stringify(timeoutMs)};
const socket = net.connect({ host, port }, () => {
  socket.end();
  process.exit(0);
});
socket.on("error", () => process.exit(1));
setTimeout(() => {
  socket.destroy();
  process.exit(1);
}, timeoutMs);
`;
  const res = run(process.execPath, ["-e", script], {
    encoding: "utf8",
    timeout: timeoutMs + 500,
  });
  return res.status === 0;
}

/**
 * Database capability is true ONLY when:
 *   1) an owned VLCI / local-CI lifecycle proof is present in the process env, OR
 *   2) a local-verify URL is present in the process env AND a TCP probe validates it.
 * A non-empty DATABASE_URL string (e.g. stale Neon from `.env`) is NEVER enough.
 */
export function detectLocalCapabilities(env = process.env, options = {}) {
  const root = options.root ?? (() => {
    try {
      return repoRoot();
    } catch {
      return process.cwd();
    }
  })();
  const probe =
    typeof options.probeTcp === "function"
      ? options.probeTcp
      : (url) => probeLocalVerifyTcp(url, { run: options.run });

  const owned = validateOwnershipProof(env, {
    repoRoot: root,
    requireBindings: true,
    isAlive: options.isAlive,
  });
  if (owned.ok === true) {
    return { database: true, databaseSource: "vlci-owned" };
  }

  const candidates = [env.DATABASE_URL, env.DATABASE_DIRECT_URL, env[VLCI_ENV.DATABASE_URL]]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());

  for (const url of candidates) {
    if (!isLocalVerifyDatabaseUrl(url, env, { repoRoot: root, isAlive: options.isAlive })) {
      continue;
    }
    if (probe(url)) {
      return { database: true, databaseSource: "local-ci-validated" };
    }
  }

  return { database: false, databaseSource: null };
}

export function preflightStep(step, capabilities, policy) {
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
  const policyViolations = validateCapabilitySkip(
    missing,
    step.serverRequiredCiEquivalent,
    policy
  );
  if (policyViolations.length > 0) {
    return {
      action: "fail",
      missing,
      reason: policyViolations.join("; "),
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
  const env = options.env ?? process.env;
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
    const fetch = runStep("git fetch origin", "git-fetch", root, env);
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

  if (!env.GITHUB_BASE_SHA && !env.BRANCH_FRESH_BASE_SHA) {
    env.GITHUB_BASE_SHA = runGitOrThrow(["merge-base", "HEAD", "origin/main"], { cwd: root });
  }

  const steps =
    options.steps ??
    (env.BRANCH_PRECHECK_STEPS_JSON
      ? JSON.parse(env.BRANCH_PRECHECK_STEPS_JSON)
      : buildPrecheckSteps(root));
  const capabilities =
    options.capabilities ??
    detectLocalCapabilities(env, {
      root,
      probeTcp: options.probeTcp,
      isAlive: options.isAlive,
      run: options.run,
    });
  const needsCapabilityPolicy = steps.some(
    (step) => (step.requiredCapabilities ?? []).length > 0
  );
  const capabilityPolicy = needsCapabilityPolicy
    ? options.capabilityPolicy ?? loadCapabilityPolicy(root)
    : null;
  const skippedCapabilities = [];
  let blockReadyRan = false;
  for (const step of steps) {
    const preflight = preflightStep(step, capabilities, capabilityPolicy);
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
    const result = runStep(step.command, step.label, root, env);
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
    if (step.label === "block-ready") blockReadyRan = true;
  }
  // block-ready owns verify:static in-process. If it was capability-skipped, run static once here
  // so push still has static coverage — never duplicate when block-ready already ran.
  if (!blockReadyRan && steps.some((s) => s.label === "block-ready")) {
    const staticResult = runStep("node scripts/verify-static.mjs", "verify-static-fallback", root, env);
    if (!staticResult.ok) {
      console.error(
        `branch:precheck-push FAIL category=${staticResult.category} at step: verify-static-fallback`
      );
      if (staticResult.tail) console.error(staticResult.tail);
      return {
        ok: false,
        category: staticResult.category,
        reason: "verify-static-fallback failed (block-ready was capability-skipped)",
        step: "verify-static-fallback",
        tail: staticResult.tail,
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
