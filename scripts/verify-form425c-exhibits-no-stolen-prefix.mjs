#!/usr/bin/env node
/**
 * F425C-EXHIBITS-STOLEN-PREFIX — /425c related hops must stay on /425c.
 * Live: exhibits + Form425CHome RelatedModuleLinks stole /accounting /finance /legal
 * /safety /maintenance /compliance (other leftover seats).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-exhibits-no-stolen-prefix";
const PAGE = "apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx";
const HOME = "apps/frontend/src/pages/form425c/Form425CHome.tsx";
const FORM = "apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx";
const STOLEN_RE =
  /to[=:]\s*"\/(legal|finance|accounting|safety|maintenance|compliance|customers|drivers|fleet|lists|cash-flow|driver-hub)/;

export function collectProblems(src, page = PAGE) {
  const problems = [];
  if (STOLEN_RE.test(src)) {
    problems.push(`${page}: related links must not steal other seats' prefixes`);
  }
  if (page === PAGE) {
    if (!src.includes('to="/425c?tab=qb"')) {
      problems.push(`${page}: missing in-module Deposit Import hop /425c?tab=qb`);
    }
    if (!src.includes('to="/425c?tab=merge"')) {
      problems.push(`${page}: missing in-module Merge hop /425c?tab=merge`);
    }
    if (!src.includes('to="/425c?tab=history"')) {
      problems.push(`${page}: missing in-module History hop /425c?tab=history`);
    }
    if (!src.includes("Select an operating company before building exhibits")) {
      problems.push(`${page}: Build all exhibits must toast when no operating company (disabled+silent is leftover FINDING)`);
    }
    if (!src.includes("No exhibit payload to export")) {
      problems.push(`${page}: Export JSON with empty exhibit must toast, not download null silently`);
    }
    if (!src.includes("Exported exhibit")) {
      problems.push(`${page}: Export JSON success must toast (silent download is leftover FINDING)`);
    }
  }
  if (page === HOME) {
    if (!src.includes('to: "/425c?tab=qb"')) {
      problems.push(`${page}: related hops must stay on /425c?tab=qb`);
    }
    if (!src.includes('to: "/425c?tab=merge"')) {
      problems.push(`${page}: related hops must stay on /425c?tab=merge`);
    }
    if (!src.includes('to: "/425c?tab=history"')) {
      problems.push(`${page}: related hops must stay on /425c?tab=history`);
    }
  }
  if (page === FORM) {
    if (!src.includes('to="/425c/exhibits"')) {
      problems.push(`${page}: Exhibit required badge must Link to /425c/exhibits (dead span is leftover FINDING)`);
    }
    if (!src.includes("Exhibit required")) {
      problems.push(`${page}: missing Exhibit required label`);
    }
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
  pushToast("Select an operating company before building exhibits", "error");
  pushToast("No exhibit payload to export", "error");
  pushToast("Exported exhibit A JSON", "success");
`;
const stolenHome = `links={[{ label: "Safety Audit", to: "/safety/audit-425c" }]}`;
const keptHome = `
  links={[
    { label: "Deposit Import", to: "/425c?tab=qb" },
    { label: "Merge & Export", to: "/425c?tab=merge" },
    { label: "History", to: "/425c?tab=history" },
  ]}
`;

if (process.argv.includes("--selftest")) {
  const bad = collectProblems(stolen, PAGE);
  const good = collectProblems(kept, PAGE);
  const badHome = collectProblems(stolenHome, HOME);
  const goodHome = collectProblems(keptHome, HOME);
  if (!bad.some((p) => p.includes("steal"))) {
    console.error(`${LABEL} --selftest FAIL: stolen prefixes must fail`);
    process.exit(1);
  }
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL good fixture: ${good.join("; ")}`);
    process.exit(1);
  }
  if (!badHome.some((p) => p.includes("steal"))) {
    console.error(`${LABEL} --selftest FAIL: home stolen prefixes must fail`);
    process.exit(1);
  }
  if (goodHome.length) {
    console.error(`${LABEL} --selftest FAIL good home: ${goodHome.join("; ")}`);
    process.exit(1);
  }
  const badForm = collectProblems(`<span>Exhibit required</span>`, FORM);
  const goodForm = collectProblems(`<Link to="/425c/exhibits">Exhibit required</Link>`, FORM);
  if (!badForm.some((p) => p.includes("Exhibit required badge"))) {
    console.error(`${LABEL} --selftest FAIL: dead Exhibit required span must fail`);
    process.exit(1);
  }
  if (goodForm.length) {
    console.error(`${LABEL} --selftest FAIL good form: ${goodForm.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const homeSrc = fs.readFileSync(path.join(ROOT, HOME), "utf8");
const formSrc = fs.readFileSync(path.join(ROOT, FORM), "utf8");
const problems = [
  ...collectProblems(src, PAGE),
  ...collectProblems(homeSrc, HOME),
  ...collectProblems(formSrc, FORM),
];
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${PAGE} + ${HOME} + ${FORM} hops stay on /425c`);
process.exit(0);
