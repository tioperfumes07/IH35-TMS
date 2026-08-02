#!/usr/bin/env node
/**
 * GUARD: Rule 29 — Cursor ships like Claude (expanded fail-fast local gate).
 *
 * Fails if:
 *   - .cursor/rules/29-cursor-claude-parity-ship.mdc missing / does not name money-pr-local-gate
 *   - scripts/money-pr-local-gate.mjs drops any of the Claude-parity fail-fast suite
 *   - AGENTS.md / 00-always-read-first / CLAUDE.md / ih35-tms-standards omit Rule 29
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cursor-claude-parity-ship";
const SELFTEST = process.argv.includes("--selftest");

const RULE29 = ".cursor/rules/29-cursor-claude-parity-ship.mdc";
const GATE = "scripts/money-pr-local-gate.mjs";
const ENTRY_POINTS = [
  "AGENTS.md",
  "docs/CLAUDE.md",
  ".cursor/rules/00-always-read-first.mdc",
  ".claude/skills/ih35-tms-standards/SKILL.md",
];

const REQUIRED_IN_GATE = [
  "verify-definition-of-done-evidence",
  "verify-no-money-theater",
  "verify-migration-lane-band",
  "verify-verify-step-lane-band",
  "verify-no-claimed-numbers-edits",
  "verify-data-migrations-rehearsed",
  "verify-entity-link-adoption",
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertCursorClaudeParityShip(sources) {
  const problems = [];
  const get = (rel) => sources?.[rel] ?? (fs.existsSync(path.join(ROOT, rel)) ? read(rel) : "");

  const rule = get(RULE29);
  if (!rule) {
    problems.push(`${RULE29}: missing — Rule 29 alwaysApply Cursor=Claude ship parity required.`);
  } else {
    if (!/money-pr-local-gate/i.test(rule)) {
      problems.push(`${RULE29}: must name money-pr-local-gate (mechanical tooth).`);
    }
    if (!/--no-verify/i.test(rule)) {
      problems.push(`${RULE29}: must forbid git --no-verify (root cause of Cursor CI thrash).`);
    }
    if (!/HH 12|HH 12–23|afternoon/i.test(rule)) {
      problems.push(`${RULE29}: must name Cursor migration HH 12–23 band.`);
    }
    if (!/EVEN/i.test(rule)) {
      problems.push(`${RULE29}: must name Cursor EVEN verify-step band.`);
    }
  }

  const gate = get(GATE);
  if (!gate) {
    problems.push(`${GATE}: missing — fail-fast pre-push gate required.`);
  } else {
    for (const needle of REQUIRED_IN_GATE) {
      if (!gate.includes(needle)) {
        problems.push(`${GATE}: must invoke ${needle} (Rule 29 Claude-parity suite).`);
      }
    }
  }

  for (const rel of ENTRY_POINTS) {
    const src = get(rel);
    if (!/Rule 29|cursor-claude-parity|1998/i.test(src)) {
      problems.push(
        `${rel}: must reference Rule 29 / cursor-claude-parity / 1998 so the law autoloads.`,
      );
    }
  }

  return problems;
}

if (SELFTEST) {
  const files = [RULE29, GATE, ...ENTRY_POINTS];
  const live = Object.fromEntries(
    files.map((rel) => {
      try {
        return [rel, read(rel)];
      } catch {
        return [rel, ""];
      }
    }),
  );
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    const problems = assertCursorClaudeParityShip(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught("rule29-deleted", { ...live, [RULE29]: "" }, RULE29);
  expectCaught(
    "gate-no-migration-band",
    {
      ...live,
      [GATE]: live[GATE].replace(/verify-migration-lane-band/g, "verify-something-else"),
    },
    "verify-migration-lane-band",
  );
  expectCaught(
    "gate-no-entity-link",
    {
      ...live,
      [GATE]: live[GATE].replace(/verify-entity-link-adoption/g, "verify-something-else"),
    },
    "verify-entity-link-adoption",
  );
  expectCaught("agents-omit", { ...live, "AGENTS.md": "# no pointer\n" }, "AGENTS.md");

  const liveProblems = assertCursorClaudeParityShip();
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertCursorClaudeParityShip();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — Rule 29 + expanded money-pr-local-gate Claude-parity suite + autoload pointers`,
);
process.exit(0);
