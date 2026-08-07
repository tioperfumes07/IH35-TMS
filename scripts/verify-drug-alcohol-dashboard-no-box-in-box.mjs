#!/usr/bin/env node
/**
 * verify-drug-alcohol-dashboard-no-box-in-box.mjs
 * DrugAlcoholDashboard KPI strip must not nest bordered stat tiles inside a second bordered
 * outer card (CLS-BOX-IN-BOX). Each metric tile is its own single frame in a flat grid.
 *
 * --selftest exercises pass + nested-wrapper failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/safety/DrugAlcoholDashboard.tsx";
const LABEL = "verify-drug-alcohol-dashboard-no-box-in-box";
const FRAME_MARKER = 'data-testid="drug-alcohol-dashboard"';
const NESTED_OUTER_RE =
  /rounded-sm border border-slate-200 bg-slate-50[\s\S]*?rounded-sm border border-(?:white|gray-200) bg-white/;
const INNER_WHITE_BOX_RE = /border border-white bg-white/;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full component source */
export function dashboardRegion(src) {
  const body = stripComments(src);
  const start = body.indexOf(FRAME_MARKER);
  if (start < 0) return "";
  const open = body.lastIndexOf("<section", start);
  const close = body.indexOf("</section>", start);
  if (open < 0 || close < 0) return body.slice(start);
  return body.slice(open, close + "</section>".length);
}

/** @param {string} region dashboard section JSX slice */
export function collectProblems(region) {
  const problems = [];
  if (!region.includes(FRAME_MARKER)) {
    problems.push(`${TARGET}: missing drug-alcohol-dashboard section marker`);
    return problems;
  }
  if (NESTED_OUTER_RE.test(region)) {
    problems.push(
      `${TARGET}: KPI tiles are nested inside a second bordered outer card — use a flat section + single-frame tiles`,
    );
  }
  if (INNER_WHITE_BOX_RE.test(region)) {
    problems.push(`${TARGET}: must not use border-white inner boxes (box-in-box chrome on slate-50 outer)`);
  }
  if (!/md:grid-cols-4/.test(region)) {
    problems.push(`${TARGET}: KPI grid must remain a flat md:grid-cols-4 strip`);
  }
  return problems;
}

function selftest() {
  const good = `
    <section className="space-y-3" data-testid="drug-alcohol-dashboard">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">Pool</div>
      </div>
    </section>`;

  const badNested = `
    <section data-testid="drug-alcohol-dashboard">
      <div className="space-y-3 rounded-sm border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-sm border border-white bg-white p-3 text-xs">Pool</div>
        </div>
      </div>
    </section>`;

  const cases = [
    { name: "flat section + single-frame KPI tiles → 0 errors", region: good, want: 0 },
    { name: "bordered outer card wrapping bordered stat tiles → fail", region: badNested, wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = collectProblems(c.region).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n[${LABEL}] SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n[${LABEL}] SELFTEST PASS`);
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (IS_MAIN) {
  const full = path.join(ROOT, TARGET);
  if (!fs.existsSync(full)) {
    console.error(`[${LABEL}] FAIL: ${TARGET} missing`);
    process.exit(1);
  }
  const src = fs.readFileSync(full, "utf8");
  const problems = collectProblems(dashboardRegion(src));
  if (problems.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — DrugAlcoholDashboard uses flat KPI grid (no box-in-box)`);
}
