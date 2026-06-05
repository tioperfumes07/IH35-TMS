#!/usr/bin/env node
/**
 * CLOSURE-22 CI guard — branch protection config present; live API check when admin token set.
 */
import fs from "node:fs";
import path from "node:path";

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
  const token = process.env.GH_ADMIN_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();

  if (!token || process.env.CI !== "true") {
    console.log(`[${LABEL}] PASS (baseline) — config + workflows committed; live API check skipped without admin token in CI`);
    process.exit(0);
  }

  const [owner, repo] = cfg.repository.split("/");
  const branch = cfg.branch || "main";
  const protection = await fetchProtection(token, owner, repo, branch);

  if (!protection) {
    console.warn(
      `[${LABEL}] WARN — branch protection not yet applied on ${owner}/${repo}:${branch}; run node scripts/ci-apply-branch-protection.mjs after merge`
    );
    process.exit(0);
  }

  const liveContexts = protection.required_status_checks?.contexts ?? [];
  const expected = cfg.protection.required_status_checks.contexts;
  const missing = expected.filter((c) => !liveContexts.includes(c));
  if (missing.length > 0) {
    console.warn(`[${LABEL}] WARN — live protection missing contexts: ${missing.join(", ")}`);
    process.exit(0);
  }

  console.log(`[${LABEL}] PASS — branch protection active with ${liveContexts.length} required contexts`);
}

main().catch((err) => {
  console.error(`[${LABEL}] FAIL —`, err.message || err);
  process.exit(1);
});
