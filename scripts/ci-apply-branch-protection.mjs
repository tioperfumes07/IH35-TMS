#!/usr/bin/env node
/**
 * CLOSURE-22 — apply .github/branch-protection-config.json to main via GitHub API.
 * Run once after merge (requires GH_ADMIN_TOKEN or GITHUB_TOKEN with admin:repo).
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "ci-apply-branch-protection";
const CONFIG_PATH = path.join(process.cwd(), ".github/branch-protection-config.json");

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

async function applyProtection(token, owner, repo, branch, protection) {
  const url = `https://api.github.com/repos/${owner}/${repo}/branches/${branch}/protection`;
  const body = {
    required_pull_request_reviews: protection.required_pull_request_reviews,
    required_status_checks: protection.required_status_checks,
    enforce_admins: protection.enforce_admins ?? false,
    required_conversation_resolution: protection.required_conversation_resolution ?? true,
    restrictions: protection.restrictions,
    allow_force_pushes: protection.allow_force_pushes ?? false,
    allow_deletions: protection.allow_deletions ?? false,
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  const token = process.env.GH_ADMIN_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    console.log(`[${LABEL}] SKIP — set GH_ADMIN_TOKEN to apply branch protection to remote`);
    process.exit(0);
  }

  const cfg = loadConfig();
  const [owner, repo] = cfg.repository.split("/");
  const branch = cfg.branch || "main";
  const result = await applyProtection(token, owner, repo, branch, cfg.protection);
  console.log(`[${LABEL}] PASS — protection applied to ${owner}/${repo}:${branch}`);
  console.log(JSON.stringify({ url: result.url, contexts: result.required_status_checks?.contexts }, null, 2));
}

main().catch((err) => {
  console.error(`[${LABEL}] FAIL —`, err.message || err);
  process.exit(1);
});
