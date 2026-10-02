#!/usr/bin/env node
// ROUND 326.2 items 3-4 — Banking + Factoring surfaces hold the approved standard:
//   (1) every <table> on a banking / factoring surface (and the shared ParityTable / LedgerKpiPanel they render through)
//       carries tabular-nums, so every money column aligns its digits (font-variant-numeric inherits from the table);
//   (2) reserves read ONE engine: Banking's factoring reserve comes from the factoring KPI engine (getFactoringKpis —
//       GL 1230 + 1235), never a second sum over the advance-linkage view (reserve_balance);
//   (3) no factoring surface shows the book reserve from views.factoring_summary (summary?.reserve_balance /
//       summaryQuery.data?.reserve_balance) — FactoringHome and the shared reserves panel read the same engine.
// Static, <1s. --selftest plants each violation and proves it fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-banking-factoring-surfaces-standard";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FE = path.join(ROOT, "apps/frontend/src");
const DIRS = ["pages/banking", "pages/factoring", "components/banking", "components/factoring"];
const SHARED = ["components/parity/ParityTable.tsx", "components/shared/LedgerKpiPanel.tsx"];
const BANKING_HOME = "pages/banking/BankingHome.tsx";

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

export function tableProblems(rel, src) {
  const out = [];
  for (const m of stripComments(src).matchAll(/<table\b([^>]*)>/g)) {
    if (!/\btabular-nums\b/.test(m[1])) out.push(`${rel}: <table${m[1].slice(0, 60)}> lacks tabular-nums`);
  }
  return out;
}

export function reserveProblems(src) {
  const out = [];
  const code = stripComments(src);
  if (!/\bgetFactoringKpis\b/.test(code)) out.push(`${BANKING_HOME}: factoring reserve does not read the factoring KPI engine (getFactoringKpis)`);
  if (/\breserve_balance\b(?!")/.test(code.replace(/"(escrow|cash)_reserve_balance"/g, ""))) {
    out.push(`${BANKING_HOME}: sums reserve_balance from the advance-linkage view — a second reserve engine`);
  }
  return out;
}

export function summaryReserveProblems(rel, src) {
  return /\b(summary\??|summaryQuery\.data\??)\.reserve_balance\b/.test(stripComments(src))
    ? [`${rel}: reads views.factoring_summary.reserve_balance — the book reserve is the factoring KPI engine`]
    : [];
}

function files() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__") walk(p); }
      else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(p);
    }
  };
  for (const d of DIRS) if (fs.existsSync(path.join(FE, d))) walk(path.join(FE, d));
  for (const s of SHARED) out.push(path.join(FE, s));
  return out;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    [tableProblems("x.tsx", `<table className="w-full">`).length === 1, "plain table fails"],
    [tableProblems("x.tsx", `<table>`).length === 1, "bare table fails"],
    [tableProblems("x.tsx", `<table\n  className={\`w-full tabular-nums\`}\n>`).length === 0, "multi-line table with tabular-nums passes"],
    [tableProblems("x.tsx", `/** the old \`<table>\` */ <table className="tabular-nums">`).length === 0, "commented table ignored"],
    [reserveProblems(`const r = rows.reduce((a, row) => a + Number(row.reserve_balance ?? 0), 0);`).length === 2, "view reserve sum fails"],
    [reserveProblems(`getFactoringKpis(c); cents("escrow_reserve_balance") + cents("cash_reserve_balance")`).length === 0, "engine reserve passes"],
    [summaryReserveProblems("f.tsx", `value={fmtCurrency(summary?.reserve_balance)}`).length === 1, "factoring_summary reserve fails"],
    [summaryReserveProblems("f.tsx", `Number(summaryQuery.data?.reserve_balance ?? 0)`).length === 1, "summaryQuery reserve fails"],
    [summaryReserveProblems("f.tsx", `engineReserve.total`).length === 0, "engine reserve on factoring passes"],
  ];
  const bad = cases.filter(([ok]) => !ok).map(([, n]) => n);
  if (bad.length) { console.error(`${LABEL} --selftest FAIL: ${bad.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length}`);
  process.exit(0);
}

const all = files();
const problems = all.flatMap((f) => {
  const rel = path.relative(FE, f);
  const src = fs.readFileSync(f, "utf8");
  return [...tableProblems(rel, src), ...(/factoring/i.test(rel) ? summaryReserveProblems(rel, src) : [])];
});
problems.push(...reserveProblems(fs.readFileSync(path.join(FE, BANKING_HOME), "utf8")));
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${all.length} banking / factoring surface files: every table tabular-nums; Banking and Factoring reserves read the factoring KPI engine`);
