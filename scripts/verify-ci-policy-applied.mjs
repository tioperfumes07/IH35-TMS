#!/usr/bin/env node
/**
 * CLOSURE-22 CI guard — branch protection config present; live API check when admin token set.
 *
 * FIX(ci): Previously exited 0 (success) when live branch protection was missing required
 * contexts or not applied at all, allowing red PRs to merge (#729 post-mortem).
 * Now exits 1 (hard-fail) for both conditions when an admin token is available in CI.
 *
 * MANDATORY_CHECKS: These check names MUST be present in branch-protection-config.json
 * AND in GitHub's live branch protection. Any omission is a gate failure.
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
  "premerge-gates / rls-migration-scan",
  "premerge-gates / typescript-strict-null",
  "premerge-gates / migration-role-validation",
];
export const MANDATORY_CHECKS = REQUIRED_GATE_CONTEXTS;

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
      `[${LABEL}] FAIL — required_status_checks.contexts must equal the eight owner-approved universal gates`
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

async function fetchProtection(token, owner, repo, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/branches/${branch}/protection`;
  const res = await fetch(url, {
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
  for (const name of ["GH_ADMIN_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"]) {
    const value = env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

export function missingProtectionTokenOutcome(ci = process.env.CI === "true") {
  return ci
    ? {
        blocking: true,
        message:
          "BLOCKED-UNVERIFIED — CI has no GH_ADMIN_TOKEN, GITHUB_TOKEN, or GH_TOKEN to read live branch protection",
      }
    : {
        blocking: false,
        message:
          "UNVERIFIED (local) — no GitHub token available; committed baseline passed but live enforcement was not checked",
      };
}

async function main() {
  const cfg = assertConfigBaseline();
  const selectedToken = selectProtectionReadToken();

  if (!selectedToken) {
    const outcome = missingProtectionTokenOutcome();
    const message = `[${LABEL}] ${outcome.message}`;
    if (outcome.blocking) throw new Error(message);
    console.warn(message);
    return;
  }

  const [owner, repo] = cfg.repository.split("/");
  const branch = cfg.branch || "main";
  const protection = await fetchProtection(selectedToken.value, owner, repo, branch);

  if (!protection) {
    // Branch protection not applied at all — hard-fail so no PR can slip through.
    console.error(
      `[${LABEL}] FAIL — branch protection not applied on ${owner}/${repo}:${branch}; run node scripts/ci-apply-branch-protection.mjs`
    );
    process.exit(1);
  }

  const drift = evaluateProtectionDrift(cfg.protection, protection);
  if (drift.length > 0) {
    console.error(`[${LABEL}] FAIL — live branch protection drift: ${drift.join("; ")}`);
    console.error(`[${LABEL}] OWNER HANDOFF: review then run node scripts/ci-apply-branch-protection.mjs`);
    process.exit(1);
  }

  const liveContexts = protection.required_status_checks?.contexts ?? [];
  console.log(
    `[${LABEL}] PASS — live branch protection verified via ${selectedToken.name} with ${liveContexts.length} required contexts`
  );
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(`[${LABEL}] FAIL —`, err.message || err);
    process.exit(1);
  });
}
