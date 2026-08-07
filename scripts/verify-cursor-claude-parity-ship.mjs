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
const RULE30 = ".cursor/rules/30-claude-green-evidence-format.mdc";
const GATE = "scripts/money-pr-local-gate.mjs";
const TEMPLATE = "docs/templates/CLAUDE-GREEN-PR-BODY.md";
const BODY_GATE = "scripts/cursor-pr-body-gate.mjs";
const ENTRY_POINTS = [
  "AGENTS.md",
  "docs/CLAUDE.md",
  ".cursor/rules/00-always-read-first.mdc",
  ".claude/skills/ih35-tms-standards/SKILL.md",
];

const REQUIRED_IN_GATE = [
  "verify-definition-of-done-evidence",
  "verify-no-money-theater",
  "verify-section7-palette-financial",
  "verify-section7-palette-nonfinancial",
  "verify-new-auth-routes-rate-limited",
  "verify-migration-lane-band",
  "verify-verify-step-lane-band",
  "verify-no-claimed-numbers-edits",
  "verify-verify-step-claimed-on-main",
  "verify-data-migrations-rehearsed",
  "verify-entity-link-adoption",
  "verify-no-guard-file-deletion",
  "verify-claude-green-evidence-shape",
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
    if (!/nonfinancial|palette-nonfinancial|§7 nonfinancial/i.test(rule)) {
      problems.push(`${RULE29}: must name §7 nonfinancial palette (Cursor #4198 thrash class).`);
    }
    if (!/rateLimit|rate-limit|missing-rate-limiting/i.test(rule)) {
      problems.push(`${RULE29}: must name auth route rateLimit / CodeQL missing-rate-limiting.`);
    }
    if (!/cursor-ship-preflight/i.test(rule)) {
      problems.push(`${RULE29}: must name scripts/ops/cursor-ship-preflight.mjs before gh pr create.`);
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
    if (!/Rule 30|claude-green-evidence|CLAUDE-GREEN-PR-BODY/i.test(src)) {
      problems.push(
        `${rel}: must reference Rule 30 / claude-green-evidence / CLAUDE-GREEN-PR-BODY (2026-08-02 permanent).`,
      );
    }
  }

  if (!get(RULE30)) {
    problems.push(`${RULE30}: missing — Rule 30 Claude-green evidence format is permanent law.`);
  } else if (!/FINDING|soft-reset|cursor-pr-body-gate/i.test(get(RULE30))) {
    problems.push(`${RULE30}: must name FINDING-first / soft-reset ban / cursor-pr-body-gate.`);
  }

  if (!get(TEMPLATE)) {
    problems.push(`${TEMPLATE}: missing — copy-paste Claude-green body required.`);
  }
  if (!get(BODY_GATE)) {
    problems.push(`${BODY_GATE}: missing — local PR-body gate before gh pr create required.`);
  }

  return problems;
}

if (SELFTEST) {
  const files = [RULE29, RULE30, GATE, TEMPLATE, BODY_GATE, ...ENTRY_POINTS];
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
  expectCaught("rule30-deleted", { ...live, [RULE30]: "" }, RULE30);
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
  expectCaught(
    "gate-no-rule30-deletion-check",
    {
      ...live,
      [GATE]: live[GATE].replace(/verify-no-guard-file-deletion/g, "verify-something-else"),
    },
    "verify-no-guard-file-deletion",
  );
  expectCaught("agents-omit", { ...live, "AGENTS.md": "# no pointer\n" }, "AGENTS.md");
  expectCaught("template-missing", { ...live, [TEMPLATE]: "" }, TEMPLATE);

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
