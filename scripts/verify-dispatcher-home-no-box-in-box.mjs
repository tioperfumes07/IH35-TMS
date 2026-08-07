#!/usr/bin/env node
/**
 * verify-dispatcher-home-no-box-in-box.mjs
 * Dispatcher Home KPI / pending-actions / booking-gap panels must use a single outer
 * section frame with flat divide/border-t cells — no nested `rounded-sm border` tiles
 * (Cascade BOX-IN-BOX class · home module).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = [
  "apps/frontend/src/pages/home/roles/DispatcherHome.tsx",
  "apps/frontend/src/components/home/DispatcherPendingActionsPanel.tsx",
  "apps/frontend/src/components/home/DispatcherKpiBar.tsx",
];
const LABEL = "verify-dispatcher-home-no-box-in-box";
const NESTED_TILE_RE = /className="[^"]*rounded-sm border border-(?:slate|red|amber)-/g;
const OUTER_FRAME_RE =
  /className="[^"]*overflow-hidden rounded-sm border border-slate-200 bg-white[^"]*"/;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** Slice covering booking-gap panel on DispatcherHome. */
export function dispatcherHomePanels(src) {
  const body = stripComments(src);
  const start = body.indexOf('data-testid="dispatcher-booking-gap-panel"');
  if (start < 0) return "";
  const sectionStart = body.lastIndexOf("<section", start);
  const end = body.indexOf("</section>", start);
  return end >= 0 ? body.slice(sectionStart >= 0 ? sectionStart : start, end + "</section>".length) : body.slice(sectionStart >= 0 ? sectionStart : start);
}

/** @param {string} src full component source */
export function collectProblemsForFile(rel, src) {
  const problems = [];
  const body = stripComments(src);

  if (rel.endsWith("DispatcherHome.tsx")) {
    const region = dispatcherHomePanels(body);
    if (!region.includes('data-testid="dispatcher-booking-gap-panel"')) {
      problems.push(`${rel}: missing booking-gap panel test id`);
    }
    const nested = region.match(NESTED_TILE_RE) ?? [];
    const innerNested = nested.filter((m) => !m.includes("overflow-hidden"));
    if (innerNested.length > 0) {
      problems.push(`${rel}: nests ${innerNested.length} bordered tile(s) in booking-gap panel`);
    }
    if (/gap-2 p-3/.test(region)) {
      problems.push(`${rel}: must not use gap-2 padded nested tile grids (box-in-box chrome)`);
    }
    if (!/border-t border-slate-100/.test(region)) {
      problems.push(`${rel}: booking-gap cells must flatten with border-t rows`);
    }
    return problems;
  }

  if (rel.endsWith("DispatcherPendingActionsPanel.tsx")) {
    if (!OUTER_FRAME_RE.test(body)) {
      problems.push(`${rel}: pending-actions must use overflow-hidden single section frame`);
    }
    if (!body.includes("divide-y divide-slate-100")) {
      problems.push(`${rel}: pending-actions rows must use divide-y (flat list, no nested cards)`);
    }
    if (/rounded-sm border border-(?:amber|red)-/.test(body)) {
      problems.push(`${rel}: must not nest amber/red bordered action cards (§7 slate palette)`);
    }
    return problems;
  }

  if (rel.endsWith("DispatcherKpiBar.tsx")) {
    if (!OUTER_FRAME_RE.test(body)) {
      problems.push(`${rel}: KPI bar must use overflow-hidden single section frame`);
    }
    if (/border-emerald-|border-amber-|bg-emerald-|bg-amber-/.test(body)) {
      problems.push(`${rel}: KPI bar must use slate palette only (no emerald/amber)`);
    }
    if (/rounded-sm border/.test(body) && !body.includes("overflow-hidden rounded-sm border border-slate-200")) {
      problems.push(`${rel}: KPI cells must not use per-card rounded borders (box-in-box)`);
    }
    if (!/sm:divide-x sm:divide-slate-100/.test(body)) {
      problems.push(`${rel}: KPI grid must flatten with sm:divide-x columns`);
    }
    return problems;
  }

  return problems;
}

export function collectProblems(sources) {
  const problems = [];
  for (const [rel, src] of Object.entries(sources)) {
    problems.push(...collectProblemsForFile(rel, src));
  }
  return problems;
}

function selftest() {
  const goodHome = `
      <section data-testid="dispatcher-booking-gap-panel" className="overflow-hidden rounded-sm border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2">Booking gap analytics (7d)</div>
        <div className="grid grid-cols-2 sm:divide-x sm:divide-slate-100">
          <div className="border-t border-slate-100 px-3 py-2">Booked</div>
          <div className="border-t border-slate-100 px-3 py-2">Gaps</div>
        </div>
      </section>
  `;
  const badHome = `
    <section data-testid="dispatcher-booking-gap-panel" className="rounded-sm border border-slate-200 bg-white">
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-2">Booked</div>
        <div className="rounded-sm border border-red-200 bg-red-50 px-2 py-2">Gaps</div>
      </div>
    </section>
  `;
  const goodPending = `
    <section data-testid="dispatcher-pending-actions-panel" className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <ul className="divide-y divide-slate-100"><li className="px-3 py-2">x</li></ul>
    </section>
  `;
  const badPending = `
    <section className="rounded-sm border border-slate-200 bg-white">
      <ul className="space-y-2 p-3">
        <li className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2">x</li>
      </ul>
    </section>
  `;
  const goodKpi = `
    <section data-testid="dispatcher-kpi-bar" className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="grid sm:divide-x sm:divide-slate-100">
        <a className="border-t border-slate-100 px-3 py-2">Active</a>
      </div>
    </section>
  `;
  const badKpi = `
    <section className="grid gap-2">
      <a className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2">Active</a>
    </section>
  `;

  const cases = [
    { name: "good booking-gap", got: collectProblemsForFile(TARGETS[0], goodHome), want: 0 },
    { name: "bad booking-gap tiles", got: collectProblemsForFile(TARGETS[0], badHome), wantMin: 1 },
    { name: "good pending-actions", got: collectProblemsForFile(TARGETS[1], goodPending), want: 0 },
    { name: "bad pending-actions amber", got: collectProblemsForFile(TARGETS[1], badPending), wantMin: 1 },
    { name: "good kpi bar", got: collectProblemsForFile(TARGETS[2], goodKpi), want: 0 },
    { name: "bad kpi emerald cards", got: collectProblemsForFile(TARGETS[2], badKpi), wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = c.got.length;
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
  const sources = {};
  for (const rel of TARGETS) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      console.error(`[${LABEL}] FAIL: ${rel} missing`);
      process.exit(1);
    }
    sources[rel] = fs.readFileSync(full, "utf8");
  }
  const problems = collectProblems(sources);
  if (problems.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Dispatcher Home panels are flat slate sections (no box-in-box)`);
}
