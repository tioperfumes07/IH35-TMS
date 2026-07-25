#!/usr/bin/env node
/**
 * verify-law-of-the-land-autoload-pointer.mjs
 *
 * Ensures every agent autoload entry point references the consolidated
 * Law of the Land index (docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const POINTER =
  "docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md — the complete 24-rule + 18-key-gate map (source .cursor/rule wins on conflict).";

const TARGETS = [
  ".cursor/rules/00-always-read-first.mdc",
  "docs/CLAUDE.md",
  "AGENTS.md",
];

const failures = [];

for (const rel of TARGETS) {
  const filePath = path.join(ROOT, rel);
  if (!fs.existsSync(filePath)) {
    failures.push(`MISSING file: ${rel}`);
    continue;
  }
  const body = fs.readFileSync(filePath, "utf8");
  if (!body.includes(POINTER)) {
    failures.push(`Consolidated index pointer missing in ${rel}`);
  }
}

const indexPath = path.join(ROOT, "docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md");
if (!fs.existsSync(indexPath)) {
  failures.push("MISSING consolidated index: docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md");
}

const skillPath = path.join(ROOT, ".claude/skills/ih35-tms-standards/SKILL.md");
if (fs.existsSync(skillPath)) {
  const skill = fs.readFileSync(skillPath, "utf8");
  if (!skill.includes("## §11") || !skill.includes("## §12")) {
    failures.push("ih35-tms-standards SKILL.md missing §11 or §12");
  }
} else {
  failures.push("MISSING skill: .claude/skills/ih35-tms-standards/SKILL.md");
}

if (failures.length) {
  console.error("verify-law-of-the-land-autoload-pointer FAIL:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `verify-law-of-the-land-autoload-pointer PASS — pointer present in ${TARGETS.length} autoload entry points + index + SKILL §11/§12.`
);
