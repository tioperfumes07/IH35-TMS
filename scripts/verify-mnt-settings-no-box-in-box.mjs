#!/usr/bin/env node
/**
 * verify-mnt-settings-no-box-in-box.mjs
 * Maintenance Settings must use one outer section frame with flat divide rows — no nested
 * `rounded-sm border` tiles under the root (QBO/NetSuite box-in-box law).
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/maintenance/MaintenanceSettingsPage.tsx";
const LABEL = "verify-mnt-settings-no-box-in-box";
// LEAD 443.99 class B (2026-10-12) — palette anchors.
//   old rule: frame `border-slate-300`, header `border-slate-200 bg-slate-50`, rows `divide-slate-200`; a nested
//             tile = ANY element with `rounded-sm border border-(gray|slate)-200`.
//   new rule: frame `overflow-hidden rounded-sm border border-[#E5E7EB] bg-white`, header
//             `border-b border-[#E5E7EB] bg-[#F7F8FA]`, rows `divide-y divide-[#E5E7EB]` (the locked house tokens,
//             docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md: border #E5E7EB, page #F7F8FA); a nested tile = a CONTAINER
//             (div/section/form/article) with `rounded-sm border border-(gray-200|slate-200|[#E5E7EB])` under the root.
//   why: BANK-F91160 (#25814, 3daa5b1bc6) moved this page off leftover slate onto the house tokens; the old anchors
//        could no longer see the (unchanged) one-frame / flat-rows layout. Inputs carry the same border token by
//        design, so the tile check is limited to containers — a bordered inner card in any of the three palettes
//        still fails.
const NESTED_TILE_RE = /<(?:div|section|form|article)\b[^>]*className="[^"]*rounded-sm border border-(?:gray-200|slate-200|\[#E5E7EB\])[^"]*"/g;
const FRAME = "overflow-hidden rounded-sm border border-[#E5E7EB] bg-white";

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full component source */
export function settingsSection(src) {
  const body = stripComments(src);
  const start = body.indexOf('data-testid="maintenance-settings-page"');
  if (start < 0) return body;
  return body.slice(start);
}

/** @param {string} section settings JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes(FRAME)) {
    problems.push(`${TARGET}: root must be a single overflow-hidden house-token section frame (${FRAME})`);
  }
  if (!/border-b border-\[#E5E7EB\] bg-\[#F7F8FA\]/.test(section)) {
    problems.push(`${TARGET}: header strip must use border-b border-[#E5E7EB] bg-[#F7F8FA] (house tokens)`);
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes(FRAME),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: nests ${innerNested.length} bordered tile(s) — use divide-y / divide-x cells only`,
    );
  }
  if (!/divide-y divide-\[#E5E7EB\]/.test(section)) {
    problems.push(`${TARGET}: settings groups must flatten with divide-y rows`);
  }
  if (/\<section className="rounded-sm border/.test(section.replace(FRAME, ""))) {
    problems.push(`${TARGET}: inner <section> bordered cards forbidden (box-in-box)`);
  }
  return problems;
}

function selftest() {
  const good = `
    <section className="overflow-hidden rounded-sm border border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2">
        <h2>Maintenance settings</h2>
      </div>
      <div className="grid grid-cols-1 divide-y divide-[#E5E7EB] md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="px-3 py-3"><input className="mt-1 h-8 w-full rounded-sm border border-[#E5E7EB] px-2" /></div>
        <div className="px-3 py-3">Vendor</div>
      </div>
    </section>`;
  const badHouseTile = good.replace('<div className="px-3 py-3">Vendor</div>', '<div className="rounded-sm border border-[#E5E7EB] p-2">Vendor</div>');
  const badSlate = good.replaceAll("[#E5E7EB]", "slate-200").replace("bg-[#F7F8FA]", "bg-slate-50");

  const badNested = `
    <form className="rounded-sm border border-gray-200 bg-white p-3">
      <section className="rounded-sm border border-gray-200 p-2">PM</section>
      <section className="rounded-sm border border-gray-200 p-2">Vendor</section>
    </form>`;

  const cases = [
    { name: "flat divide rows → 0 errors", section: good, want: 0 },
    { name: "nested rounded-sm border tiles → fail", section: badNested, wantMin: 1 },
    { name: "house-token bordered inner card → fail", section: badHouseTile, wantMin: 1 },
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
const problems = collectProblems(settingsSection(src));
if (problems.length) {
  console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — Maintenance Settings is flat divide rows (no box-in-box).`);
