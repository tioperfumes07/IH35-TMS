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
  if (!/formatCashFlowCompoundLabel\(line\.label\)/.test(page)) {
    failures.push("CashFlowStatementPage Label cell must call formatCashFlowCompoundLabel(line.label)");
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
  const bad = originalPage.replace(/formatCashFlowCompoundLabel\(line\.label\)/, 'line.label || "—"');
  if (bad === originalPage) fail("selftest could not plant raw line.label");
  const planted = analyze({ page: bad });
  if (!planted.some((m) => /formatCashFlowCompoundLabel|raw line\.label/.test(m))) {
    fail(`selftest expected page fail; got: ${planted.join("; ")}`);
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
