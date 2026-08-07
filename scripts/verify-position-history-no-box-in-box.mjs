#!/usr/bin/env node
/**
 * verify-position-history-no-box-in-box.mjs
 * Position History table must not wrap ParityTable in an extra bordered card — ParityTable
 * already owns the single outer frame (Cascade design-bar / box-in-box class).
 *
 * --selftest exercises pass + nested-wrapper failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/safety/PositionHistoryPage.tsx";
const LABEL = "verify-position-history-no-box-in-box";
const TABLE_MARKER = 'tableTestId="position-history-table"';
const NESTED_WRAPPER_RE =
  /<div className="[^"]*(?:overflow-hidden )?rounded-(?:lg|md|sm) border border-gray-200 bg-white[^"]*"[\s\S]*?<ParityTable/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full page source */
export function tableRegion(src) {
  const body = stripComments(src);
  const marker = body.indexOf(TABLE_MARKER);
  if (marker < 0) return "";
  const mobileStart = body.lastIndexOf('data-testid="mobile-optimized-table"', marker);
  const sliceStart = mobileStart >= 0 ? mobileStart : body.lastIndexOf("<ParityTable", marker);
  const tail = body.slice(sliceStart >= 0 ? sliceStart : marker);
  const end = tail.indexOf("/>", tail.indexOf(TABLE_MARKER));
  return end >= 0 ? tail.slice(0, end + 2) : tail;
}

/** @param {string} region mobile-table + ParityTable JSX slice */
export function collectProblems(region) {
  const problems = [];
  if (!region.includes(TABLE_MARKER)) {
    problems.push(`${TARGET}: missing position-history ParityTable marker`);
    return problems;
  }
  if (NESTED_WRAPPER_RE.test(region)) {
    problems.push(
      `${TARGET}: ParityTable is wrapped in a nested bordered card — remove the inner box; ParityTable is the single frame`,
    );
  }
  if (/rounded-lg border border-gray-200 bg-white p-2/.test(region)) {
    problems.push(`${TARGET}: must not use padded nested table wrapper (box-in-box chrome)`);
  }
  if (!region.includes('data-testid="mobile-optimized-table"')) {
    problems.push(`${TARGET}: mobile-table-fallback wrapper must remain for responsive table law`);
  }
  return problems;
}

function selftest() {
  const good = `
    <div className="mobile-table-fallback w-full" data-testid="mobile-optimized-table">
      <ParityTable columns={columns} tableTestId="position-history-table" />
    </div>`;

  const badNested = `
    <div className="mobile-table-fallback w-full" data-testid="mobile-optimized-table">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-2">
        <ParityTable columns={columns} tableTestId="position-history-table" />
      </div>
    </div>`;

  const cases = [
    { name: "ParityTable direct under mobile wrapper → 0 errors", region: good, want: 0 },
    { name: "nested bordered wrapper around ParityTable → fail", region: badNested, wantMin: 1 },
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
  const problems = collectProblems(tableRegion(src));
  if (problems.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Position History table uses single ParityTable frame (no box-in-box)`);
}
