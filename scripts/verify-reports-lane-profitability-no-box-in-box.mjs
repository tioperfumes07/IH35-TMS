#!/usr/bin/env node
/**
 * verify-reports-lane-profitability-no-box-in-box.mjs
 * Lane Profitability KPI + chart strips must use a single outer section frame with flat
 * divide/border-t cells — no nested `rounded-sm border` tiles (Cascade BOX-IN-BOX class).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/reports/LaneProfitabilityPage.tsx";
const LABEL = "verify-reports-lane-profitability-no-box-in-box";
const NESTED_TILE_RE = /className="[^"]*rounded-sm border border-(?:gray|slate)-200[^"]*"/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** Slice covering KPI + chart sections inside the query.data branch. */
export function kpiAndChartSections(src) {
  const body = stripComments(src);
  const start = body.indexOf("Total loads");
  if (start < 0) return "";
  const sectionStart = body.lastIndexOf("<section", start);
  const endMarker = body.indexOf("<ParityTable", start);
  const end = endMarker >= 0 ? endMarker : body.length;
  return body.slice(sectionStart >= 0 ? sectionStart : start, end);
}

/** @param {string} section KPI + chart JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes("Total loads")) {
    problems.push(`${TARGET}: missing KPI Total loads cell`);
    return problems;
  }
  if (!section.includes("Profit per mile by lane (top 8)")) {
    problems.push(`${TARGET}: missing chart section header`);
  }
  const frames = section.match(
    /<section className="overflow-hidden rounded-sm border border-slate-200 bg-white">/g,
  );
  if (!frames || frames.length < 2) {
    problems.push(
      `${TARGET}: KPI + chart must each use a single overflow-hidden section frame`,
    );
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes("overflow-hidden rounded-sm border border-slate-200 bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: nests ${innerNested.length} bordered tile(s) — use border-t / divide-x cells only`,
    );
  }
  if (/grid gap-3 md:grid-cols-3/.test(section)) {
    problems.push(`${TARGET}: must not use gap-3 nested KPI tile grids (box-in-box chrome)`);
  }
  if (!/md:divide-x md:divide-slate-100/.test(section)) {
    problems.push(`${TARGET}: KPI grid must flatten with md:divide-x columns`);
  }
  if (!/border-t border-slate-100/.test(section)) {
    problems.push(`${TARGET}: KPI cells must flatten with border-t rows`);
  }
  if (!/border-b border-slate-200/.test(section)) {
    problems.push(`${TARGET}: chart section must use border-b header strip inside single frame`);
  }
  return problems;
}

function selftest() {
  const good = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="grid md:grid-cols-3 md:divide-x md:divide-slate-100">
        <div className="border-t border-slate-100 px-4 py-3 first:border-t-0 md:border-t-0">Total loads</div>
      </div>
    </section>
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-2">
        <h2>Profit per mile by lane (top 8)</h2>
      </div>
      <div className="h-72 p-4">chart</div>
    </section>
    <ParityTable />
  `;
  const bad = `
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-sm border border-gray-200 bg-white p-4">Total loads</div>
    </div>
    <div className="rounded-sm border border-gray-200 bg-white p-4">
      <h2>Profit per mile by lane (top 8)</h2>
    </div>
    <ParityTable />
  `;
  const goodP = collectProblems(kpiAndChartSections(good));
  if (goodP.length) throw new Error(`selftest good failed: ${goodP.join("; ")}`);
  const badP = collectProblems(bad);
  if (badP.length < 2) throw new Error(`selftest bad not flagged enough: ${badP.join("; ")}`);
  console.log(`${LABEL} --selftest OK`);
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (IS_MAIN) {
  const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const problems = collectProblems(kpiAndChartSections(src));
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — Lane Profitability KPI + chart strips are flat (no nested bordered tiles)`);
}
