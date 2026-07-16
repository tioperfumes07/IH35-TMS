#!/usr/bin/env node
/**
 * verify-session-law-autoload.mjs
 *
 * Ensures the always-apply Cursor session-law files are PRESENT in git and
 * marked alwaysApply: true — so every clone/worktree/session loads Rule #0,
 * Law of the Land, architecture tab law, and never-delete.
 *
 * Regression this catches: `.gitignore` once ignored all of `.cursor/rules/`,
 * so 06/07 existed only on one machine's disk and never auto-loaded elsewhere.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULES_DIR = path.join(ROOT, ".cursor", "rules");

const REQUIRED = [
  "00-always-read-first.mdc",
  "01-spec-sources.mdc",
  "02-respond-before-code.mdc",
  "03-display-ids.mdc",
  "04-locked-invariants.mdc",
  "05-architectural-design-is-law.mdc",
  "06-quality-hardline-and-law.mdc",
  "07-never-delete-only-add.mdc",
  "dual-lane-never-idle.mdc",
];

const REQUIRED_DOCS = [
  "docs/specs/QUALITY-STANDARD-LOCKED.md",
  "docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md",
  "docs/specs/IH35_ARCHITECTURAL_DESIGN.md",
];

const failures = [];

for (const name of REQUIRED) {
  const filePath = path.join(RULES_DIR, name);
  if (!fs.existsSync(filePath)) {
    failures.push(`MISSING file: .cursor/rules/${name}`);
    continue;
  }
  const body = fs.readFileSync(filePath, "utf8");
  if (!/^---[\s\S]*?alwaysApply:\s*true[\s\S]*?---/m.test(body)) {
    failures.push(`alwaysApply: true missing in .cursor/rules/${name}`);
  }
  try {
    const tracked = execSync(`git -C "${ROOT}" ls-files --error-unmatch -- ".cursor/rules/${name}"`, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!String(tracked).trim()) {
      failures.push(`NOT git-tracked: .cursor/rules/${name} (session law must be in git)`);
    }
  } catch {
    failures.push(`NOT git-tracked: .cursor/rules/${name} (session law must be in git — check .gitignore negations)`);
  }
}

for (const rel of REQUIRED_DOCS) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    failures.push(`MISSING canonical doc: ${rel}`);
  }
}

const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
if (!gitignore.includes("!.cursor/rules/06-quality-hardline-and-law.mdc")) {
  failures.push(".gitignore must un-ignore !.cursor/rules/06-quality-hardline-and-law.mdc");
}
if (!gitignore.includes("!.cursor/rules/07-never-delete-only-add.mdc")) {
  failures.push(".gitignore must un-ignore !.cursor/rules/07-never-delete-only-add.mdc");
}

if (failures.length) {
  console.error("verify-session-law-autoload FAIL:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `verify-session-law-autoload PASS — ${REQUIRED.length} alwaysApply rules tracked + Rule #0 / Law of the Land docs present.`
);
