#!/usr/bin/env node
/**
 * verify-lst-complaint-types-list-chrome.mjs
 * Complaint Types catalog list must use one outer section frame with a flat border-b filter row —
 * no separate bordered filter card stacked above DataTable's own border (list chrome box-in-box).
 *
 * --selftest exercises pass + nested-filter-card failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/lists/safety/ComplaintTypesListPage.tsx";
const LABEL = "verify-lst-complaint-types-list-chrome";
const FRAME_MARKER = 'data-testid="complaint-types-list-frame"';
const NESTED_FILTER_RE = /className="[^"]*rounded-sm border border-gray-200 bg-white p-3[^"]*"/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full page source */
export function listFrameSection(src) {
  const body = stripComments(src);
  const marker = body.indexOf(FRAME_MARKER);
  if (marker < 0) return "";
  const sectionStart = body.lastIndexOf("<section", marker);
  if (sectionStart < 0) return body.slice(marker);
  const tail = body.slice(sectionStart);
  const end = tail.indexOf("</section>");
  return end >= 0 ? tail.slice(0, end + "</section>".length) : tail;
}

/** @param {string} section list frame JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes(FRAME_MARKER)) {
    problems.push(`${TARGET}: missing complaint-types-list-frame section wrapper`);
    return problems;
  }
  if (!/<section[\s\S]*className="overflow-hidden rounded-sm border border-gray-200 bg-white"/.test(section)) {
    problems.push(`${TARGET}: list root must be a single overflow-hidden section frame`);
  }
  if (!/border-b border-gray-200 bg-gray-50/.test(section)) {
    problems.push(`${TARGET}: filter toolbar must use border-b on the outer section (no inner card)`);
  }
  if (!/\[&>div\]:rounded-none \[&>div\]:border-0/.test(section)) {
    problems.push(`${TARGET}: DataTable shell must strip duplicate outer border inside the section frame`);
  }
  const nestedFilters = section.match(NESTED_FILTER_RE) ?? [];
  if (nestedFilters.length > 0) {
    problems.push(
      `${TARGET}: filter toolbar nests ${nestedFilters.length} standalone bordered white card(s) — flatten to border-b row`,
    );
  }
  return problems;
}

function selftest() {
  const good = `
      <section className="overflow-hidden rounded-sm border border-gray-200 bg-white" data-testid="complaint-types-list-frame">
        <div className="grid gap-2 border-b border-gray-200 bg-gray-50 p-3 md:grid-cols-3">filters</div>
        <div className="[&>div]:rounded-none [&>div]:border-0">
          <DataTable />
        </div>
      </section>`;

  const badNested = `
      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-3">filters</div>
      <DataTable />`;

  const cases = [
    { name: "flat section + border-b filters → 0 errors", section: good, want: 0 },
    { name: "standalone bordered filter card → fail", section: badNested, wantMin: 1 },
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

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) {
    console.error(`[${LABEL}] FAILED — missing ${TARGET}`);
    process.exit(1);
  }
  const src = fs.readFileSync(filePath, "utf8");
  const problems = collectProblems(listFrameSection(src));
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Complaint Types list is a flat section frame (no box-in-box).`);
}
