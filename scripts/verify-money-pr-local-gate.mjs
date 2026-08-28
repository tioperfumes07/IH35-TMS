#!/usr/bin/env node
/**
 * GUARD: Rule 25 one-push / fail-fast money gate stays wired permanently.
 *
 * Fails if:
 *   - .cursor/rules/25-one-push-money-fail-fast.mdc missing
 *   - scripts/money-pr-local-gate.mjs missing or no longer runs DoD + money-theater
 *   - branch-precheck-push first step is not money-pr-local-gate
 *   - check-commit-evidence no longer falls back to HEAD on empty staged (amend hole)
 *   - AGENTS.md / 00-always-read-first / CLAUDE.md / ih35-tms-standards omit Rule 25 / money-pr-local-gate
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrecheckSteps } from "./branch-precheck-push.mjs";
// Import from lib — NOT check-commit-evidence.mjs — so --selftest does not inherit
// verify-no-money-theater's process.argv side-effect (Rule 25).
import { resolveCommitMsgFiles } from "./lib/commit-msg-files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-money-pr-local-gate";
const SELFTEST = process.argv.includes("--selftest");

const RULE25 = ".cursor/rules/25-one-push-money-fail-fast.mdc";
const GATE = "scripts/money-pr-local-gate.mjs";
const PRECHECK = "scripts/branch-precheck-push.mjs";
const COMMIT_MSG = "scripts/check-commit-evidence.mjs";
const ENTRY_POINTS = [
  "AGENTS.md",
  "docs/CLAUDE.md",
  ".cursor/rules/00-always-read-first.mdc",
  ".claude/skills/ih35-tms-standards/SKILL.md",
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertMoneyPrLocalGate(sources) {
  const problems = [];
  const get = (rel) => sources?.[rel] ?? (fs.existsSync(path.join(ROOT, rel)) ? read(rel) : "");

  if (!get(RULE25)) {
    problems.push(`${RULE25}: missing — Rule 25 alwaysApply one-push / fail-fast law required.`);
  } else if (!/money-pr-local-gate/i.test(get(RULE25))) {
    problems.push(`${RULE25}: must name money-pr-local-gate (mechanical tooth).`);
  }

  const gate = get(GATE);
  if (!gate) {
    problems.push(`${GATE}: missing — fail-fast pre-push gate required (Rule 25).`);
  } else {
    if (!gate.includes("verify-definition-of-done-evidence")) {
      problems.push(`${GATE}: must invoke verify-definition-of-done-evidence.`);
    }
    if (!gate.includes("verify-no-money-theater")) {
      problems.push(`${GATE}: must invoke verify-no-money-theater.`);
    }
    // Rule 29 — Claude-parity suite (must not shrink back to DoD-only).
    for (const needle of [
      "verify-migration-lane-band",
      "verify-verify-step-lane-band",
      "verify-no-claimed-numbers-edits",
      "verify-verify-step-claimed-on-main",
      "verify-verify-step-numbers-unique",
      "verify-data-migrations-rehearsed",
      "verify-entity-link-adoption",
      "verify-no-guard-file-deletion",
      "verify-claude-green-evidence-shape",
      "verify-economic-columns-c25-c31-present",
      "verify-module-progress-not-authored",
      "verify-no-bulk-test-void",
      "verify-section7-palette-nonfinancial",
      "verify-new-auth-routes-rate-limited",
    ]) {
      if (!gate.includes(needle)) {
        problems.push(`${GATE}: must invoke ${needle} (Rule 29/30 Claude-parity fail-fast).`);
      }
    }
  }

  const precheck = get(PRECHECK);
  if (!precheck.includes("money-pr-local-gate")) {
    problems.push(`${PRECHECK}: buildPrecheckSteps must include money-pr-local-gate.`);
  }
  // Live structural check when not in injected-sources mode
  if (!sources) {
    const steps = buildPrecheckSteps(ROOT);
    if (!steps.length || steps[0].label !== "money-pr-local-gate") {
      problems.push(
        `${PRECHECK}: first buildPrecheckSteps label must be money-pr-local-gate (got ${steps[0]?.label ?? "none"})`
      );
    }
    if (!steps[0]?.command?.includes("money-pr-local-gate.mjs")) {
      problems.push(`${PRECHECK}: first step command must run scripts/money-pr-local-gate.mjs`);
    }
  }

  const commitMsg = get(COMMIT_MSG);
  const commitLib = get("scripts/lib/commit-msg-files.mjs");
  if (
    !commitMsg.includes("resolveCommitMsgFiles") &&
    !commitMsg.includes("commit-msg-files") &&
    !commitLib.includes("head-amend")
  ) {
    problems.push(
      `${COMMIT_MSG}: must fall back to HEAD files when staged is empty (amend hole — Rule 25).`
    );
  }
  if (!/diff-tree|headTree|HEAD/.test(commitMsg + commitLib)) {
    problems.push(`${COMMIT_MSG}: amend fallback to HEAD tree missing.`);
  }

  for (const rel of ENTRY_POINTS) {
    const src = get(rel);
    if (!/Rule 25|money-pr-local-gate|one-push/i.test(src)) {
      problems.push(
        `${rel}: must reference Rule 25 / money-pr-local-gate / one-push so the law autoloads.`
      );
    }
  }

  return problems;
}

if (SELFTEST) {
  const COMMIT_LIB = "scripts/lib/commit-msg-files.mjs";
  const files = [RULE25, GATE, PRECHECK, COMMIT_MSG, COMMIT_LIB, ...ENTRY_POINTS];
  const live = Object.fromEntries(
    files.map((rel) => {
      try {
        return [rel, read(rel)];
      } catch {
        return [rel, ""];
      }
    })
  );
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    const problems = assertMoneyPrLocalGate(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught("rule25-deleted", { ...live, [RULE25]: "" }, RULE25);
  expectCaught("gate-deleted", { ...live, [GATE]: "" }, GATE);
  expectCaught(
    "gate-no-theater",
    { ...live, [GATE]: live[GATE].replace(/verify-no-money-theater/g, "verify-something-else") },
    "verify-no-money-theater"
  );
  expectCaught(
    "gate-no-step-collision-ratchet",
    {
      ...live,
      [GATE]: live[GATE].replace(
        /\s*\["verify-verify-step-numbers-unique", "scripts\/verify-verify-step-numbers-unique\.mjs"\],/,
        ""
      ),
    },
    "verify-verify-step-numbers-unique"
  );
  expectCaught(
    "precheck-unwired",
    { ...live, [PRECHECK]: live[PRECHECK].replace(/money-pr-local-gate/g, "other-gate") },
    "money-pr-local-gate"
  );
  expectCaught(
    "amend-hole-reopened",
    {
      ...live,
      [COMMIT_MSG]: "process.exit(0);\n",
      [COMMIT_LIB]: "export function resolveCommitMsgFiles() { return { files: [], source: 'empty' }; }\n",
    },
    COMMIT_MSG
  );

  // Behavioral: empty staged + HEAD files must classify (amend path)
  const resolved = resolveCommitMsgFiles({
    stagedDiff: () => "",
    headTree: () => "db/migrations/202609100050_example.sql\napps/backend/src/accounting/x.ts\n",
  });
  if (resolved.source !== "head-amend" || resolved.files.length !== 2) {
    failures.push(
      `resolveCommitMsgFiles amend path broken: ${JSON.stringify(resolved)}`
    );
  }
  const stagedOnly = resolveCommitMsgFiles({
    stagedDiff: () => "apps/backend/src/accounting/y.ts\n",
    headTree: () => "should-not-use\n",
  });
  if (stagedOnly.source !== "staged" || stagedOnly.files[0] !== "apps/backend/src/accounting/y.ts") {
    failures.push(`resolveCommitMsgFiles staged path broken: ${JSON.stringify(stagedOnly)}`);
  }

  const liveProblems = assertMoneyPrLocalGate();
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertMoneyPrLocalGate();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — Rule 25 + money-pr-local-gate first in pre-push + amend hole closed + autoload pointers`
);
process.exit(0);
