#!/usr/bin/env node
/**
 * verify-reports-home-no-box-in-box.mjs
 * Reports home Accounting + Management strips must use a single outer section frame with flat
 * divide/border-t cells — no nested `rounded-sm border` tiles (Cascade row 205).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/reports/ReportsHome.tsx";
const LABEL = "verify-reports-home-no-box-in-box";
const NESTED_TILE_RE = /className="[^"]*rounded-sm border border-slate-200[^"]*"/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** Slice covering Accounting + Management report sections. */
export function reportCatalogSections(src) {
  const body = stripComments(src);
  const start = body.indexOf("Accounting + financial reports");
  if (start < 0) return "";
  const sectionStart = body.lastIndexOf("<section", start);
  const endMarker = body.indexOf("<FrequentlyRunTable", start);
  const end = endMarker >= 0 ? endMarker : body.length;
  return body.slice(sectionStart >= 0 ? sectionStart : start, end);
}

/** @param {string} section Accounting + Management JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes("Accounting + financial reports")) {
    problems.push(`${TARGET}: missing Accounting + financial reports section`);
    return problems;
  }
  if (!section.includes("Management reports")) {
    problems.push(`${TARGET}: missing Management reports section`);
  }
  const frames = section.match(
    /<section className="overflow-hidden rounded-sm border border-slate-200 bg-white">/g,
  );
  if (!frames || frames.length < 2) {
    problems.push(
      `${TARGET}: Accounting + Management must each use a single overflow-hidden section frame`,
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
  if (/gap-2 p-3/.test(section)) {
    problems.push(`${TARGET}: must not use gap-2 padded nested tile grids (box-in-box chrome)`);
  }
  if (!/border-t border-slate-100/.test(section)) {
    problems.push(`${TARGET}: report cells must flatten with border-t rows`);
  }
  if (!/sm:divide-x sm:divide-slate-100/.test(section)) {
    problems.push(`${TARGET}: report grids must flatten with sm:divide-x columns`);
  }
  return problems;
}

function selftest() {
  const good = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div>Accounting + financial reports</div>
      <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-slate-100">
        <button className="border-t border-slate-100 px-3 py-2">Trial</button>
      </div>
    </section>
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div>Management reports</div>
      <div className="grid sm:grid-cols-3 sm:divide-x sm:divide-slate-100">
        <button className="border-t border-slate-100 px-3 py-2">Sales</button>
      </div>
    </section>
    <FrequentlyRunTable />
  `;
  const bad = `
    <section className="rounded-sm border border-slate-200 bg-white">
      <div>Accounting + financial reports</div>
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        <button className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">Trial</button>
      </div>
    </section>
    <section className="rounded-sm border border-slate-200 bg-white">
      <div>Management reports</div>
      <div className="grid gap-2 p-3 sm:grid-cols-3">
        <button className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">Sales</button>
      </div>
    </section>
    <FrequentlyRunTable />
  `;
  const goodP = collectProblems(reportCatalogSections(good));
  if (goodP.length) throw new Error(`selftest good failed: ${goodP.join("; ")}`);
  const badP = collectProblems(reportCatalogSections(bad));
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
  const problems = collectProblems(reportCatalogSections(src));
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — Reports home catalog strips are flat (no nested bordered tiles)`);
}
