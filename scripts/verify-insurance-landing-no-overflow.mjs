#!/usr/bin/env node
// CI refresh: re-queue after stuck build-typecheck (2026-08-02).
/**
 * verify-insurance-landing-no-overflow.mjs
 * Insurance landing must shrink inside the Safety tab at 1440px — root overflow guards +
 * minmax(0,1fr) grid tracks so mixed KPI tile chrome does not blow past the viewport.
 *
 * Static source assertions only (not a browser test). --selftest exercises pass + fail fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/insurance/InsuranceLanding.tsx";
const LABEL = "verify-insurance-landing-no-overflow";

/** @param {string} src */
export function collectProblems(src) {
  const problems = [];
  if (!/\bmin-w-0\b/.test(src)) {
    problems.push(`${TARGET}: landing root must carry min-w-0 so flex/grid parents can shrink it`);
  }
  if (!/\boverflow-x-hidden\b/.test(src)) {
    problems.push(`${TARGET}: landing root must carry overflow-x-hidden to clip stray horizontal bleed`);
  }
  if (!/minmax\s*\(\s*0\s*,\s*1fr\s*\)/.test(src)) {
    problems.push(`${TARGET}: KPI grid must use minmax(0,1fr) tracks so columns shrink below content width`);
  }
  if (!/\[\&>\*\]:min-w-0/.test(src)) {
    problems.push(`${TARGET}: KPI grid must mark direct children min-w-0 (grid items default to min-width:auto)`);
  }
  if (!/<section[^>]*className="[^"]*\bgrid\b[^"]*min-w-0/.test(src)) {
    problems.push(`${TARGET}: KPI section grid must itself carry min-w-0`);
  }
  if (!/summaryQuery\.isError\s*\?\s*\(\s*<ListErrorState[\s\S]*?onRetry=\{\(\)\s*=>\s*void\s+summaryQuery\.refetch\(\)\}/.test(src)) {
    problems.push(`${TARGET}: summary GET failure must expose ListErrorState retrying the exact query`);
  }
  if (!/!summaryQuery\.isError\s*\?\s*<section/.test(src)) {
    problems.push(`${TARGET}: KPI grid must not render beneath the summary error state`);
  }
  return problems;
}

function selftest() {
  const good = `
export function InsuranceLanding() {
  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      {summaryQuery.isError ? (<ListErrorState status={0} message="Failed" onRetry={() => void summaryQuery.refetch()} />) : null}
      {!summaryQuery.isError ? <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))] [&>*]:min-w-0">
        <Card />
      </section> : null}
    </div>
  );
}`;

  const bad = `
export function InsuranceLanding() {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card />
      </section>
    </div>
  );
}`;

  const cases = [
    { name: "guarded root + minmax grid → 0 errors", src: good, want: 0 },
    { name: "bare grid-cols-3 root → fail", src: bad, wantMin: 5 },
    { name: "retry removed → fail", src: good.replace("onRetry={() => void summaryQuery.refetch()}", ""), want: 1 },
    { name: "error/table exclusion removed → fail", src: good.replace("!summaryQuery.isError ? <section", "<section"), want: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = collectProblems(c.src).length;
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

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const filePath = path.join(ROOT, TARGET);
if (!fs.existsSync(filePath)) {
  console.error(`[${LABEL}] FAILED — missing ${TARGET}`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(filePath, "utf8"));
if (problems.length) {
  console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — Insurance landing root + KPI grid are shrink-safe at 1440px.`);
