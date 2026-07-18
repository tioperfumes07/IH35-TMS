#!/usr/bin/env node
/**
 * OWNER HANDOFF ONLY — apply .github/branch-protection-config.json to main.
 * Automated builders and CI must never apply repository access-control settings.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "ci-apply-branch-protection";
const CONFIG_PATH = path.join(process.cwd(), ".github/branch-protection-config.json");
export const OWNER_AUTHORIZATION_ENV = "JORGE_AUTHORIZED_BRANCH_PROTECTION_APPLY";
export const OWNER_AUTHORIZATION_VALUE = "YES";

export function assertOwnerAuthorization(env = process.env) {
  if (env.CI === "true" || env.GITHUB_ACTIONS === "true") {
    throw new Error("refusing branch-protection apply from CI/build automation");
  }
  if (env[OWNER_AUTHORIZATION_ENV]?.trim() !== OWNER_AUTHORIZATION_VALUE) {
    throw new Error(
      `owner authorization required: set ${OWNER_AUTHORIZATION_ENV}=${OWNER_AUTHORIZATION_VALUE}`
    );
  }
}

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

export async function applyProtection(token, owner, repo, branch, protection) {
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
  assertOwnerAuthorization();
  const token = process.env.GH_ADMIN_TOKEN?.trim();
  if (!token) {
    throw new Error("GH_ADMIN_TOKEN with repository administration permission is required");
  }

  const cfg = loadConfig();
  const [owner, repo] = cfg.repository.split("/");
  const branch = cfg.branch || "main";
  const result = await applyProtection(token, owner, repo, branch, cfg.protection);
  console.log(`[${LABEL}] PASS — protection applied to ${owner}/${repo}:${branch}`);
  console.log(JSON.stringify({ url: result.url, contexts: result.required_status_checks?.contexts }, null, 2));
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(`[${LABEL}] FAIL —`, err.message || err);
    process.exit(1);
  });
}
