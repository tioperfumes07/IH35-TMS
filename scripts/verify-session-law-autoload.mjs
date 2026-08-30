#!/usr/bin/env node
/**
 * verify-session-law-autoload.mjs
 *
 * Ensures the always-apply Cursor session-law files are PRESENT in git and
 * marked alwaysApply: true — so every clone/worktree/session loads the
 * Operating Constitution companions (00–07, 10–15), Rule #0, and Law of the Land.
 *
 * Regression this catches: `.gitignore` once ignored all of `.cursor/rules/`,
 * so quality/constitution rules existed only on one machine's disk.
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
  "10-verification-and-neon-rls.mdc",
  "11-multi-agent-orchestration.mdc",
  "12-model-tiering.mdc",
  "13-financial-and-accounting-law.mdc",
  "14-linkage-law-enforcement.mdc",
  "15-research-mandate.mdc",
  "16-fix-not-patch-evidence-law.mdc",
  "dual-lane-never-idle.mdc",
];

const REQUIRED_DOCS = [
  "docs/specs/CURSOR-OPERATING-CONSTITUTION.md",
  "docs/specs/QUALITY-STANDARD-LOCKED.md",
  "docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md",
  "docs/specs/IH35_ARCHITECTURAL_DESIGN.md",
  "docs/specs/STANDING-SESSION-DIRECTIVE.md",
  "docs/specs/OWNER-QUALITY-COMPACT.md",
  "docs/specs/DELIVERY-METHOD-LOCKED.md",
  "docs/templates/ACCEPTANCE-EVIDENCE-BLOCK.md",
  ".claude/skills/ih35-evidence-before-done/SKILL.md",
];

const failures = [];

function hasAlwaysApply(body) {
  return /^---[\s\S]*?alwaysApply:\s*true[\s\S]*?---/m.test(body);
}

if (process.argv.includes("--selftest")) {
  const valid = "---\nalwaysApply: true\n---\n# Session law\n";
  const plantedDefect = valid.replace("alwaysApply: true", "alwaysApply: false");
  if (!hasAlwaysApply(valid) || hasAlwaysApply(plantedDefect)) {
    console.error("verify-session-law-autoload SELFTEST FAIL — planted alwaysApply defect escaped");
    process.exit(1);
  }
  console.log("verify-session-law-autoload SELFTEST PASS — planted alwaysApply defect rejected");
  process.exit(0);
}

for (const name of REQUIRED) {
  const filePath = path.join(RULES_DIR, name);
  if (!fs.existsSync(filePath)) {
    failures.push(`MISSING file: .cursor/rules/${name}`);
    continue;
  }
  const body = fs.readFileSync(filePath, "utf8");
  if (!hasAlwaysApply(body)) {
    failures.push(`alwaysApply: true missing in .cursor/rules/${name}`);
  }
  try {
    const tracked = execSync(`git -C "${ROOT}" ls-files --error-unmatch -- ".cursor/rules/${name}"`, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!String(tracked).trim()) {
      failures.push(`NOT git-tracked: .cursor/rules/${name}`);
    }
  } catch {
    failures.push(
      `NOT git-tracked: .cursor/rules/${name} (session law must be in git — check .gitignore negations)`
    );
  }
}

for (const rel of REQUIRED_DOCS) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    failures.push(`MISSING canonical doc: ${rel}`);
  }
}

const constitution = fs.readFileSync(
  path.join(ROOT, "docs/specs/CURSOR-OPERATING-CONSTITUTION.md"),
  "utf8"
);
if (!constitution.includes("THE HARDLINE") || !constitution.includes("QuickBooks")) {
  failures.push("CURSOR-OPERATING-CONSTITUTION.md looks truncated or wrong");
}

if (failures.length) {
  console.error("verify-session-law-autoload FAIL:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `verify-session-law-autoload PASS — ${REQUIRED.length} alwaysApply rules tracked + constitution / Rule #0 / Law of the Land present.`
);
