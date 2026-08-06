#!/usr/bin/env node
/**
 * META-GUARD — verify-law-registry (ACCT-F134)
 *
 * THE PROBLEM IT SOLVES. Rules lived as prose across 40+ .cursor/rules files and specs. Prose cannot
 * be checked, so a rule could be "law" while nothing on earth enforced it. That is not hypothetical:
 * void-not-delete had been written down for months while 7 financial rows were DELETEd from
 * driver_finance.driver_settlements — no soft-delete column, no audit coverage, no guard, no trace.
 * docs/law/LAW.json makes the difference between "written down" and "enforced" VISIBLE, and this
 * check keeps the registry honest.
 *
 * WHAT IT ASSERTS
 *   1. every law whose `guard` is a path has that FILE ON DISK — a registry pointing at a guard that
 *      does not exist is worse than no registry, because it reads as coverage;
 *   2. registry integrity — unique ids, non-empty rule text, a valid status, and a `guard` value;
 *   3. status honesty — a law may only claim `enforced` if its guard file actually exists.
 *
 * WHAT IT DELIBERATELY DOES NOT DO, AND WHY THAT IS THE DESIGN. It does NOT run the guards and does
 * NOT re-run typecheck. Those already run in their own steps; re-running them here would add minutes
 * to every PR and buy nothing. The check is existence-only and finishes in well under two seconds. A
 * registry that made every PR slower would be deleted within a week — and then there would be no
 * registry at all. Cheap enough to keep is a feature, not a compromise.
 *
 * THE PHASED RULE it enforces socially rather than mechanically: a NEW rule is not law unless it
 * ships with a guard registered here. Pre-existing rules migrate as a backlog class (`guard-pending`)
 * and never block a PR — which is what makes adoption possible instead of a wall nobody climbs.
 */
import process from "node:process";
import { existsSync, readFileSync } from "node:fs";

const LABEL = "verify-law-registry";
const REGISTRY = "docs/law/LAW.json";
const VALID_STATUS = new Set(["enforced", "guard-pending", "JUDGMENT"]);
const NON_PATH_GUARDS = new Set(["JUDGMENT", "PENDING"]);

