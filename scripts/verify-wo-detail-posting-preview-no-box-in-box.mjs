#!/usr/bin/env node
/**
 * verify-wo-detail-posting-preview-no-box-in-box.mjs
 * WorkOrderDetailPage Posting Preview must use one outer section frame with flat border-t rows
 * for status copy — no nested `rounded-sm border` tiles under the section root (QBO box-in-box law).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const LABEL = "verify-wo-detail-posting-preview-no-box-in-box";
const SECTION_MARKER = 'data-testid="wo-detail-posting-preview-section"';
const NESTED_TILE_RE = /className="[^"]*rounded-sm border border-(?:amber|gray|slate)-200[^"]*"/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full page source */
export function postingPreviewSection(src) {
  const body = stripComments(src);
  const start = body.indexOf(SECTION_MARKER);
  if (start < 0) return "";
  const openTag = body.lastIndexOf("<section", start);
  const closeIdx = body.indexOf("</section>", start);
  if (openTag < 0 || closeIdx < 0) return body.slice(openTag >= 0 ? openTag : start);
  return body.slice(openTag, closeIdx + "</section>".length);
}

/** @param {string} section posting-preview JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes(SECTION_MARKER)) {
    problems.push(`${TARGET}: missing Posting Preview section marker (${SECTION_MARKER})`);
    return problems;
  }
  if (!/\<section[\s\S]*?className="overflow-hidden rounded-sm border border-slate-200 bg-white"/.test(section)) {
    problems.push(`${TARGET}: Posting Preview root must be a single overflow-hidden slate section frame`);
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes("overflow-hidden rounded-sm border border-slate-200 bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: Posting Preview nests ${innerNested.length} bordered tile(s) — use border-t slate rows only`,
    );
  }
  if (!/border-t border-slate-200 bg-slate-50/.test(section)) {
    problems.push(`${TARGET}: Posting Preview status rows must use flat border-t slate-50 rows`);
  }
  if (/border-amber-200 bg-amber-50/.test(section)) {
    problems.push(`${TARGET}: Posting Preview must not use amber nested status tiles (§7 slate law)`);
  }
  return problems;
}

function selftest() {
  const good = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white" data-testid="wo-detail-posting-preview-section">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900">Posting Preview</div>
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-800">Unavailable</div>
      <div className="space-y-2 border-t border-slate-200 px-4 py-3">
        <ParityTable tableTestId="wo-detail-posting-preview-parity" />
      </div>
    </section>`;

  const badNested = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white" data-testid="wo-detail-posting-preview-section">
      <div className="mb-2 text-sm font-semibold">Posting Preview</div>
      <div className="rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-xs">Unavailable</div>
    </section>`;

  const cases = [
    { name: "flat border-t slate rows → 0 errors", section: good, want: 0 },
    { name: "nested amber bordered tile → fail", section: badNested, wantMin: 1 },
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
  const problems = collectProblems(postingPreviewSection(src));
  if (problems.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — WorkOrderDetail Posting Preview is flat slate rows (no box-in-box).`);
}
