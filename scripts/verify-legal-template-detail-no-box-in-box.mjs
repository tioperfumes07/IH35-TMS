#!/usr/bin/env node
/**
 * verify-legal-template-detail-no-box-in-box.mjs
 * Legal template detail must use flat house-token section frames with divide rows — no nested
 * `rounded-sm border` tiles under section roots (QBO box-in-box law).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx";
const LABEL = "verify-legal-template-detail-no-box-in-box";
// LEAD 443.99 class B (2026-10-12) — palette anchors.
//   old rule: frame `border-slate-300`, headers `border-slate-200 bg-slate-50`, rows `divide-slate-200`; a nested
//             tile = ANY element with `rounded-sm border border-(gray|slate)-200`.
//   new rule: frame `overflow-hidden rounded-sm border border-[#E5E7EB] bg-white`, headers
//             `border-b border-[#E5E7EB] bg-[#F7F8FA]`, rows `divide-y divide-[#E5E7EB]` (locked house tokens,
//             docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md); a nested tile = a CONTAINER (div/section/form/article/label)
//             with `rounded-sm border border-(gray-200|slate-200|[#E5E7EB])` inside the detail root.
//   why: BANK-F91158 (#25812, 75e5ced987) moved this page off leftover slate onto the house tokens; the old anchors
//        could no longer see the unchanged flat layout. Inputs/textareas carry the border token by design, so the
//        tile check is limited to containers — a bordered inner card in any of the three palettes still fails.
const NESTED_TILE_RE = /<(?:div|section|form|article|label)\b[^>]*className="[^"]*rounded-sm border border-(?:gray-200|slate-200|\[#E5E7EB\])[^"]*"/g;
const FRAME = "overflow-hidden rounded-sm border border-[#E5E7EB] bg-white";
const MARKER = 'data-testid="legal-template-detail-page"';

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full component source */
export function detailSection(src) {
  const body = stripComments(src);
  const start = body.indexOf(MARKER);
  if (start < 0) return body;
  return body.slice(start);
}

/** @param {string} section detail JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes(MARKER)) {
    problems.push(`${TARGET}: missing ${MARKER} root marker`);
    return problems;
  }
  if (!section.includes(FRAME)) {
    problems.push(`${TARGET}: sections must use a single overflow-hidden house-token outer frame (${FRAME})`);
  }
  if (!/border-b border-\[#E5E7EB\] bg-\[#F7F8FA\]/.test(section)) {
    problems.push(`${TARGET}: section headers must use border-b border-[#E5E7EB] bg-[#F7F8FA] (house tokens)`);
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes(FRAME),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: nests ${innerNested.length} bordered tile(s) — use divide-y / flat rows only`,
    );
  }
  if (!/divide-y divide-\[#E5E7EB\]/.test(section)) {
    problems.push(`${TARGET}: metadata/content groups must flatten with divide-y rows`);
  }
  if (/\<label className="[^"]*rounded-sm border border-(?:gray-200|\[#E5E7EB\]) bg-white/.test(section)) {
    problems.push(`${TARGET}: label-wrapped bordered cards forbidden (box-in-box around textareas)`);
  }
  return problems;
}

function selftest() {
  const good = `
    <div data-testid="legal-template-detail-page">
      <section className="overflow-hidden rounded-sm border border-[#E5E7EB] bg-white">
        <div className="border-b border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2">Template metadata</div>
        <div className="divide-y divide-[#E5E7EB] px-3 py-3">
          <div className="pb-3">fields <input className="mt-1 h-9 w-full rounded-sm border border-[#E5E7EB] px-2 text-xs" /></div>
          <div className="py-3 bg-[#F7F8FA] px-2">status strip</div>
        </div>
      </section>
    </div>`;
  const badHouseTile = good.replace('<div className="pb-3">', '<div className="rounded-sm border border-[#E5E7EB] p-2">');
  const badHouseLabel = good.replace('<div className="pb-3">', '<label className="block rounded-sm border border-[#E5E7EB] bg-white p-3">').replace("</div>\n          <div className=\"py-3", "</label>\n          <div className=\"py-3");
  const badSlate = good.replaceAll("[#E5E7EB]", "slate-200").replaceAll("bg-[#F7F8FA]", "bg-slate-50");

  const badNested = `
    <div data-testid="legal-template-detail-page">
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="rounded-sm border border-gray-200 bg-white p-2">nested</div>
      </div>
      <label className="block rounded-sm border border-gray-200 bg-white p-3">
        <textarea className="border border-gray-300" />
      </label>
    </div>`;

  const cases = [
    { name: "flat divide rows → 0 errors", section: good, want: 0 },
    { name: "nested rounded-sm border tiles → fail", section: badNested, wantMin: 2 },
    { name: "house-token bordered inner card → fail", section: badHouseTile, wantMin: 1 },
    { name: "house-token label-wrapped card → fail", section: badHouseLabel, wantMin: 1 },
    { name: "leftover slate frame/header/rows → fail", section: badSlate, wantMin: 3 },
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
const problems = collectProblems(detailSection(src));
if (problems.length) {
  console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — Legal template detail is flat divide rows (no box-in-box).`);