export function checkRegistry(doc, fileExists = existsSync) {
  const errors = [];
  if (!doc || !Array.isArray(doc.laws)) {
    return ["registry has no `laws` array"];
  }
  const seen = new Set();
  for (const law of doc.laws) {
    const id = law?.id ?? "(missing id)";
    if (!law?.id) errors.push("a law entry has no id");
    else if (seen.has(law.id)) errors.push(`duplicate law id: ${law.id}`);
    else seen.add(law.id);

    if (!law?.rule || !String(law.rule).trim()) {
      errors.push(`${id}: empty rule text — a law nobody can read is not a law`);
    }
    if (!law?.guard || !String(law.guard).trim()) {
      errors.push(`${id}: no guard field (use a script path, or "JUDGMENT" when not machine-checkable)`);
      continue;
    }
    if (!VALID_STATUS.has(law?.status)) {
      errors.push(`${id}: invalid status ${JSON.stringify(law?.status)} — expected one of ${[...VALID_STATUS].join(", ")}`);
    }
    // "PENDING" = written and mutation-proven, but not yet in the repo because Rule 37 blocks
    // authoring its verify-step until the number is on origin/main. It must still say WHERE it will
    // live, so the registry can never quietly forget it.
    if (law.guard === "PENDING" && !String(law.planned_guard ?? "").trim()) {
      errors.push(`${id}: guard "PENDING" must carry planned_guard so the intended path is recorded`);
    }
    const isPath = law.guard !== "JUDGMENT" && law.guard !== "PENDING";
    if (isPath && !fileExists(law.guard)) {
      errors.push(
        `${id}: guard file ${law.guard} does not exist. A registry entry pointing at a missing guard ` +
          `reads as coverage that is not there.`
      );
    }
    if (law.status === "enforced" && (!isPath || !fileExists(law.guard))) {
      errors.push(`${id}: status "enforced" but its guard is missing or JUDGMENT — enforced must mean a real, present guard.`);
    }
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const real = JSON.parse(readFileSync(REGISTRY, "utf8"));
  const realErrors = checkRegistry(real);
  if (realErrors.length) {
    console.error(`${LABEL} --selftest FAIL — the real registry does not pass:`);
    for (const e of realErrors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const ok = () => true;
  const missing = () => false;
  // Mutation 1: a registered guard whose file is gone must FAIL — the whole point.
  if (checkRegistry({ laws: [{ id: "X", rule: "r", guard: "scripts/gone.mjs", status: "guard-pending" }], }, missing).length === 0) {
    console.error(`${LABEL} --selftest FAIL — a missing guard file was not detected.`);
    process.exit(1);
  }
  // Mutation 2: claiming "enforced" without a real guard must FAIL. This is the lie the registry
  // exists to prevent — a rule marked enforced while nothing enforces it.
  if (checkRegistry({ laws: [{ id: "X", rule: "r", guard: "JUDGMENT", status: "enforced" }] }, ok).length === 0) {
    console.error(`${LABEL} --selftest FAIL — "enforced" with a JUDGMENT guard was accepted.`);
    process.exit(1);
  }
  // Mutation 3: duplicate ids must FAIL, or two rules can silently share one identity.
  if (checkRegistry({ laws: [
    { id: "D", rule: "r", guard: "JUDGMENT", status: "JUDGMENT" },
    { id: "D", rule: "r", guard: "JUDGMENT", status: "JUDGMENT" },
  ] }, ok).length === 0) {
    console.error(`${LABEL} --selftest FAIL — duplicate law ids were accepted.`);
    process.exit(1);
  }
  // Mutation 4: an empty rule must FAIL — a registry row with no readable rule is decoration.
  if (checkRegistry({ laws: [{ id: "E", rule: "   ", guard: "JUDGMENT", status: "JUDGMENT" }] }, ok).length === 0) {
    console.error(`${LABEL} --selftest FAIL — an empty rule text was accepted.`);
    process.exit(1);
  }
  // Mutation 5b: guard "PENDING" without planned_guard must FAIL — otherwise "pending" becomes a
  // place rules go to be forgotten.
  if (checkRegistry({ laws: [{ id: "P", rule: "r", guard: "PENDING", status: "guard-pending" }] }, ok).length === 0) {
    console.error(`${LABEL} --selftest FAIL — guard "PENDING" with no planned_guard was accepted.`);
    process.exit(1);
  }
  // Mutation 5: a valid JUDGMENT law must PASS, or every unguardable rule becomes a build failure and
  // the registry gets stripped back to nothing.
  if (checkRegistry({ laws: [{ id: "J", rule: "an owner treatment call", guard: "JUDGMENT", status: "JUDGMENT" }] }, ok).length !== 0) {
    console.error(`${LABEL} --selftest FAIL — a legitimate JUDGMENT law was rejected.`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 6 mutations detected; ${real.laws.length} laws registered.`);
  process.exit(0);
}

let doc;
try {
  doc = JSON.parse(readFileSync(REGISTRY, "utf8"));
} catch (error) {
  console.error(`${LABEL} FAIL — ${REGISTRY} missing or invalid JSON: ${error.message}`);
  process.exit(1);
}

const errors = checkRegistry(doc);
if (errors.length > 0) {
  console.error(`${LABEL} FAIL — ${errors.length} registry problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const counts = doc.laws.reduce((acc, l) => ((acc[l.status] = (acc[l.status] ?? 0) + 1), acc), {});
console.log(
  `${LABEL} PASS — ${doc.laws.length} laws registered ` +
    `(${counts.enforced ?? 0} enforced, ${counts["guard-pending"] ?? 0} guard-pending, ${counts.JUDGMENT ?? 0} judgment). ` +
    `Every registered guard path exists on disk.`
);
