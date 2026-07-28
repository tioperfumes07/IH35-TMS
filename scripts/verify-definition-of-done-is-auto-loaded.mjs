#!/usr/bin/env node
/**
 * GUARD: Definition of Done + EVERY-PR checklist are referenced by every auto-loaded entry point.
 *
 * Deleting pointers fails CI. Also requires:
 *   - docs/specs/EVERY-PR-AUDIT-CHECKLIST.md exists (Claude consolidated list)
 *   - each entry point names VERIFY-1 and verify-step 1430 (mechanical money gate)
 *   - .cursor/rules/23-no-money-theater-prs.mdc exists (alwaysApply theater ban)
 *   - .cursor/rules/24-module-completion-n-of-m.mdc exists (alwaysApply N-of-M law)
 *   - .cursor/rules/25-one-push-money-fail-fast.mdc exists (alwaysApply one-push / fail-fast)
 *   - docs/module-completion/SCHEMA.md + accounting/banking manifests exist
 *   - each entry point names MODULE_PROGRESS and verify-step 1431
 *   - each entry point names Rule 25 / money-pr-local-gate / one-push (or verify-step 1702)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOD = "docs/specs/DEFINITION-OF-DONE.md";
const CHECKLIST = "docs/specs/EVERY-PR-AUDIT-CHECKLIST.md";
const RULE23 = ".cursor/rules/23-no-money-theater-prs.mdc";
const RULE24 = ".cursor/rules/24-module-completion-n-of-m.mdc";
const RULE25 = ".cursor/rules/25-one-push-money-fail-fast.mdc";
const MODULE_SCHEMA = "docs/module-completion/SCHEMA.md";
const MODULE_ACCT = "docs/module-completion/accounting.json";
const MODULE_BANK = "docs/module-completion/banking.json";
const ENTRY_POINTS = [
  ["AGENTS.md", "the repo's agent-coordination entry point"],
  ["docs/CLAUDE.md", "the durable handoff context every Claude session reads"],
  [".cursor/rules/00-always-read-first.mdc", "the alwaysApply Cursor rule loaded before any edit"],
  [".claude/skills/ih35-tms-standards/SKILL.md", "the operating-standards skill loaded every session"],
];
const LABEL = "verify-definition-of-done-is-auto-loaded";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertDodIsAutoLoaded(sources) {
  const problems = [];
  const get = (rel) => sources?.[rel] ?? (fs.existsSync(path.join(ROOT, rel)) ? read(rel) : "");

  if (!get(DOD)) {
    problems.push(`${DOD}: the Definition of Done is missing — every entry point below points at nothing.`);
  }
  if (!get(CHECKLIST)) {
    problems.push(
      `${CHECKLIST}: missing — Claude-consolidated EVERY-PR checklist must be tracked so sessions autoload it.`
    );
  }
  if (!get(RULE23)) {
    problems.push(`${RULE23}: missing — Rule 23 alwaysApply theater ban must exist.`);
  }
  if (!get(RULE24)) {
    problems.push(`${RULE24}: missing — Rule 24 alwaysApply module N-of-M law must exist.`);
  }
  if (!get(RULE25)) {
    problems.push(`${RULE25}: missing — Rule 25 alwaysApply one-push / money-pr-local-gate law must exist.`);
  }
  if (!get(MODULE_SCHEMA)) {
    problems.push(`${MODULE_SCHEMA}: missing — module completion schema must be tracked.`);
  }
  if (!get(MODULE_ACCT)) {
    problems.push(`${MODULE_ACCT}: missing — accounting N-of-M manifest required.`);
  }
  if (!get(MODULE_BANK)) {
    problems.push(`${MODULE_BANK}: missing — banking N-of-M manifest required.`);
  }

  for (const [rel, why] of ENTRY_POINTS) {
    const src = get(rel);
    if (!src.includes(DOD)) {
      problems.push(`${rel}: does not reference ${DOD} — ${why}.`);
    }
    if (!src.includes(CHECKLIST)) {
      problems.push(`${rel}: does not reference ${CHECKLIST} — money PR checklist would not autoload.`);
    }
    if (!src.includes("VERIFY-1")) {
      problems.push(`${rel}: does not mention VERIFY-1 — DoD §10 confirm keys would not be in context.`);
    }
    if (!src.includes("1430") && !src.includes("verify-no-money-theater")) {
      problems.push(`${rel}: does not mention verify-step 1430 / verify-no-money-theater — gate would be invisible.`);
    }
    if (!src.includes("MODULE_PROGRESS") && !src.includes("module-completion")) {
      problems.push(`${rel}: does not mention MODULE_PROGRESS / module-completion — Rule 24 would not autoload.`);
    }
    if (!src.includes("1431") && !src.includes("verify-module-completion")) {
      problems.push(`${rel}: does not mention verify-step 1431 / verify-module-completion — N-of-M gate invisible.`);
    }
    if (!/Rule 25|money-pr-local-gate|one-push|1702/i.test(src)) {
      problems.push(
        `${rel}: does not mention Rule 25 / money-pr-local-gate / one-push / 1702 — fail-fast push law invisible.`
      );
    }
  }

  return problems;
}

if (SELFTEST) {
  const files = [
    DOD,
    CHECKLIST,
    RULE23,
    RULE24,
    RULE25,
    MODULE_SCHEMA,
    MODULE_ACCT,
    MODULE_BANK,
    ...ENTRY_POINTS.map(([rel]) => rel),
  ];
  const live = Object.fromEntries(files.map((rel) => [rel, getSafe(rel)]));
  function getSafe(rel) {
    try {
      return read(rel);
    } catch {
      return "";
    }
  }
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = assertDodIsAutoLoaded(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  for (const [rel] of ENTRY_POINTS) {
    expectCaught(
      `dod-pointer-removed-${rel}`,
      { ...live, [rel]: live[rel].split(DOD).join("docs/specs/SOME-OTHER-DOC.md") },
      `${rel}: does not reference ${DOD}`
    );
    expectCaught(
      `checklist-pointer-removed-${rel}`,
      { ...live, [rel]: live[rel].split(CHECKLIST).join("docs/specs/OTHER-CHECKLIST.md") },
      `${rel}: does not reference ${CHECKLIST}`
    );
  }
  expectCaught("dod-deleted", { ...live, [DOD]: "" }, "the Definition of Done is missing");
  expectCaught("checklist-deleted", { ...live, [CHECKLIST]: "" }, CHECKLIST);
  expectCaught("rule23-deleted", { ...live, [RULE23]: "" }, RULE23);
  expectCaught("rule24-deleted", { ...live, [RULE24]: "" }, RULE24);
  expectCaught("rule25-deleted", { ...live, [RULE25]: "" }, RULE25);
  expectCaught("module-acct-deleted", { ...live, [MODULE_ACCT]: "" }, MODULE_ACCT);

  const liveProblems = assertDodIsAutoLoaded(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertDodIsAutoLoaded();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — DoD + EVERY-PR + Rule 23/24/25 + module-completion wired into ${ENTRY_POINTS.length} auto-load entry points`
);
