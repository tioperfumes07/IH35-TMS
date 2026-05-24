#!/usr/bin/env node
import { execSync } from "node:child_process";

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

const args = process.argv.slice(2);
const argBaseIdx = args.indexOf("--base-sha");
const argMainRefIdx = args.indexOf("--main-ref");
const argMaxIdx = args.indexOf("--max-commits");

const baseSha =
  (argBaseIdx >= 0 ? args[argBaseIdx + 1] : undefined) ??
  process.env.BRANCH_FRESH_BASE_SHA ??
  process.env.GITHUB_BASE_SHA ??
  process.env.PR_BASE_SHA;
const mainRef = (argMainRefIdx >= 0 ? args[argMainRefIdx + 1] : undefined) ?? "origin/main";
const maxBehind = Number((argMaxIdx >= 0 ? args[argMaxIdx + 1] : undefined) ?? process.env.BRANCH_FRESH_MAX ?? DEFAULT_MAX_COMMITS_BEHIND);

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
