#!/usr/bin/env node
// ENG-09 — THE GUARANTEE GUARD (CC-1, verify-step 18813).
// "Every engine surface that the master engine register declares closed-by-guard actually has
// its guard file on disk AND that guard is wired into a verify-step."
//
// This is a STATIC-ONLY check (no DB, no network). It runs in < 100ms and never fails
// spuriously. Two assertions per engine invariant:
//   1. scripts/<guard>.mjs EXISTS
//   2. scripts/verify-steps/<NNNN>-<guard>.mjs EXISTS  (wired into CI)
//
// node scripts/verify-engine-register-closed-by-guard.mjs
// node scripts/verify-engine-register-closed-by-guard.mjs --selftest
import { existsSync, readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-engine-register-closed-by-guard";
const STEPS_DIR = path.join(ROOT, "scripts", "verify-steps");

// Engine surfaces declared "closed by guard" in the master engine register
// docs/registers/00-MASTER-ENGINE-REGISTER-READ-FIRST.md (Part 1) and
// docs/registers/10-16-2026-ENGINE-REGISTER-BANK-MATCH-HANDOFF.md (Section E).
// Only surfaces the register explicitly names a guard for are listed here.
const ENGINE_REGISTER = [
  {
    surface: "Match surface (one engine)",
    guard: "verify-one-match-engine-owns-this-surface.mjs",
  },
  {
    surface: "Posting engine single-door",
    guard: "verify-only-the-posting-engine-writes-postings.mjs",
  },
  {
    surface: "No auto-match",
    guard: "verify-no-automatch.mjs",
  },
  {
    surface: "Bank match never auto-written",
    guard: "verify-bank-match-is-never-auto-written.mjs",
  },
  {
    surface: "Banking suggest matches wired",
    guard: "verify-banking-suggest-matches-wired.mjs",
  },
  {
    surface: "Account-type homes (P&L + BS)",
    guard: "verify-every-account-type-has-a-pl-or-bs-home.mjs",
  },
  {
    surface: "No live duplicate documents",
    guard: "verify-no-live-duplicate-documents.mjs",
  },
  {
    surface: "No swallowed DB errors in transactions",
    guard: "verify-no-swallowed-db-error-in-transaction.mjs",
  },
];

function verifyStatic(register, stepsDir, root = ROOT) {
  const failures = [];
  let steps;
  try {
    steps = readdirSync(stepsDir);
  } catch {
    failures.push(`verify-steps directory not found at ${stepsDir}`);
    return failures;
  }

  for (const { surface, guard } of register) {
    const guardPath = path.join(root, "scripts", guard);
    if (!existsSync(guardPath)) {
      failures.push(`[${surface}] guard file missing: scripts/${guard}`);
      continue;
    }
    // A step is "wired" if: its filename ends with -<guard>, OR its content references <guard>
    const wired = steps.some((f) => {
      if (f.endsWith(`-${guard}`) || f === guard) return true;
      try {
        return readFileSync(path.join(stepsDir, f), "utf8").includes(guard);
      } catch {
        return false;
      }
    });
    if (!wired) {
      failures.push(
        `[${surface}] guard scripts/${guard} exists but is not wired into a verify-step (no scripts/verify-steps/NNNN-${guard})`
      );
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  // Baseline: real files must pass
  const baseline = verifyStatic(ENGINE_REGISTER, STEPS_DIR);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL: baseline not green — ${baseline.join("; ")}`);
    process.exit(1);
  }

  // Mutation 1: a guard file that does not exist must be caught
  const missingGuard = ENGINE_REGISTER.map((e, i) =>
    i === 0 ? { ...e, guard: "verify-DOES-NOT-EXIST-sentinel.mjs" } : e
  );
  const m1 = verifyStatic(missingGuard, STEPS_DIR);
  if (!m1.some((f) => f.includes("DOES-NOT-EXIST"))) {
    console.error(`${LABEL} --selftest FAIL: mutation 1 (missing guard file) not caught`);
    process.exit(1);
  }

  // Mutation 2: a guard with no verify-step wiring must be caught
  // Use an isolated, deliberately unwired guard. The real guard acquired a step,
  // making the previous self-referential mutation silently stop testing anything.
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "ih35-engine-register-"));
  let m2HasWiringFail = false;
  let fixtureWiredPass = false;
  try {
    const fixtureSteps = path.join(fixtureRoot, "scripts", "verify-steps");
    mkdirSync(fixtureSteps, { recursive: true });
    const sentinel = "verify-unwired-engine-sentinel.mjs";
    writeFileSync(path.join(fixtureRoot, "scripts", sentinel), "// isolated guard fixture\n");
    const fixtureRegister = [{ surface: "Unwired sentinel", guard: sentinel }];
    const m2 = verifyStatic(fixtureRegister, fixtureSteps, fixtureRoot);
    m2HasWiringFail = m2.length === 1 && m2[0].includes("not wired into a verify-step");
    writeFileSync(path.join(fixtureSteps, `1-${sentinel}`), "// isolated step fixture\n");
    fixtureWiredPass = verifyStatic(fixtureRegister, fixtureSteps, fixtureRoot).length === 0;
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
  if (!m2HasWiringFail || !fixtureWiredPass) {
    console.error(`${LABEL} --selftest FAIL: mutation 2 must reject the unwired sentinel and accept it only after wiring`);
    process.exit(1);
  }

  // Mutation 3: a bad STEPS_DIR path must trigger the directory-not-found error
  const m3 = verifyStatic(ENGINE_REGISTER, "/nonexistent-path-sentinel");
  if (!m3.some((f) => f.includes("verify-steps directory not found"))) {
    console.error(`${LABEL} --selftest FAIL: mutation 3 (bad steps dir) not caught`);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest PASS (3 mutations caught)`);
  process.exit(0);
}

const failures = verifyStatic(ENGINE_REGISTER, STEPS_DIR);
if (failures.length) {
  console.error(`${LABEL} FAIL — ${failures.length} engine register invariant(s) not closed by guard:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — ${ENGINE_REGISTER.length} engine register invariants each have a guard file on disk and a verify-step wiring.`
);
process.exit(0);
