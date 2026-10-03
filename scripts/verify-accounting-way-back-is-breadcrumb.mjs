#!/usr/bin/env node
// U18 (owner UI register 2026-10-03) — "Back is browser history — becomes a breadcrumb, parent always the module home.
// Some screens have NO back at all." CC-2 owns the Accounting surfaces (CURSOR owns the app-wide sweep). Static.
//   1. no Accounting / Banking page or component goes back through browser history
//   2. the Accounting shell renders the breadcrumb Accounting / [parent] / page (every Accounting page gets a way back)
//   3. Load costs (moved to Dispatch, U3) goes back by Dispatch / Load costs on the board and on a load
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LABEL = "verify-accounting-way-back-is-breadcrumb";
const fails = [];
const read = (p) => readFileSync(p, "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const scanned = [
  ...walk("apps/frontend/src/pages/accounting"),
  ...walk("apps/frontend/src/pages/banking"),
  ...walk("apps/frontend/src/components/accounting"),
];
for (const f of scanned) {
  if (/hasInAppHistory|navigate\(-1\)|history\.back\(|history\.go\(-1\)/.test(strip(read(f)))) {
    fails.push(`${f}: goes back through browser history — the way back is the module breadcrumb (U18)`);
  }
}

const wrapper = strip(read("apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx"));
if (!/<Breadcrumb items=\{breadcrumb\} \/>/.test(wrapper) || !/\{ label: "Accounting", href: "\/accounting" \}/.test(wrapper)) {
  fails.push("AccountingSubNavWrapper: every Accounting page must show the breadcrumb starting at the Accounting home");
}
const board = read("apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx");
if (!/<Breadcrumb items=\{\[\{ label: "Dispatch", href: "\/dispatch" \}, \{ label: "Load costs" \}\]\} \/>/.test(board)) {
  fails.push("LoadCostsBoardPage: the way back must be Dispatch / Load costs");
}
const drawer = read("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
if (!/<Link className="hover:underline" to="\/dispatch">Dispatch<\/Link>[\s\S]{0,120}to="\/dispatch\/load-costs">Load costs<\/Link>/.test(drawer)) {
  fails.push("LoadDetailDrawer page mode: the load breadcrumb must start Dispatch › Load costs");
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${scanned.length} Accounting / Banking files scanned, 0 go back through browser history; the Accounting shell and Load costs show the module breadcrumb`);
