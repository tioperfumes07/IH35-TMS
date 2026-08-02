#!/usr/bin/env node
/**
 * verify-mnt-pm-countdown-no-box-in-box.mjs
 * Maintenance PM Countdown non-compact path must use a single outer frame with flat border-t rows
 * (same QBO/NetSuite chrome as the compact path) — no nested `rounded-sm border` tiles under the root.
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/maintenance/components/MaintenancePmCountdownCards.tsx";
const LABEL = "verify-mnt-pm-countdown-no-box-in-box";
const NESTED_TILE_RE = /className="[^"]*rounded-sm border border-gray-200[^"]*"/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full component source */
export function nonCompactSection(src) {
  const body = stripComments(src);
  const compactEnd = body.indexOf("  }\n\n  return (");
  if (compactEnd < 0) return body;
  return body.slice(compactEnd);
}

/** @param {string} section non-compact JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!/\<section className="overflow-hidden rounded-sm border border-gray-200 bg-white"\>/.test(section)) {
    problems.push(`${TARGET}: non-compact root must be a single overflow-hidden section frame`);
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  // Outer section uses rounded-sm border once; any additional match is a nested tile regression.
  const innerNested = nested.filter(
    (m) => !m.includes("overflow-hidden rounded-sm border border-gray-200 bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: non-compact path nests ${innerNested.length} bordered tile(s) — use border-t rows only`,
    );
  }
  if (!/border-t border-gray-100/.test(section)) {
    problems.push(`${TARGET}: non-compact path must flatten PM types with border-t rows`);
  }
  if (/grid grid-cols-2/.test(section)) {
    problems.push(`${TARGET}: non-compact path must not use nested grid tiles (box-in-box chrome)`);
  }
  return problems;
}

function selftest() {
  const good = `
  return (
    <section className="overflow-hidden rounded-sm border border-gray-200 bg-white">
      <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
        <h3>PM Countdown</h3>
      </div>
      <div className="flex flex-col">
        <div className="border-t border-gray-100 px-3 py-2 first:border-t-0">Oil</div>
      </div>
    </section>
  );`;

  const badNested = `
  return (
    <div className="rounded-sm border border-gray-200 bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-sm border border-gray-200 bg-gray-50 px-3 py-2">Oil</div>
      </div>
    </div>
  );`;

  const cases = [
    { name: "flat border-t rows → 0 errors", section: good, want: 0 },
    { name: "nested rounded-sm border tiles → fail", section: badNested, wantMin: 1 },
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

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const filePath = path.join(ROOT, TARGET);
if (!fs.existsSync(filePath)) {
  console.error(`[${LABEL}] FAILED — missing ${TARGET}`);
  process.exit(1);
}
const src = fs.readFileSync(filePath, "utf8");
const problems = collectProblems(nonCompactSection(src));
if (problems.length) {
  console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — PM Countdown non-compact path is flat border-t rows (no box-in-box).`);
