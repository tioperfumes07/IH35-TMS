#!/usr/bin/env node
/**
 * verify-cursor-pr-title-prefix.mjs
 *
 * Owner law 2026-08-04: EVERY Cursor PR title MUST begin with "Cursor-".
 * Fails closed when GATE_PR_TITLE is set (PR CI) or branch is cursor/*.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cursor-pr-title-prefix";
const SELFTEST = process.argv.includes("--selftest");
const PREFIX = "Cursor-";

function titleFromEnvOrEvent() {
  if (process.env.GATE_PR_TITLE) return process.env.GATE_PR_TITLE;
  if (process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
    try {
      const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      return String(ev?.pull_request?.title || "");
    } catch {
      return "";
    }
  }
  return "";
}

function currentBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function isCursorBranch(branch) {
  return /^cursor\//i.test(branch || "");
}

export function assertCursorPrTitlePrefix({ title, branch } = {}) {
  const problems = [];
  const t = title ?? titleFromEnvOrEvent();
  const b = branch ?? process.env.GATE_HEAD_REF ?? process.env.GITHUB_HEAD_REF ?? currentBranch();

  // Owner law: Cursor PRs only. Claude/Cascade branches are out of scope.
  if (!isCursorBranch(b)) return problems;

  const titleToCheck = String(t).trim();
  if (!titleToCheck) {
    // Local commits on cursor/* without a PR event: presence/wiring still checked separately.
    if (!process.env.CI && !process.env.GATE_PR_TITLE && !process.env.GITHUB_EVENT_PATH) {
      return problems;
    }
    problems.push("PR title empty on Cursor PR — title must start with Cursor-");
    return problems;
  }

  if (!titleToCheck.startsWith(PREFIX)) {
    problems.push(
      `PR title must begin with "${PREFIX}" (got: ${JSON.stringify(titleToCheck.slice(0, 80))})`,
    );
  }
  return problems;
}

function assertRuleWired(root = ROOT) {
  const problems = [];
  const rule = ".cursor/rules/34-cursor-pr-title-prefix.mdc";
  const abs = path.join(root, rule);
  if (!fs.existsSync(abs)) {
    problems.push(`MISSING ${rule}`);
  } else {
    const body = fs.readFileSync(abs, "utf8");
    if (!/alwaysApply:\s*true/.test(body) || !/Cursor-/.test(body)) {
      problems.push(`${rule}: must be alwaysApply and require Cursor- prefix`);
    }
  }
  const standing = path.join(root, "docs/specs/STANDING-SESSION-DIRECTIVE.md");
  if (fs.existsSync(standing)) {
    const s = fs.readFileSync(standing, "utf8");
    if (!/Cursor-/.test(s) || !/PR title/i.test(s)) {
      problems.push("STANDING-SESSION-DIRECTIVE.md must require Cursor- PR titles");
    }
  } else {
    problems.push("MISSING docs/specs/STANDING-SESSION-DIRECTIVE.md");
  }
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  if (!gitignore.includes("!.cursor/rules/34-cursor-pr-title-prefix.mdc")) {
    problems.push(".gitignore must un-ignore !.cursor/rules/34-cursor-pr-title-prefix.mdc");
  }
  return problems;
}

if (SELFTEST) {
  const good = assertCursorPrTitlePrefix({ title: "Cursor- fix: example", branch: "cursor/foo" });
  const bad = assertCursorPrTitlePrefix({ title: "fix: missing prefix", branch: "cursor/foo" });
  const soft = assertCursorPrTitlePrefix({ title: "Claude- money: ok", branch: "claude/money" });
  if (good.length !== 0 || bad.length < 1 || soft.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { good, bad, soft });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — prefix enforced for Cursor titles`);
  const wired = assertRuleWired();
  if (wired.length) {
    console.error(`${LABEL} SELFTEST FAIL — wiring incomplete`);
    for (const p of wired) console.error(`  - ${p}`);
    process.exit(1);
  }
  process.exit(0);
}

const problems = [...assertCursorPrTitlePrefix(), ...assertRuleWired()];
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Cursor- PR title prefix law present`);
