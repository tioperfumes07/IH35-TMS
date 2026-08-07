#!/usr/bin/env node
/**
 * verify-maint-labor-tracker-no-box-in-box.mjs
 * LaborTracker must use one outer section frame with flat border-t rows — ParityTable is the table
 * chrome; no nested bordered card wrapping it (CLS-BOX-IN-BOX). Entry column must show labor code
 * labels, not raw UUID slices (CLS-RAW-UUID-LABEL).
 *
 * --selftest exercises pass + nested-wrapper / raw-uuid failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/components/maintenance/LaborTracker.tsx";
const LABEL = "verify-maint-labor-tracker-no-box-in-box";
const FRAME_MARKER = 'data-testid="maint-labor-tracker"';
const TABLE_MARKER = 'tableTestId="maint-labor-entries-parity"';
const NESTED_WRAPPER_RE =
  /<div className="[^"]*(?:overflow-hidden )?rounded-(?:lg|md|sm) border border-gray-200 bg-white[^"]*"[\s\S]*?<ParityTable/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full component source */
export function trackerFrameRegion(src) {
  const body = stripComments(src);
  const start = body.indexOf(FRAME_MARKER);
  if (start < 0) return "";
  const open = body.lastIndexOf("<section", start);
  const close = body.indexOf("</section>", start);
  if (open < 0 || close < 0) return body.slice(open >= 0 ? open : start);
  return body.slice(open, close + "</section>".length);
}

/** @param {string} region section frame JSX slice */
export function collectProblems(region, fullSrc) {
  const problems = [];
  if (!region.includes(FRAME_MARKER)) {
    problems.push(`${TARGET}: missing maint-labor-tracker section wrapper`);
    return problems;
  }
  if (!region.includes(TABLE_MARKER)) {
    problems.push(`${TARGET}: missing maint-labor-entries ParityTable marker`);
    return problems;
  }
  if (!region.includes('data-testid="mobile-optimized-table"')) {
    problems.push(`${TARGET}: ParityTable must sit under mobile-table-fallback wrapper`);
  }
  if (NESTED_WRAPPER_RE.test(region)) {
    problems.push(
      `${TARGET}: ParityTable is wrapped in a nested bordered card — remove the inner box; ParityTable is the single table frame`,
    );
  }
  if (!/label: "Labor code"/.test(fullSrc)) {
    problems.push(`${TARGET}: entries table must label labor code column (not raw entry UUID)`);
  }
  if (/\.slice\(0,\s*8\)/.test(fullSrc)) {
    problems.push(`${TARGET}: must not render raw UUID slices in operator-visible entry labels`);
  }
  return problems;
}

function selftest() {
  const good = `
    <section className="overflow-hidden rounded-sm border border-gray-200 bg-white" data-testid="maint-labor-tracker">
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">header</div>
      <div className="p-3">controls</div>
      <div className="border-t border-gray-100" data-testid="maint-labor-entries-table">
        <div className="mobile-table-fallback w-full" data-testid="mobile-optimized-table">
          <ParityTable tableTestId="maint-labor-entries-parity" columns={[{ label: "Labor code" }]} />
        </div>
      </div>
    </section>`;

  const badNested = `
    <section data-testid="maint-labor-tracker">
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <ParityTable tableTestId="maint-labor-entries-parity" />
      </div>
    </section>`;

  const badUuid = `
    label: "ID",
    render: (row) => <span>{String(row.id).slice(0, 8)}</span>`;

  const cases = [
    { name: "flat section + direct ParityTable → 0 errors", region: good, src: good, want: 0 },
    { name: "nested bordered wrapper around ParityTable → fail", region: badNested, src: badNested, wantMin: 1 },
    { name: "raw UUID slice in column render → fail", region: good, src: `${good}\n${badUuid}`, wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = collectProblems(c.region, c.src).length;
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
  const problems = collectProblems(trackerFrameRegion(src), src);
  if (problems.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — LaborTracker uses flat section frame + labor-code labels (no box-in-box / raw UUID)`);
}
