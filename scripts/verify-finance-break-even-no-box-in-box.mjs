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
// Two forms are equivalent: a literal JSX attribute (data-testid="…", the original hand-rolled
// pattern) or the CollapsedListFilters `dataAttributes={{ "data-testid": "…" }}` prop (the shared
// governed-filters component spreads this object onto its own DOM node).
const CONTROLS_MARKER_RE = /data-testid=["']break-even-controls["']|"data-testid":\s*"break-even-controls"/;
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
  const m = CONTROLS_MARKER_RE.exec(body);
  if (!m) return "";
  const marker = m.index;
  // Governed CollapsedListFilters slims controls into a toggle + popover (no permanently-visible
  // bordered card to nest tiles inside) and self-strips border/rounded/bg from its own className
  // via singleFrameLayoutClassName() — the box-in-box concern this guard exists for is handled by
  // the shared component itself, not by this page. Scope the slice to the <CollapsedListFilters …>
  // tag rather than a <section>, which this pattern never wraps the marker in.
  const collapsedOpen = body.lastIndexOf("<CollapsedListFilters", marker);
  if (collapsedOpen >= 0) {
    const collapsedClose = body.indexOf("</CollapsedListFilters>", marker);
    if (collapsedClose >= 0) return body.slice(collapsedOpen, collapsedClose + "</CollapsedListFilters>".length);
  }
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
  if (!CONTROLS_MARKER_RE.test(section)) {
    problems.push(`${TARGET}: missing break-even-controls section wrapper`);
    return problems;
  }
  // Governed CollapsedListFilters owns its own frame (singleFrameLayoutClassName strips any
  // border/rounded/bg the caller passes) — the hand-rolled single-section-frame / border-b-strip /
  // no-nested-tile checks below are about a DIFFERENT, older always-visible-card pattern that does
  // not apply to the collapsed toggle+popover shape. Presence + Apply wiring is checked separately.
  if (/<CollapsedListFilters\b/.test(section)) return problems;
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

/**
 * Apply for period-range controls must be real and governed — either the original hand-rolled navy
 * Button pattern, OR the CLS-FILTER-GEAR-APPLY shared pattern (CollapsedListFilters +
 * useStagedListFilters, Apply wired via onApply={x.apply}) that legitimately replaced it on this
 * page. Same widening as ACCT-F5526 (FinancialStatementsPage.tsx).
 */
export function collectNavyProblems(src) {
  const problems = [];
  const body = stripComments(src);
  const hasGovernedApply =
    body.includes("CollapsedListFilters") &&
    body.includes("useStagedListFilters") &&
    /onApply=\{[^}]*\.apply\}/.test(body);
  if (hasGovernedApply) return problems;
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

  // Governed CollapsedListFilters controls (this page's real shape): dataAttributes-form marker,
  // self-owned frame (no <section> wrapper needed), Apply via onApply={staged.apply}.
  const goodCollapsedControls = `
    <CollapsedListFilters
      activeFilterCount={activeFilterCount}
      onApply={staged.apply}
      onReset={staged.reset}
      onCancel={staged.cancel}
      className="mb-4 rounded-sm border border-slate-200 bg-white p-3"
      dataAttributes={{ "data-testid": "break-even-controls" }}
    >
      <DatePicker />
    </CollapsedListFilters>`;
  const goodCollapsedNavy = `
    import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
    const staged = useStagedListFilters({ applied, empty: emptyFilters, onApply: setApplied });
    <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} />`;
  const brokenCollapsedNavy = goodCollapsedNavy.replace("onApply={staged.apply}", "onApply={() => {}}");

  const cases = [
    { name: "flat controls section", fn: () => collectControlsProblems(goodControls), want: 0 },
    { name: "nested controls tile", fn: () => collectControlsProblems(badControls), wantMin: 1 },
    { name: "flat expense section", fn: () => collectExpenseProblems(goodExpense), want: 0 },
    { name: "nested expense tiles", fn: () => collectExpenseProblems(badExpense), wantMin: 2 },
    { name: "navy Apply via Button import", fn: () => collectNavyProblems(goodNavy), want: 0 },
    { name: "governed CollapsedListFilters controls (real page's shape)", fn: () => collectControlsProblems(goodCollapsedControls), want: 0 },
    { name: "governed Apply via CollapsedListFilters", fn: () => collectNavyProblems(goodCollapsedNavy), want: 0 },
    { name: "governed Apply present but not wired to staged.apply must still fail", fn: () => collectNavyProblems(brokenCollapsedNavy), wantMin: 2 },
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
