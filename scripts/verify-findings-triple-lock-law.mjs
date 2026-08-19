#!/usr/bin/env node
/**
 * FINDINGS TRIPLE-LOCK LAW — mechanical presence + instruction wiring.
 *
 * Owner 2026-08-11: stop "already fixed" ghosts — findings must be filed on board + register + routing;
 * FIXED requires register sign-off. This guard ensures the law file exists and is cited where coders load.
 *
 * Deeper pairing (board OPEN ↔ register ☐) is verify-findings-register-signoff.mjs.
 *
 * Self-test: node scripts/verify-findings-triple-lock-law.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-findings-triple-lock-law";
const LAW = "docs/audit/FINDINGS-TRIPLE-LOCK-LAW.md";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_SECTIONS = [
  "## TRIPLE-LOCK — file the finding",
  "## ANTI-RESURRECTION — before you file OPEN",
  "## FIXED MEANS — five proofs",
  "## FORBIDDEN (reopen the row if you see this)",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** @param {{law?: string}} overrides in-memory content override for the law file, for the selftest */
export function collectTripleLockLawProblems(overrides = {}) {
  const problems = [];
  const lawPath = path.join(ROOT, LAW);
  if (!overrides.law && !fs.existsSync(lawPath)) {
    problems.push(`${LAW} missing — triple-lock law not on main`);
    return problems;
  }
  const law = overrides.law ?? read(LAW);
  for (const section of REQUIRED_SECTIONS) {
    if (!law.includes(section)) {
      problems.push(`${LAW} missing required section: ${section}`);
    }
  }

  const board = read("docs/audit/GUARD-WORKORDERS.md");
  if (!/FINDINGS-TRIPLE-LOCK-LAW\.md|TRIPLE-LOCK/i.test(board.slice(0, 8000))) {
    problems.push("docs/audit/GUARD-WORKORDERS.md must reference FINDINGS-TRIPLE-LOCK-LAW near top");
  }

  const register = read("docs/audit/CC-3-FINDINGS-CHECKLIST.md");
  if (!/TRIPLE-LOCK|FINDINGS-TRIPLE-LOCK-LAW/i.test(register.slice(0, 6000))) {
    problems.push("docs/audit/CC-3-FINDINGS-CHECKLIST.md must reference triple-lock law near top");
  }

  const agents = read("AGENTS.md");
  if (!/FINDINGS-TRIPLE-LOCK-LAW\.md/i.test(agents)) {
    problems.push("AGENTS.md must reference docs/audit/FINDINGS-TRIPLE-LOCK-LAW.md");
  }

  const signoff = path.join(ROOT, "scripts/verify-findings-register-signoff.mjs");
  if (!fs.existsSync(signoff)) {
    problems.push("scripts/verify-findings-register-signoff.mjs missing (register pairing guard)");
  }

  return problems;
}

if (SELFTEST) {
  // Pure, in-memory selftest — never writes to disk. The prior version wrote the planted mutation
  // directly to the real FINDINGS-TRIPLE-LOCK-LAW.md with NO try/finally at all (worse than the
  // process.exit()-bypasses-finally class fixed for ACCT-F5524/F5528/F5534 — here ANY exception
  // between the two writeFileSync calls, not just process.exit(), would have left the real law file
  // permanently corrupted). collectTripleLockLawProblems(overrides) now takes in-memory content.
  const failures = [];
  const liveProblems = collectTripleLockLawProblems();
  if (liveProblems.length) failures.push(`live: ${liveProblems.join(" | ")}`);

  const saved = read(LAW);
  const mutated = saved.replace("## TRIPLE-LOCK — file the finding", "## TRIPLE-LOCK-REMOVED");
  const p = collectTripleLockLawProblems({ law: mutated });
  if (!p.some((x) => x.includes("TRIPLE-LOCK"))) {
    failures.push("mutation inert — guard would not fail if law section removed");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — law present, cited, register signoff guard exists`);
  process.exit(0);
}

const problems = collectTripleLockLawProblems();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — triple-lock law file present and wired into board/register/AGENTS`);
