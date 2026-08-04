#!/usr/bin/env node
/**
 * verify-finance-break-even-no-box-in-box.mjs
 * Break-Even Analysis controls + expense table must use single outer section frames with
 * flat border-b/border-t strips — no nested rounded bordered tiles (CLS-BOX-IN-BOX).
 * Apply controls route through shared navy Button component.
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/finance/BreakEvenPage.tsx";
const LABEL = "verify-finance-break-even-no-box-in-box";
const CONTROLS_MARKER = 'data-testid="break-even-controls"';
const EXPENSE_MARKER = 'data-testid="break-even-expense-frame"';
const NESTED_TILE_RE = /className="[^"]*rounded-sm border border-slate-200[^"]*"/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full page source */
export function controlsSection(src) {
  const body = stripComments(src);
  const marker = body.indexOf(CONTROLS_MARKER);
  if (marker < 0) return "";
  const open = body.lastIndexOf("<section", marker);
  const close = body.indexOf("</section>", marker);
  if (open < 0 || close < 0) return body.slice(open >= 0 ? open : marker);
  return body.slice(open, close + "</section>".length);
}

/** @param {string} src full page source */
export function expenseSection(src) {
  const body = stripComments(src);
  const marker = body.indexOf(EXPENSE_MARKER);
  if (marker < 0) return "";
  const open = body.lastIndexOf("<section", marker);
  const close = body.indexOf("</section>", marker);
  if (open < 0 || close < 0) return body.slice(open >= 0 ? open : marker);
  return body.slice(open, close + "</section>".length);
}

/** @param {string} section controls JSX slice */
export function collectControlsProblems(section) {
  const problems = [];
  if (!section.includes(CONTROLS_MARKER)) {
    problems.push(`${TARGET}: missing break-even-controls section wrapper`);
    return problems;
  }
  if (!/overflow-hidden rounded-sm border border-slate-200 bg-white/.test(section)) {
    problems.push(`${TARGET}: controls must use a single overflow-hidden section frame`);
  }
  if (!/border-b border-slate-200/.test(section)) {
    problems.push(`${TARGET}: controls row must use border-b only (no separate filter card)`);
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes("overflow-hidden rounded-sm border border-slate-200 bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: controls nest ${innerNested.length} bordered tile(s) — flatten with border-b strip`,
    );
  }
  return problems;
}

/** @param {string} section expense table JSX slice */
export function collectExpenseProblems(section) {
  const problems = [];
  if (!section.includes(EXPENSE_MARKER)) {
    problems.push(`${TARGET}: missing break-even-expense-frame section wrapper`);
    return problems;
  }
  if (!/overflow-hidden rounded-sm border border-slate-200 bg-white/.test(section)) {
    problems.push(`${TARGET}: expense table must use a single overflow-hidden section frame`);
  }
  if (!/border-b border-slate-200 bg-slate-50/.test(section)) {
    problems.push(`${TARGET}: live-inputs strip must use border-b header inside single frame`);
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes("overflow-hidden rounded-sm border border-slate-200 bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: expense section nests ${innerNested.length} bordered tile(s) — use border-t strips only`,
    );
  }
  if (/mt-3 rounded-sm border border-slate-200 bg-white/.test(section)) {
    problems.push(`${TARGET}: live inputs must not be a separate bordered tile (box-in-box)`);
  }
  if (/mt-4 overflow-x-auto rounded-sm border border-slate-200 bg-white/.test(section)) {
    problems.push(`${TARGET}: expense table must not wrap table in nested bordered card`);
  }
  return problems;
}

/** Apply button must route through shared navy primary Button component. */
export function collectNavyProblems(src) {
  const problems = [];
  const body = stripComments(src);
  if (!body.includes('from "../../components/Button"')) {
    problems.push(`${TARGET}: must import navy Button for Apply controls`);
  }
  if (!body.includes("<Button size=\"sm\" onClick={() => setAppliedRange")) {
    problems.push(`${TARGET}: missing Apply Button for period range controls`);
  }
  return problems;
}

export function collectProblems(src) {
  return [
    ...collectControlsProblems(controlsSection(src)),
    ...collectExpenseProblems(expenseSection(src)),
    ...collectNavyProblems(src),
  ];
}

function selftest() {
  const goodControls = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white" data-testid="break-even-controls">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50 p-3">
        <Button size="sm" onClick={() => setAppliedRange({ from: fromDate, to: toDate })}>Apply</Button>
      </div>
    </section>`;
  const badControls = `
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-sm border border-slate-200 bg-white p-3">
      <DatePicker />
    </div>`;
  const goodExpense = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white" data-testid="break-even-expense-frame">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs">Live inputs</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm"><tbody /></table>
      </div>
    </section>`;
  const badExpense = `
    <section data-testid="break-even-expense-frame">
      <div className="mt-3 rounded-sm border border-slate-200 bg-white p-3">Live inputs</div>
      <div className="mt-4 overflow-x-auto rounded-sm border border-slate-200 bg-white">
        <table className="min-w-full text-sm"><tbody /></table>
      </div>
    </section>`;
  const goodNavy = `import { Button } from "../../components/Button";\n<Button size="sm" onClick={() => setAppliedRange({ from: fromDate, to: toDate })}>Apply</Button>`;

  const cases = [
    { name: "flat controls section", fn: () => collectControlsProblems(goodControls), want: 0 },
    { name: "nested controls tile", fn: () => collectControlsProblems(badControls), wantMin: 1 },
    { name: "flat expense section", fn: () => collectExpenseProblems(goodExpense), want: 0 },
    { name: "nested expense tiles", fn: () => collectExpenseProblems(badExpense), wantMin: 2 },
    { name: "navy Apply via Button import", fn: () => collectNavyProblems(goodNavy), want: 0 },
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
  const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const problems = collectProblems(src);
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — Break-Even sections are flat (no box-in-box).`);
}
