#!/usr/bin/env node
/**
 * F425C-EXHIBITS-STOLEN-PREFIX — /425c/exhibits related hops must stay on /425c.
 * Live: Bank reconciliation / Accounting statements / Legal reports linked to
 * /accounting/reconciliation, /finance/statements, /legal/reports (other seats).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-exhibits-no-stolen-prefix";
const PAGE = "apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx";

export function collectProblems(src) {
  const problems = [];
  if (/to="\/(legal|finance|accounting)\//.test(src)) {
    problems.push(`${PAGE}: related links must not steal /legal /finance /accounting`);
  }
  if (!src.includes('to="/425c?tab=qb"')) {
    problems.push(`${PAGE}: missing in-module Deposit Import hop /425c?tab=qb`);
  }
  if (!src.includes('to="/425c?tab=merge"')) {
    problems.push(`${PAGE}: missing in-module Merge hop /425c?tab=merge`);
  }
  if (!src.includes('to="/425c?tab=history"')) {
    problems.push(`${PAGE}: missing in-module History hop /425c?tab=history`);
  }
  return problems;
}

const stolen = `
  <Link to="/accounting/reconciliation">Bank reconciliation</Link>
  <Link to="/finance/statements">Accounting statements</Link>
  <Link to="/legal/reports">Legal reports</Link>
`;
const kept = `
  <Link to="/425c?tab=qb">Deposit Import</Link>
  <Link to="/425c?tab=merge">Merge & Export</Link>
  <Link to="/425c?tab=history">History</Link>
  <Link to="/425c">← Form 425C</Link>
`;

if (process.argv.includes("--selftest")) {
  const bad = collectProblems(stolen);
  const good = collectProblems(kept);
  if (!bad.some((p) => p.includes("steal"))) {
    console.error(`${LABEL} --selftest FAIL: stolen prefixes must fail`);
    process.exit(1);
  }
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL good fixture: ${good.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${PAGE} related hops stay on /425c`);
process.exit(0);
