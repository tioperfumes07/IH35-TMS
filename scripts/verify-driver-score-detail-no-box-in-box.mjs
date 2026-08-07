#!/usr/bin/env node
/**
 * verify-driver-score-detail-no-box-in-box.mjs
 * DriverScoreDetail trend panel + harsh-event timeline must use flat slate section
 * frames with divide rows — no nested `rounded-sm border` KPI tiles or inner cards
 * (Cascade CLS-BOX-IN-BOX · Safety driver-scoring).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx";
const LABEL = "verify-driver-score-detail-no-box-in-box";
const DETAIL_MARKER = 'data-testid="driver-score-detail-panel"';
const EVENTS_MARKER = 'data-testid="driver-score-harsh-events-panel"';
const TABLE_MARKER = 'tableTestId="driver-score-detail-periods-table"';

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full component source */
export function detailPanelRegion(src) {
  const body = stripComments(src);
  const start = body.indexOf(DETAIL_MARKER);
  if (start < 0) return "";
  const open = body.lastIndexOf("<section", start);
  const close = body.indexOf("</section>", start);
  return close >= 0 ? body.slice(open >= 0 ? open : start, close + "</section>".length) : body.slice(open >= 0 ? open : start);
}

/** @param {string} src full component source */
export function eventsPanelRegion(src) {
  const body = stripComments(src);
  const start = body.indexOf(EVENTS_MARKER);
  if (start < 0) return "";
  const open = body.lastIndexOf("<section", start);
  const close = body.indexOf("</section>", start);
  return close >= 0 ? body.slice(open >= 0 ? open : start, close + "</section>".length) : body.slice(open >= 0 ? open : start);
}

/** @param {string} detailRegion trend panel JSX slice */
export function collectDetailProblems(detailRegion) {
  const problems = [];
  if (!detailRegion.includes(DETAIL_MARKER)) {
    problems.push(`${TARGET}: missing driver-score-detail-panel section wrapper`);
    return problems;
  }
  if (!detailRegion.includes(TABLE_MARKER)) {
    problems.push(`${TARGET}: missing driver-score-detail-periods ParityTable marker`);
  }
  if (!/overflow-hidden rounded-sm border border-slate-200 bg-white/.test(detailRegion)) {
    problems.push(`${TARGET}: trend panel must use overflow-hidden single section frame`);
  }
  if (/grid grid-cols-2 gap-2/.test(detailRegion)) {
    problems.push(`${TARGET}: KPI strip must not use gap-2 nested tile grids (box-in-box chrome)`);
  }
  if (/rounded-sm border border-slate-100 p-2/.test(detailRegion)) {
    problems.push(`${TARGET}: KPI cells must not use per-card rounded borders (box-in-box)`);
  }
  if (!/sm:divide-x sm:divide-slate-100/.test(detailRegion)) {
    problems.push(`${TARGET}: KPI grid must flatten with sm:divide-x columns`);
  }
  if (/rounded-sm border border-gray-200 bg-white p-3/.test(detailRegion)) {
    problems.push(`${TARGET}: must not nest harsh-events card inside trend panel (box-in-box)`);
  }
  return problems;
}

/** @param {string} eventsRegion harsh-events panel JSX slice */
export function collectEventsProblems(eventsRegion) {
  const problems = [];
  if (!eventsRegion.includes(EVENTS_MARKER)) {
    problems.push(`${TARGET}: missing driver-score-harsh-events-panel section wrapper`);
    return problems;
  }
  if (!/overflow-hidden rounded-sm border border-slate-200 bg-white/.test(eventsRegion)) {
    problems.push(`${TARGET}: harsh-events panel must use overflow-hidden single section frame`);
  }
  if (!/divide-y divide-slate-100/.test(eventsRegion)) {
    problems.push(`${TARGET}: harsh-event rows must use divide-y (flat list, no nested cards)`);
  }
  if (/rounded-sm border border-slate-100 px-2 py-1/.test(eventsRegion)) {
    problems.push(`${TARGET}: harsh-event rows must not use per-row bordered cards (box-in-box)`);
  }
  return problems;
}

export function collectProblems(src) {
  return [
    ...collectDetailProblems(detailPanelRegion(src)),
    ...collectEventsProblems(eventsPanelRegion(src)),
  ];
}

function selftest() {
  const goodDetail = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white" data-testid="driver-score-detail-panel">
      <div className="border-b border-slate-200 px-3 py-2">header</div>
      <div className="grid grid-cols-2 text-xs sm:divide-x sm:divide-slate-100 md:grid-cols-4">
        <div className="border-t border-slate-100 px-3 py-2">Latest score</div>
      </div>
      <ParityTable tableTestId="driver-score-detail-periods-table" />
    </section>`;

  const badDetail = `
    <section data-testid="driver-score-detail-panel">
      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <div className="rounded-sm border border-slate-100 p-2">Latest score</div>
      </div>
      <ParityTable tableTestId="driver-score-detail-periods-table" />
    </section>`;

  const goodEvents = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white" data-testid="driver-score-harsh-events-panel">
      <div className="border-b border-slate-200 px-3 py-2">Harsh Event Timeline</div>
      <div className="divide-y divide-slate-100 text-xs">
        <div className="px-3 py-2">event row</div>
      </div>
    </section>`;

  const badEvents = `
    <section data-testid="driver-score-harsh-events-panel">
      <div className="space-y-1 text-xs">
        <div className="rounded-sm border border-slate-100 px-2 py-1">event row</div>
      </div>
    </section>`;

  const cases = [
    { name: "flat KPI strip → 0 detail errors", fn: () => collectDetailProblems(goodDetail), want: 0 },
    { name: "nested KPI tiles → detail fail", fn: () => collectDetailProblems(badDetail), wantMin: 1 },
    { name: "divide-y event list → 0 events errors", fn: () => collectEventsProblems(goodEvents), want: 0 },
    { name: "per-row bordered events → events fail", fn: () => collectEventsProblems(badEvents), wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = c.fn().length;
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
  const problems = collectProblems(src);
  if (problems.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — DriverScoreDetail uses flat slate sections (no box-in-box)`);
}
