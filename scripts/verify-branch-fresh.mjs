#!/usr/bin/env node
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_MAX_COMMITS_BEHIND = 5;
const ALLOWLIST_PATHS = [
  "scripts/verify-pre-commit.mjs",
  "scripts/verify-architectural-design.ts",
  "scripts/lib/known-prod-table-grants.mjs",
  "scripts/lib/known-prod-grants",
  "apps/backend/src/accounting/index.ts",
  "apps/frontend/src/App.tsx",
  "apps/frontend/src/pages/accounting/AccountingSubNav.tsx",
];

function run(command) {
  return execSync(command, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();
}

function fail(message) {
  console.error(`verify:branch-fresh FAIL: ${message}`);
  process.exit(1);
}

export function resolveBaseSha(cliArgs = process.argv.slice(2)) {
  const cliBaseIdx = cliArgs.indexOf("--base-sha");
  const resolved =
    (cliBaseIdx >= 0 ? cliArgs[cliBaseIdx + 1] : undefined) ??
    process.env.BRANCH_FRESH_BASE_SHA ??
    process.env.GITHUB_BASE_SHA ??
    process.env.PR_BASE_SHA;
  if (resolved) return resolved;
  try {
    const inferred = run("git rev-parse origin/main");
    process.env.GITHUB_BASE_SHA = inferred;
    console.warn(
      "[verify:branch-fresh] GITHUB_BASE_SHA inferred from origin/main (no CI env detected)"
    );
    return inferred;
  } catch {
    return undefined;
  }
}

export function verifyBranchFresh(cliArgs = process.argv.slice(2)) {
  const argMainRefIdx = cliArgs.indexOf("--main-ref");
  const argMaxIdx = cliArgs.indexOf("--max-commits");
  const baseSha = resolveBaseSha(cliArgs);
  const mainRef = (argMainRefIdx >= 0 ? cliArgs[argMainRefIdx + 1] : undefined) ?? "origin/main";
  const maxBehind = Number(
    (argMaxIdx >= 0 ? cliArgs[argMaxIdx + 1] : undefined) ??
      process.env.BRANCH_FRESH_MAX ??
      DEFAULT_MAX_COMMITS_BEHIND
  );

  if (!baseSha) {
    fail("missing base SHA (set GITHUB_BASE_SHA or pass --base-sha)");
  }
  if (!Number.isFinite(maxBehind) || maxBehind < 0) {
    fail(`invalid max commits threshold: ${String(maxBehind)}`);
  }

  try {
    run("git fetch origin main");
  } catch {
    // Fall through and let rev-list command surface the failure.
  }

  let behindCount = 0;
  try {
    const pathArgs = ALLOWLIST_PATHS.map((p) => `"${p}"`).join(" ");
    const output = run(`git rev-list --count ${baseSha}..${mainRef} -- ${pathArgs}`);
    behindCount = Number(output || "0");
    if (!Number.isFinite(behindCount)) {
      fail(`could not parse behind count from: ${output}`);
    }
  } catch (error) {
    fail((error instanceof Error ? error.message : String(error)).trim());
  }

  if (behindCount > maxBehind) {
    fail(
      `base ${baseSha} is ${behindCount} allowlist commits behind ${mainRef}; maximum allowed is ${maxBehind}`
    );
  }

  console.log(
    `verify:branch-fresh OK (base=${baseSha} behind=${behindCount} threshold=${maxBehind} ref=${mainRef})`
  );
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  verifyBranchFresh();
}
