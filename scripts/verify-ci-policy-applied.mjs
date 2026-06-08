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

const MANDATORY_CHECKS = [
  "required-checks / required-checks-gate",
  "ci / build-typecheck",
  "perf-budget-check / perf-audit",
  "security-checks / security-audit",
  "premerge-gates / rls-migration-scan",
  "premerge-gates / typescript-strict-null",
  "pass-8-smoke-verify / pass-8",
];

const LABEL = "verify-ci-policy-applied";
const CONFIG_PATH = path.join(process.cwd(), ".github/branch-protection-config.json");

function assertConfigBaseline() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[${LABEL}] FAIL — missing ${CONFIG_PATH}`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const contexts = cfg.protection?.required_status_checks?.contexts ?? [];
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

  const liveContexts = protection.required_status_checks?.contexts ?? [];
  const expected = cfg.protection.required_status_checks.contexts;
  const missing = expected.filter((c) => !liveContexts.includes(c));
  if (missing.length > 0) {
    // Previously exited 0 here — that was the bug that let #729 merge with red checks.
    console.error(`[${LABEL}] FAIL — live branch protection missing required contexts: ${missing.join(", ")}`);
    console.error(`[${LABEL}] Run: node scripts/ci-apply-branch-protection.mjs`);
    process.exit(1);
  }

  // Also verify all mandatory checks are enforced live.
  const missingMandatory = MANDATORY_CHECKS.filter((c) => !liveContexts.includes(c));
  if (missingMandatory.length > 0) {
    console.error(`[${LABEL}] FAIL — live branch protection missing MANDATORY checks: ${missingMandatory.join(", ")}`);
    process.exit(1);
  }

  console.log(`[${LABEL}] PASS — branch protection active with ${liveContexts.length} required contexts`);
}

main().catch((err) => {
  console.error(`[${LABEL}] FAIL —`, err.message || err);
  process.exit(1);
});
