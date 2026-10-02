#!/usr/bin/env node
// Lead ROUND 296/297 — money in a table cell is right-aligned with tabular figures (QBO_MONEY_CELL_CLASS =
// "text-right tabular-nums", design/qbo-parity.ts), on every screen, first of all the ones a CPA or a lender opens:
// Balance Sheet, P&L, Trial Balance, A/R and A/P Aging, Cash Flow, Profit per Truck, Customer Profitability, the
// Management Report Package, Settlement Summary. Ragged money columns read as wrong numbers.
//
// Fails when a <td> (or <th> footer) renders a money formatter and neither the cell, nor its <tr>, nor its <table>
// carries right-alignment + tabular-nums (QBO_MONEY_CELL_CLASS, or "text-right" together with "tabular-nums").
// ParityTable cells are excluded: ParityTable applies the class itself (and tabular-nums on its table root).
// Static, <2s. --selftest plants the regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-money-table-cells-aligned";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/frontend/src";
const MONEY = /\b(formatUsdCents|formatUsd|formatCurrency|fmtCurrency|fmtCents|fmtMoney|formatMoney|money|usd|asMoney|centsToUsd)\(/;
const ALIGNED = (cls) => /QBO_MONEY_CELL_CLASS/.test(cls) || (/\btext-right\b/.test(cls) && /\btabular-nums\b/.test(cls));

/** Offending money cells in one file: [line, snippet]. */
export function offenders(src) {
  const out = [];
  const tables = [];
  // Track <table ...> class context so a table-level tabular-nums + text-right counts.
  for (const m of src.matchAll(/<table\b([^>]*)>/g)) tables.push({ at: m.index, cls: m[1] });
  for (const m of src.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const [whole, , attrs, body] = m;
    if (!MONEY.test(body)) continue;
    if (ALIGNED(attrs)) continue;
    // Row-level class.
    const rowStart = src.lastIndexOf("<tr", m.index);
    const rowAttrs = rowStart >= 0 ? (src.slice(rowStart, src.indexOf(">", rowStart)) ?? "") : "";
    if (ALIGNED(rowAttrs)) continue;
    const table = [...tables].reverse().find((t) => t.at < m.index);
    if (table && ALIGNED(table.cls)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    out.push([line, whole.replace(/\s+/g, " ").slice(0, 110)]);
  }
  return out;
}

function files() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!["node_modules", "__tests__", "generated"].includes(e.name)) walk(rel); }
      else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(rel);
    }
  };
  walk(SRC);
  return out;
}

if (process.argv.includes("--selftest")) {
  const bad = `<table className="w-full"><tbody><tr><td className="p-1">{formatUsdCents(x)}</td></tr></tbody></table>`;
  const goodCell = `<table className="w-full"><tbody><tr><td className={QBO_MONEY_CELL_CLASS}>{formatUsdCents(x)}</td></tr></tbody></table>`;
  const goodTable = `<table className="w-full text-right tabular-nums"><tbody><tr><td>{fmtCurrency(x)}</td></tr></tbody></table>`;
  const nonMoney = `<table><tbody><tr><td>{row.name}</td></tr></tbody></table>`;
  const cases = [
    [offenders(bad).length === 1, "unaligned money cell fails"],
    [offenders(goodCell).length === 0, "QBO_MONEY_CELL_CLASS cell passes"],
    [offenders(goodTable).length === 0, "aligned table passes"],
    [offenders(nonMoney).length === 0, "non-money cell ignored"],
  ];
  const missed = cases.filter(([ok]) => !ok).map(([, n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length}`);
  process.exit(0);
}

const report = [];
for (const f of files()) {
  const o = offenders(fs.readFileSync(path.join(ROOT, f), "utf8"));
  if (o.length) report.push([f, o]);
}
if (process.argv.includes("--list")) {
  for (const [f, o] of report) console.log(`${o.length}\t${f}`);
  process.exit(0);
}
if (report.length) {
  console.error(`${LABEL}: FAIL — ${report.reduce((s, [, o]) => s + o.length, 0)} money cell(s) in ${report.length} file(s) not right-aligned + tabular-nums (use QBO_MONEY_CELL_CLASS):`);
  for (const [f, o] of report.slice(0, 40)) for (const [l, s] of o.slice(0, 3)) console.error(`  ${f}:${l}  ${s}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — every money cell in a table is right-aligned with tabular figures`);
