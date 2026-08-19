#!/usr/bin/env node
/**
 * verify-reports-cash-flow-compound-label-human.mjs
 * LV-REPORTS-CASH-FLOW-RAW-COMPOUND-LABELS
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-cash-flow-compound-label-human";
const LIB = "apps/frontend/src/lib/formatCashFlowCompoundLabel.ts";
const PAGE = "apps/frontend/src/pages/reports/CashFlowStatementPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** @param {{lib?: string, page?: string}} overrides in-memory content overrides */
function analyze(overrides = {}) {
  const failures = [];
  const lib = overrides.lib ?? read(LIB);
  if (!/formatAccountTypeLabel/.test(lib) || !/humanizeEnumLabel/.test(lib)) {
    failures.push("lib must reuse formatAccountTypeLabel + humanizeEnumLabel");
  }
  if (!/indexOf\(":"\)/.test(lib)) {
    failures.push("lib must split compound AccountType:suffix labels");
  }

  const page = overrides.page ?? read(PAGE);
  // ACCT-F5551: this page has TWO independent render sites for the Label cell — the print/PDF HTML
  // string builder and the live JSX table row. A bare `.test()` only checks the pattern appears
  // SOMEWHERE in the file, so a regression at one site (the other left correct) escaped detection
  // entirely — confirmed live: this guard's own selftest plants the mutation with a non-global
  // `.replace()` (first occurrence only) and the resulting "bad" fixture still passed analyze()
  // because the second, untouched occurrence satisfied the presence check. Require both call sites.
  const callSites = (page.match(/formatCashFlowCompoundLabel\(line\.label\)/g) || []).length;
  if (callSites < 2) {
    failures.push(
      `CashFlowStatementPage Label cell must call formatCashFlowCompoundLabel(line.label) at both the print/PDF row builder and the live table row (found ${callSites})`,
    );
  }
  if (/\{line\.label \|\| "—"\}/.test(page)) {
    failures.push("Label cell must not paint raw line.label");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

/**
 * Pure, in-memory selftest — never writes to disk. An earlier version mutated the REAL
 * CashFlowStatementPage.tsx file directly (fs.writeFileSync then restored in a finally), which is
 * unsafe two ways: Node's process.exit() does not run pending finally blocks (the class fixed for
 * ACCT-F5524/ACCT-F5528), and in this shared multi-agent worktree a concurrent session's own
 * in-flight edit to the same file can land between the plant and the read-back, producing a flaky,
 * non-deterministic false FAIL unrelated to any real defect (observed directly this session).
 * analyze(overrides) now takes in-memory content, so selftest never touches disk at all.
 */
function selftest() {
  const originalPage = read(PAGE);

  // Mutation 1: regress the FIRST call site (print/PDF row builder) only.
  const badFirst = originalPage.replace(/formatCashFlowCompoundLabel\(line\.label\)/, 'line.label || "—"');
  if (badFirst === originalPage) fail("selftest could not plant raw line.label at the first call site");
  const plantedFirst = analyze({ page: badFirst });
  if (!plantedFirst.some((m) => /formatCashFlowCompoundLabel|raw line\.label/.test(m))) {
    fail(`selftest expected first-site page fail; got: ${plantedFirst.join("; ")}`);
  }

  // Mutation 2: regress the SECOND call site (live JSX table row) only, leaving the first intact —
  // this is the exact shape a naive presence-only check missed (ACCT-F5551).
  const firstIndex = originalPage.indexOf("formatCashFlowCompoundLabel(line.label)");
  const secondIndex = originalPage.indexOf("formatCashFlowCompoundLabel(line.label)", firstIndex + 1);
  if (secondIndex === -1) fail("selftest could not locate a second call site to mutate");
  const badSecond =
    originalPage.slice(0, secondIndex) +
    'line.label || "—"' +
    originalPage.slice(secondIndex + "formatCashFlowCompoundLabel(line.label)".length);
  const plantedSecond = analyze({ page: badSecond });
  if (!plantedSecond.some((m) => /formatCashFlowCompoundLabel|raw line\.label/.test(m))) {
    fail(`selftest expected second-site page fail; got: ${plantedSecond.join("; ")}`);
  }

  const good = analyze();
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — Cash Flow Statement compound Labels are humanized`);
