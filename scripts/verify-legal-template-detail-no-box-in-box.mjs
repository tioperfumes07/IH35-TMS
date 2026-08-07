#!/usr/bin/env node
/**
 * verify-legal-template-detail-no-box-in-box.mjs
 * Legal template detail must use flat slate section frames with divide rows — no nested
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
const NESTED_TILE_RE = /className="[^"]*rounded-sm border border-(?:gray|slate)-200[^"]*"/g;
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
  if (!/overflow-hidden rounded-sm border border-slate-300 bg-white/.test(section)) {
    problems.push(`${TARGET}: sections must use a single overflow-hidden slate-300 outer frame`);
  }
  if (!/border-b border-slate-200 bg-slate-50/.test(section)) {
    problems.push(`${TARGET}: section headers must use slate-50 border-b (navy palette)`);
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes("overflow-hidden rounded-sm border border-slate-300 bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: nests ${innerNested.length} bordered tile(s) — use divide-y / flat rows only`,
    );
  }
  if (!/divide-y divide-slate-200/.test(section)) {
    problems.push(`${TARGET}: metadata/content groups must flatten with divide-y rows`);
  }
  if (/\<label className="[^"]*rounded-sm border border-gray-200 bg-white/.test(section)) {
    problems.push(`${TARGET}: label-wrapped bordered cards forbidden (box-in-box around textareas)`);
  }
  return problems;
}

function selftest() {
  const good = `
    <div data-testid="legal-template-detail-page">
      <section className="overflow-hidden rounded-sm border border-slate-300 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">Template metadata</div>
        <div className="divide-y divide-slate-200 px-3 py-3">
          <div className="pb-3">fields</div>
          <div className="py-3 bg-slate-50 px-2">status strip</div>
        </div>
      </section>
    </div>`;

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
