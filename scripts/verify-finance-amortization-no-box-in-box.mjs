#!/usr/bin/env node
/**
 * verify-finance-amortization-no-box-in-box.mjs
 * Finance Amortization workspace must use a single outer section frame with flat
 * divide/border-t cells — no nested `rounded-sm border` tiles (Cascade BOX-IN-BOX class).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/finance/AmortizationPage.tsx";
const LABEL = "verify-finance-amortization-no-box-in-box";
const NESTED_TILE_RE = /className="[^"]*rounded-sm border border-slate-200 bg-white p-4[^"]*"/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** Slice covering the main amortization workspace (New loan + Loans + Schedule). */
export function workspaceSection(src) {
  const body = stripComments(src);
  const start = body.indexOf("New loan");
  if (start < 0) return "";
  const sectionStart = body.lastIndexOf("<section", start);
  const endMarker = body.indexOf("</section>", start);
  const end = endMarker >= 0 ? endMarker + "</section>".length : body.length;
  return body.slice(sectionStart >= 0 ? sectionStart : start, end);
}

/** @param {string} section workspace JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes("New loan")) {
    problems.push(`${TARGET}: missing New loan column header`);
    return problems;
  }
  if (!section.includes("Loans")) {
    problems.push(`${TARGET}: missing Loans column header`);
  }
  if (!section.includes("Schedule")) {
    problems.push(`${TARGET}: missing Schedule column header`);
  }
  if (!/\<section className="overflow-hidden rounded-sm border border-slate-200 bg-white"\>/.test(section)) {
    problems.push(`${TARGET}: workspace must use a single overflow-hidden section frame`);
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  if (nested.length > 0) {
    problems.push(
      `${TARGET}: nests ${nested.length} inner bordered white card(s) — flatten to one section frame`,
    );
  }
  if (/grid grid-cols-1 gap-6 lg:grid-cols-3/.test(section)) {
    problems.push(`${TARGET}: must not use gap-6 nested tile grid (box-in-box chrome)`);
  }
  if (!/lg:divide-x lg:divide-slate-100/.test(section)) {
    problems.push(`${TARGET}: workspace grid must flatten with lg:divide-x columns`);
  }
  if (!/border-b border-slate-200 bg-slate-50/.test(section)) {
    problems.push(`${TARGET}: column headers must use border-b strips inside single frame`);
  }
  if (!/bg-\[#1f2a44\]/.test(section)) {
    problems.push(`${TARGET}: primary Create action must use navy bg-[#1f2a44]`);
  }
  return problems;
}

function selftest() {
  const good = `
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="grid grid-cols-1 lg:grid-cols-3 lg:divide-x lg:divide-slate-100">
        <div>
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">New loan</div>
          <div className="px-4 py-3">
            <button className="bg-[#1f2a44]">Create</button>
          </div>
        </div>
        <div>
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">Loans</div>
        </div>
        <div>
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">Schedule</div>
        </div>
      </div>
    </section>`;

  const badNested = `
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="rounded-sm border border-slate-200 bg-white p-4">
        <h2>New loan</h2>
      </div>
    </div>`;

  const cases = [
    { name: "flat section + divide-x columns → 0 errors", section: good, want: 0 },
    { name: "nested rounded border white cards → fail", section: badNested, wantMin: 1 },
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
  const problems = collectProblems(workspaceSection(src));
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Amortization workspace is a flat section frame (no box-in-box).`);
}
