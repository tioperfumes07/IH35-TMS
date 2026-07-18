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
export const MANDATORY_CHECKS = [
  "required-checks / required-checks-gate",
  "ci / build-typecheck",
  STRICT_FRESHNESS_CONTEXT,
  "perf-budget-check / perf-audit",
  "security-checks / security-audit",
  "premerge-gates / rls-migration-scan",
  "premerge-gates / typescript-strict-null",
  "pass-8-smoke-verify / pass-8",
];

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
  for (const context of expectedContexts) {
    if (!liveContexts.includes(context)) violations.push(`live ruleset missing required context: ${context}`);
  }
  for (const context of MANDATORY_CHECKS) {
    if (!liveContexts.includes(context)) violations.push(`live ruleset missing mandatory context: ${context}`);
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
  if (cfg.protection?.required_status_checks?.strict !== true) {
    console.error(`[${LABEL}] FAIL — required_status_checks.strict must be true`);
    process.exit(1);
  }
  if (contexts.length < 3) {
    console.error(`[${LABEL}] FAIL — required_status_checks.contexts too short`);
    process.exit(1);
  }
  // Hard-fail if any mandatory check is absent from the committed config.
  const missingFromConfig = MANDATORY_CHECKS.filter((c) => !contexts.includes(c));
  if (missingFromConfig.length > 0) {
    console.error(`[${LABEL}] FAIL — branch-protection-config.json missing mandatory checks: ${missingFromConfig.join(", ")}`);
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

async function main() {
  const cfg = assertConfigBaseline();
  const adminToken = process.env.GH_ADMIN_TOKEN?.trim();

  if (!adminToken || process.env.CI !== "true") {
    console.log(`[${LABEL}] PASS (baseline) — config + workflows committed; live API check skipped without admin token in CI`);
    process.exit(0);
  }

  const [owner, repo] = cfg.repository.split("/");
  const branch = cfg.branch || "main";
  const protection = await fetchProtection(adminToken, owner, repo, branch);

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
  console.log(`[${LABEL}] PASS — branch protection active with ${liveContexts.length} required contexts`);
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(`[${LABEL}] FAIL —`, err.message || err);
    process.exit(1);
  });
}
