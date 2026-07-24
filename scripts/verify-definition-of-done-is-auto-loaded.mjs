#!/usr/bin/env node
/**
 * GUARD: Definition of Done + EVERY-PR checklist are referenced by every auto-loaded entry point.
 *
 * Deleting pointers fails CI. Also requires:
 *   - docs/specs/EVERY-PR-AUDIT-CHECKLIST.md exists (Claude consolidated list)
 *   - each entry point names VERIFY-1 and verify-step 1430 (mechanical money gate)
 *   - .cursor/rules/23-no-money-theater-prs.mdc exists (alwaysApply theater ban)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOD = "docs/specs/DEFINITION-OF-DONE.md";
const CHECKLIST = "docs/specs/EVERY-PR-AUDIT-CHECKLIST.md";
const RULE23 = ".cursor/rules/23-no-money-theater-prs.mdc";
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
  }

  return problems;
}

if (SELFTEST) {
  const files = [DOD, CHECKLIST, RULE23, ...ENTRY_POINTS.map(([rel]) => rel)];
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
  `${LABEL} OK — DoD + EVERY-PR checklist + Rule 23 wired into ${ENTRY_POINTS.length} auto-load entry points`
);
