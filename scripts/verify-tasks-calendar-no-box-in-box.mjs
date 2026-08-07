#!/usr/bin/env node
/**
 * verify-tasks-calendar-no-box-in-box.mjs
 * Tasks Calendar must use one outer section frame with a flat border-b month nav row —
 * no sibling bordered card for the nav above a second bordered calendar card (CLS-BOX-IN-BOX).
 *
 * --selftest exercises pass + sibling-card failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/tasks/TasksCalendarPage.tsx";
const LABEL = "verify-tasks-calendar-no-box-in-box";
const FRAME_MARKER = 'data-testid="tasks-calendar-frame"';
const GRID_MARKER = 'data-testid="tasks-calendar-grid"';
const SIBLING_NAV_CARD_RE =
  /<div className="[^"]*flex items-center justify-between rounded-sm border border-slate-200 bg-white[^"]*"[\s\S]*?<section[^>]*tasks-calendar-frame/g;
const NESTED_CALENDAR_CARD_RE =
  /<section[^>]*tasks-calendar-frame[\s\S]*?<div className="[^"]*rounded-sm border border-slate-200 bg-white p-2[^"]*"[\s\S]*?tasks-calendar-grid/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full page source */
export function calendarRegion(src) {
  const body = stripComments(src);
  const start = body.indexOf(FRAME_MARKER);
  if (start < 0) return body.slice(body.indexOf("TasksModuleTabs"));
  const open = body.lastIndexOf("<section", start);
  const close = body.indexOf("</section>", start);
  if (open < 0 || close < 0) return body.slice(start);
  return body.slice(open, close + "</section>".length);
}

/** @param {string} region section frame JSX slice */
export function collectProblems(region) {
  const problems = [];
  if (!region.includes(FRAME_MARKER)) {
    problems.push(`${TARGET}: missing tasks-calendar-frame section wrapper`);
    return problems;
  }
  if (!region.includes(GRID_MARKER)) {
    problems.push(`${TARGET}: missing tasks-calendar-grid marker`);
    return problems;
  }
  if (!/border-b border-slate-200/.test(region)) {
    problems.push(`${TARGET}: month nav must use border-b only (no separate nav card)`);
  }
  if (SIBLING_NAV_CARD_RE.test(region)) {
    problems.push(`${TARGET}: month nav must not be a sibling bordered card above the calendar frame`);
  }
  if (NESTED_CALENDAR_CARD_RE.test(region)) {
    problems.push(
      `${TARGET}: calendar grid must not sit inside a nested bordered card — flatten to direct children of the section frame`,
    );
  }
  const sectionOpens = (region.match(/<section/g) ?? []).length;
  if (sectionOpens > 1) {
    problems.push(`${TARGET}: must not nest multiple section frames (box-in-box)`);
  }
  return problems;
}

function selftest() {
  const good = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white" data-testid="tasks-calendar-frame">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
        <button className="rounded-sm border border-slate-300 px-2 py-1 text-xs">Prev</button>
        <div className="text-sm font-semibold text-[#1f2a44]">August 2026</div>
        <button className="rounded-sm bg-[#1f2a44] px-2 py-1 text-xs text-white">Today</button>
      </div>
      <div className="p-2" data-testid="tasks-calendar-grid">
        <div className="grid grid-cols-7 gap-1">cells</div>
      </div>
    </section>`;

  const badSibling = `
    <div className="flex items-center justify-between rounded-sm border border-slate-200 bg-white px-3 py-2">nav</div>
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white" data-testid="tasks-calendar-frame">
      <div className="p-2" data-testid="tasks-calendar-grid">grid</div>
    </section>`;

  const badNested = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white" data-testid="tasks-calendar-frame">
      <div className="border-b border-slate-200 px-3 py-2">nav</div>
      <div className="rounded-sm border border-slate-200 bg-white p-2">
        <div data-testid="tasks-calendar-grid">grid</div>
      </div>
    </section>`;

  const cases = [
    { name: "flat section + border-b nav → 0 errors", region: good, want: 0 },
    { name: "sibling nav card above frame → fail", region: badSibling, wantMin: 1 },
    { name: "nested bordered wrapper around grid → fail", region: badNested, wantMin: 1 },
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
  const problems = collectProblems(calendarRegion(src));
  if (problems.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Tasks Calendar is a flat section frame (no box-in-box)`);
}
