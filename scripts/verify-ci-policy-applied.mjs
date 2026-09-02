#!/usr/bin/env node
/**
 * CLOSURE-22 two-stage verifier:
 *   1. Every caller validates the exact committed owner-approved baseline.
 *   2. Live protection is read only when GH_ADMIN_TOKEN is explicitly present.
 *
 * FIX(ci): Previously exited 0 (success) when live branch protection was missing required
 * contexts or not applied at all, allowing red PRs to merge (#729 post-mortem).
 * Now exits 1 (hard-fail) for both conditions when an admin token is available in CI.
 *
 * Standard Actions GITHUB_TOKEN and GH_TOKEN are intentionally never used for protection reads.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STRICT_FRESHNESS_CONTEXT = "ci / verify-branch-fresh";
export const REQUIRED_GATE_CONTEXTS = [
  "required-checks / required-checks-gate",
  "ci / build-typecheck",
  STRICT_FRESHNESS_CONTEXT,
  "hold-merge-gate / hold-merge-gate",
  "locked-guards / locked-guards",
  // Owner decision 2026-07-18: security-audit is KEPT as a required merge gate
  // (security must never be advisory). Only perf-audit / pass-8 / pr-preview-smoke
  // are dropped from the required set.
  "security-checks / security-audit",
  "premerge-gates / rls-migration-scan",
  "premerge-gates / typescript-strict-null",
  "premerge-gates / migration-role-validation",
  // Owner 2026-09-02: J1 ratchet must be its own required check. Step 10230 inside
  // verify:pre-commit did not stop #19609 (A1 InterchangeTrailerPicker) from landing
  // six new raw sizes and a trapping EntityPicker while build-typecheck was already red.
  "ui-design-system-ratchet / ui-design-system-ratchet",
];
export const MANDATORY_CHECKS = REQUIRED_GATE_CONTEXTS;
export const BASELINE_ONLY_MESSAGE =
  "BASELINE PASS — LIVE UNVERIFIED, owner handoff required";

const LABEL = "verify-ci-policy-applied";
const CONFIG_PATH = path.join(process.cwd(), ".github/branch-protection-config.json");

export function evaluateProtectionDrift(expectedProtection, liveProtection) {
  const violations = [];
  if (expectedProtection.required_status_checks?.strict !== true) {
    violations.push("committed config must set required_status_checks.strict=true");
  }
  if (!liveProtection) {
    violations.push("live branch protection is not applied");
    return violations;
  }
  if (liveProtection.required_status_checks?.strict !== true) {
    violations.push("live branch protection strict freshness is disabled");
  }
  const expectedContexts = expectedProtection.required_status_checks?.contexts ?? [];
  const liveContexts = liveProtection.required_status_checks?.contexts ?? [];
  for (const context of REQUIRED_GATE_CONTEXTS) {
    if (!liveContexts.includes(context)) violations.push(`live ruleset missing mandatory context: ${context}`);
  }
  for (const context of liveContexts) {
    if (!expectedContexts.includes(context)) {
      violations.push(`live ruleset has non-approved required context: ${context}`);
    }
  }

  const liveReviews = liveProtection.required_pull_request_reviews;
  if (liveReviews?.required_approving_review_count !== 1) {
    violations.push("live branch protection must require exactly one approval");
  }
  if (liveReviews?.require_code_owner_reviews !== true) {
    violations.push("live branch protection must require code-owner review");
  }
  if (liveReviews?.dismiss_stale_reviews !== true) {
    violations.push("live branch protection must dismiss stale reviews");
  }
  const enabled = (value) => (typeof value === "boolean" ? value : value?.enabled);
  if (enabled(liveProtection.enforce_admins) !== true) {
    violations.push("live branch protection must enforce administrators");
  }
  if (enabled(liveProtection.required_conversation_resolution) !== true) {
    violations.push("live branch protection must require conversation resolution");
  }
  if (enabled(liveProtection.allow_force_pushes) !== false) {
    violations.push("live branch protection must disallow force pushes");
  }
  if (enabled(liveProtection.allow_deletions) !== false) {
    violations.push("live branch protection must disallow deletions");
  }
  return violations;
}

export function assertConfigBaseline() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[${LABEL}] FAIL — missing ${CONFIG_PATH}`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const contexts = cfg.protection?.required_status_checks?.contexts ?? [];
  const reviews = cfg.protection?.required_pull_request_reviews;
  if (cfg.protection?.required_status_checks?.strict !== true) {
    console.error(`[${LABEL}] FAIL — required_status_checks.strict must be true`);
    process.exit(1);
  }
  if (
    contexts.length !== REQUIRED_GATE_CONTEXTS.length ||
    contexts.some((context, index) => context !== REQUIRED_GATE_CONTEXTS[index])
  ) {
    console.error(
      `[${LABEL}] FAIL — required_status_checks.contexts must equal the ${REQUIRED_GATE_CONTEXTS.length} owner-approved universal gates`
    );
    process.exit(1);
  }
  if (
    reviews?.required_approving_review_count !== 1 ||
    reviews?.dismiss_stale_reviews !== true ||
    reviews?.require_code_owner_reviews !== true ||
    cfg.protection?.enforce_admins !== true ||
    cfg.protection?.required_conversation_resolution !== true ||
    cfg.protection?.allow_force_pushes !== false ||
    cfg.protection?.allow_deletions !== false
  ) {
    console.error(`[${LABEL}] FAIL — committed branch-protection controls drift from owner policy`);
    process.exit(1);
  }
  for (const file of [".github/CODEOWNERS", ".github/workflows/required-checks.yml", ".github/workflows/deploy-approval.yml"]) {
    if (!fs.existsSync(path.join(process.cwd(), file))) {
      console.error(`[${LABEL}] FAIL — missing ${file}`);
      process.exit(1);
    }
  }
  return cfg;
}

export async function fetchProtection(token, owner, repo, branch, fetchImpl = fetch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/branches/${branch}/protection`;
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

export function selectProtectionReadToken(env = process.env) {
  const value = env.GH_ADMIN_TOKEN?.trim();
  return value ? { name: "GH_ADMIN_TOKEN", value } : null;
}

export function baselineOnlyOutcome() {
  return {
    baselinePassed: true,
    liveVerified: false,
    message: BASELINE_ONLY_MESSAGE,
  };
}

export async function verifyLiveProtection(cfg, token, fetchImpl = fetch) {
  const [owner, repo] = cfg.repository.split("/");
  const branch = cfg.branch || "main";
  const protection = await fetchProtection(token, owner, repo, branch, fetchImpl);

  if (!protection) {
    throw new Error(`GitHub API 404: branch protection not applied on ${owner}/${repo}:${branch}`);
  }

  const drift = evaluateProtectionDrift(cfg.protection, protection);
  if (drift.length > 0) {
    throw new Error(`live branch protection drift: ${drift.join("; ")}`);
  }

  return {
    baselinePassed: true,
    liveVerified: true,
    message: `LIVE PASS — ${liveProtectionContextCount(protection)} owner-approved contexts verified`,
  };
}

function liveProtectionContextCount(protection) {
  return protection.required_status_checks?.contexts?.length ?? 0;
}

async function main() {
  const cfg = assertConfigBaseline();
  const selectedToken = selectProtectionReadToken();

  if (!selectedToken) {
    console.log(`[${LABEL}] ${baselineOnlyOutcome().message}`);
    return;
  }

  const outcome = await verifyLiveProtection(cfg, selectedToken.value);
  console.log(`[${LABEL}] ${outcome.message} via ${selectedToken.name}`);
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(`[${LABEL}] FAIL —`, err.message || err);
    process.exit(1);
  });
}
