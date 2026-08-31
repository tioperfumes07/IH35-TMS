#!/usr/bin/env node
/**
 * Detect whether a PR (or push) is doc/bus-only — no apps/packages/scripts/db/.github code.
 *
 * Used by CI to short-circuit the heavy matrix while still reporting required checks green
 * (never workflow-level paths-ignore on required jobs — that leaves PRs stuck "Expected").
 *
 * Usage:
 *   node scripts/ci-detect-doc-only.mjs
 *     → prints doc_only=true|false
 *     → also writes to $GITHUB_OUTPUT when set
 *
 * Exit 0 always (detection itself must not fail the job).
 */
import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DOC_ONLY_PREFIXES = [
  "docs/",
  ".block-ready/",
  ".cursor/",
  "claude/",
  ".claude/",
  ".windsurf/",
];

const DOC_ONLY_EXACT = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "LICENSE",
  "LICENSE.md",
]);

function run(cmd) {
  const r = spawnSync("bash", ["-lc", cmd], { encoding: "utf8" });
  return (r.stdout || "").trim();
}

function isDocOnlyPath(p) {
  if (!p) return true;
  if (DOC_ONLY_EXACT.has(p)) return true;
  if (p.endsWith(".md") && !p.startsWith("apps/") && !p.startsWith("packages/") && !p.startsWith("scripts/")) {
    return true;
  }
  return DOC_ONLY_PREFIXES.some((prefix) => p.startsWith(prefix));
}

function changedFiles() {
  const event = process.env.GITHUB_EVENT_NAME || "";
  if (event === "push" && (process.env.GITHUB_REF || "").endsWith("/main")) {
    // Never short-circuit pushes to main — post-merge verification stays full.
    return ["__force_code__"];
  }

  const base = process.env.GITHUB_BASE_SHA || process.env.GITHUB_EVENT_PULL_REQUEST_BASE_SHA || "";
  const head = process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || "HEAD";

  let range;
  if (base) {
    range = `${base}...${head}`;
  } else {
    // Local / fallback: vs origin/main
    try {
      run("git rev-parse --verify origin/main");
      range = `origin/main...HEAD`;
    } catch {
      range = "HEAD~1...HEAD";
    }
  }

  const out = run(`git diff --name-only ${range}`);
  if (!out) {
    // Empty diff → treat as doc-only (nothing to build)
    return [];
  }
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

const files = changedFiles();
const docOnly = files.length === 0 || files.every(isDocOnlyPath);
const value = docOnly ? "true" : "false";

process.stdout.write(`doc_only=${value}\n`);
process.stdout.write(`changed_count=${files.length}\n`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `doc_only=${value}\n`);
}

process.exit(0);
