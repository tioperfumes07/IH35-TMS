#!/usr/bin/env node
/**
 * verify-wo-detail-linked-financials-no-box-in-box.mjs
 * WorkOrderDetail linked bills/expenses section must use one slate outer frame with flat
 * border-t rows — no nested amber bordered alert tiles or padded inner cards (box-in-box law).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const LABEL = "verify-wo-detail-linked-financials-no-box-in-box";
const SECTION_MARKER = 'data-testid="wo-linked-financials"';
const NESTED_AMBER_RE = /rounded-sm border border-amber-200 bg-amber-50/;
const NESTED_GRAY_CARD_RE = /rounded-sm border border-gray-200 bg-white p-[34]/;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full page source */
export function linkedFinancialsSection(src) {
  const body = stripComments(src);
  const marker = body.indexOf(SECTION_MARKER);
  if (marker < 0) return "";
  const sectionStart = body.lastIndexOf("<section", marker);
  const slice = body.slice(sectionStart >= 0 ? sectionStart : marker);
  const end = slice.indexOf("</section>");
  return end >= 0 ? slice.slice(0, end + "</section>".length) : slice;
}

/** @param {string} section linked financials JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes(SECTION_MARKER)) {
    problems.push(`${TARGET}: missing wo-linked-financials section marker`);
    return problems;
  }
  if (
    !/\<section[\s\S]*?className="[^"]*overflow-hidden rounded-sm border border-slate-200 bg-white[^"]*"[\s\S]*?data-testid="wo-linked-financials"/.test(
      section,
    )
  ) {
    problems.push(`${TARGET}: linked financials root must be a single overflow-hidden slate section frame`);
  }
  if (!/border-b border-slate-200 bg-slate-50/.test(section)) {
    problems.push(`${TARGET}: linked financials header must use border-b on the outer section (no inner card)`);
  }
  if (NESTED_AMBER_RE.test(section)) {
    problems.push(
      `${TARGET}: linked financials nests amber bordered alert tile(s) — flatten to border-t slate rows`,
    );
  }
  if (NESTED_GRAY_CARD_RE.test(section)) {
    problems.push(`${TARGET}: linked financials must not use padded nested gray cards (box-in-box chrome)`);
  }
  if (
    /<div className="[^"]*rounded-sm border[^"]*"[\s\S]*?<ParityTable[\s\S]*?tableTestId="wo-detail-linked-bills-parity"/.test(
      section,
    )
  ) {
    problems.push(
      `${TARGET}: linked bills ParityTable is wrapped in a nested bordered card — ParityTable is the single table frame`,
    );
  }
  if (
    /<div className="[^"]*rounded-sm border[^"]*"[\s\S]*?<ParityTable[\s\S]*?tableTestId="wo-detail-linked-expenses-parity"/.test(
      section,
    )
  ) {
    problems.push(
      `${TARGET}: linked expenses ParityTable is wrapped in a nested bordered card — ParityTable is the single table frame`,
    );
  }
  if (!section.includes('tableTestId="wo-detail-linked-bills-parity"')) {
    problems.push(`${TARGET}: must keep wo-detail-linked-bills-parity ParityTable marker`);
  }
  if (!section.includes('tableTestId="wo-detail-linked-expenses-parity"')) {
    problems.push(`${TARGET}: must keep wo-detail-linked-expenses-parity ParityTable marker`);
  }
  return problems;
}

function selftest() {
  const good = `
      <section className="overflow-hidden rounded-sm border border-slate-200 bg-white" data-testid="wo-linked-financials">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-sm font-semibold text-slate-900">Linked Bills / Expenses</div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700">Unavailable</div>
        <ParityTable storageKey="wo-detail-linked-bills" tableTestId="wo-detail-linked-bills-parity" />
        <ParityTable storageKey="wo-detail-linked-expenses" tableTestId="wo-detail-linked-expenses-parity" />
      </section>`;

  const badNested = `
      <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="wo-linked-financials">
        <div className="mb-2 text-sm font-semibold text-gray-900">Linked Bills / Expenses</div>
        <div className="rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">Unavailable</div>
        <div className="rounded-sm border border-gray-200 bg-white p-4">
          <ParityTable tableTestId="wo-detail-linked-bills-parity" />
        </div>
        <ParityTable tableTestId="wo-detail-linked-expenses-parity" />
      </section>`;

  const cases = [
    { name: "flat slate section + border-t rows → 0 errors", section: good, want: 0 },
    { name: "nested amber tile + bordered ParityTable wrapper → fail", section: badNested, wantMin: 2 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = collectProblems(c.section).length;
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
  const problems = collectProblems(linkedFinancialsSection(src));
  if (problems.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — WorkOrderDetail linked financials is a flat slate section (no box-in-box).`);
}
