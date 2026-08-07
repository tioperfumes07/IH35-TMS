#!/usr/bin/env node
/**
 * verify-finance-statements-no-box-in-box.mjs
 * Financial Statements statement sections must use a single outer section frame with flat
 * border-b/border-t strips — no nested rounded bordered tiles around ParityTable (BOX-IN-BOX).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx";
const LABEL = "verify-finance-statements-no-box-in-box";
const NESTED_TILE_RE = /className="[^"]*rounded-(?:t-sm|sm) border border-slate-200[^"]*"/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** Slice covering StatementSection + trial balance section. */
export function statementSections(src) {
  const body = stripComments(src);
  const start = body.indexOf("function StatementSection");
  if (start < 0) return "";
  const end = body.indexOf("function SummaryCard", start);
  return end >= 0 ? body.slice(start, end) : body.slice(start);
}

export function trialBalanceSection(src) {
  const body = stripComments(src);
  const start = body.indexOf("fin19-trial-balance-table");
  if (start < 0) return "";
  const sectionStart = body.lastIndexOf("<section", start);
  const endMarker = body.indexOf("</section>", start);
  const end = endMarker >= 0 ? endMarker + "</section>".length : body.length;
  return body.slice(sectionStart >= 0 ? sectionStart : start, end);
}

/** @param {string} section StatementSection function body */
export function collectStatementSectionProblems(section) {
  const problems = [];
  if (!section.includes("function StatementSection")) {
    problems.push(`${TARGET}: missing StatementSection helper`);
    return problems;
  }
  if (!/\<section className="overflow-hidden rounded-sm border border-slate-200 bg-white"\>/.test(section)) {
    problems.push(`${TARGET}: StatementSection must use a single overflow-hidden section frame`);
  }
  if (!section.includes("embedded")) {
    problems.push(`${TARGET}: StatementSection ParityTable must pass embedded to drop inner frame`);
  }
  if (/rounded-t-sm border border-b-0/.test(section)) {
    problems.push(`${TARGET}: StatementSection must not use split rounded-t title tile (box-in-box)`);
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes("overflow-hidden rounded-sm border border-slate-200 bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: StatementSection nests ${innerNested.length} bordered tile(s) — use border-t strips only`,
    );
  }
  if (/mt-1 flex items-center justify-end gap-6 rounded-sm border/.test(section)) {
    problems.push(`${TARGET}: StatementSection footers must use border-t, not separate rounded tiles`);
  }
  if (!/border-b border-slate-200 bg-slate-50/.test(section)) {
    problems.push(`${TARGET}: StatementSection title must use border-b header strip inside single frame`);
  }
  if (!/border-t border-slate-200 bg-slate-50/.test(section)) {
    problems.push(`${TARGET}: StatementSection footers must flatten with border-t rows`);
  }
  return problems;
}

/** @param {string} section trial balance JSX slice */
export function collectTrialBalanceProblems(section) {
  const problems = [];
  if (!section.includes("fin19-trial-balance-table")) {
    problems.push(`${TARGET}: missing Trial balance ParityTable section`);
    return problems;
  }
  if (!/\<section className="overflow-hidden rounded-sm border border-slate-200 bg-white"\>/.test(section)) {
    problems.push(`${TARGET}: Trial balance must use a single overflow-hidden section frame`);
  }
  if (!section.includes("embedded")) {
    problems.push(`${TARGET}: Trial balance ParityTable must pass embedded`);
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes("overflow-hidden rounded-sm border border-slate-200 bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(`${TARGET}: Trial balance nests ${innerNested.length} inner bordered tile(s)`);
  }
  if (/mt-1 flex items-center justify-end gap-6 rounded-sm border/.test(section)) {
    problems.push(`${TARGET}: Trial balance grand total must use border-t, not a separate bordered tile`);
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
  if (!body.includes('<Button size="sm" onClick={() => setApplied')) {
    problems.push(`${TARGET}: missing Apply Button for period range controls`);
  }
  if (!body.includes('<Button size="sm" onClick={() => setAppliedAsOf')) {
    problems.push(`${TARGET}: missing Apply Button for as-of date controls`);
  }
  return problems;
}

export function collectProblems(src) {
  return [
    ...collectStatementSectionProblems(statementSections(src)),
    ...collectTrialBalanceProblems(trialBalanceSection(src)),
    ...collectNavyProblems(src),
  ];
}

function selftest() {
  const goodStatement = `
    function StatementSection() {
      return (
        <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">Revenue</div>
          <ParityTable embedded columns={columns} rows={lines} />
          <div className="flex border-t border-slate-200 bg-slate-50 px-3 py-2">Section total</div>
        </section>
      );
    }
  `;
  const badStatement = `
    function StatementSection() {
      return (
        <div>
          <div className="rounded-t-sm border border-b-0 border-slate-200 bg-slate-50">Revenue</div>
          <ParityTable columns={columns} rows={lines} />
          <div className="mt-1 rounded-sm border border-slate-200 bg-slate-50">Section total</div>
        </div>
      );
    }
  `;
  const goodTb = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50">Trial balance</div>
      <ParityTable embedded tableTestId="fin19-trial-balance-table" columns={TRIAL_BALANCE_COLUMNS} />
      <div className="border-t border-slate-200 bg-slate-50">Grand total</div>
    </section>
  `;
  const badTb = `
    <div>
      <ParityTable columns={TRIAL_BALANCE_COLUMNS} />
      <div className="mt-1 rounded-sm border border-slate-200 bg-slate-50">Grand total</div>
    </div>
  `;
  const goodNavy = `<Button size="sm" onClick={() => setApplied({ ...period })}>Apply</Button>`;
  const cases = [
    { name: "flat StatementSection", fn: () => collectStatementSectionProblems(goodStatement), want: 0 },
    { name: "nested StatementSection tiles", fn: () => collectStatementSectionProblems(badStatement), wantMin: 2 },
    { name: "flat trial balance section", fn: () => collectTrialBalanceProblems(goodTb), want: 0 },
    { name: "nested trial balance footer", fn: () => collectTrialBalanceProblems(badTb), wantMin: 1 },
    { name: "navy Apply via Button import", fn: () => collectNavyProblems(`import { Button } from "../../components/Button";\n${goodNavy}\n<Button size="sm" onClick={() => setAppliedAsOf(asOf)}>Apply</Button>`), want: 0 },
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
  console.log(`${LABEL} PASS — Financial Statements sections are flat (no box-in-box).`);
}
