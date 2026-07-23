#!/usr/bin/env node
/**
 * GUARD: the Definition of Done is referenced by every file a coder auto-loads.
 *
 * WHY THIS EXISTS (owner directive 2026-07-23)
 * `docs/specs/DEFINITION-OF-DONE.md` was written, merged, and enforced at verify-step 1324 — and was
 * referenced by NONE of the four files an agent actually reads at session start: AGENTS.md,
 * docs/CLAUDE.md, .cursor/rules/00-always-read-first.mdc (alwaysApply), and the ih35-tms-standards
 * skill. The DoD's own opening line says it: "Scattered law is skipped law." A standard that exists
 * but is not pointed at from the entry points is a standard nobody loads.
 *
 * This guard makes the pointers structural. Deleting the DoD reference from any auto-loaded entry
 * point fails CI instead of quietly reverting the repo to "whatever the agent remembered."
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOD = "docs/specs/DEFINITION-OF-DONE.md";
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

  if (!(sources?.[DOD] ?? (fs.existsSync(path.join(ROOT, DOD)) ? read(DOD) : ""))) {
    problems.push(`${DOD}: the Definition of Done is missing — every entry point below points at nothing.`);
  }

  for (const [rel, why] of ENTRY_POINTS) {
    const src = sources?.[rel] ?? read(rel);
    if (!src.includes(DOD)) {
      problems.push(`${rel}: does not reference ${DOD} — ${why}, so the DONE bar would not be in context. Scattered law is skipped law.`);
    }
  }

  return problems;
}

if (SELFTEST) {
  const files = [DOD, ...ENTRY_POINTS.map(([rel]) => rel)];
  const live = Object.fromEntries(files.map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertDodIsAutoLoaded(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  for (const [rel] of ENTRY_POINTS) {
    expectCaught(
      `pointer-removed-from-${rel}`,
      { ...live, [rel]: live[rel].split(DOD).join("docs/specs/SOME-OTHER-DOC.md") },
      `${rel}: does not reference`
    );
  }
  expectCaught("dod-itself-deleted", { ...live, [DOD]: "" }, "the Definition of Done is missing");

  const liveProblems = assertDodIsAutoLoaded(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 5 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertDodIsAutoLoaded();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — the Definition of Done is referenced by all ${ENTRY_POINTS.length} auto-loaded entry points`);
