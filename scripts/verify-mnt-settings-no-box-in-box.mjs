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
const NESTED_TILE_RE = /className="[^"]*rounded-sm border border-(?:gray|slate)-200[^"]*"/g;

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
  if (!/overflow-hidden rounded-sm border border-slate-300 bg-white/.test(section)) {
    problems.push(`${TARGET}: root must be a single overflow-hidden slate section frame`);
  }
  if (!/border-b border-slate-200 bg-slate-50/.test(section)) {
    problems.push(`${TARGET}: header strip must use slate-50 border-b (navy palette)`);
  }
  const nested = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nested.filter(
    (m) => !m.includes("overflow-hidden rounded-sm border border-slate-300 bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: nests ${innerNested.length} bordered tile(s) — use divide-y / divide-x cells only`,
    );
  }
  if (!/divide-y divide-slate-200/.test(section)) {
    problems.push(`${TARGET}: settings groups must flatten with divide-y rows`);
  }
  if (/\<section className="rounded-sm border/.test(section.replace(/overflow-hidden rounded-sm border border-slate-300 bg-white/, ""))) {
    problems.push(`${TARGET}: inner <section> bordered cards forbidden (box-in-box)`);
  }
  return problems;
}

function selftest() {
  const good = `
    <section className="overflow-hidden rounded-sm border border-slate-300 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h2>Maintenance settings</h2>
      </div>
      <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="px-3 py-3">PM</div>
        <div className="px-3 py-3">Vendor</div>
      </div>
    </section>`;

  const badNested = `
    <form className="rounded-sm border border-gray-200 bg-white p-3">
      <section className="rounded-sm border border-gray-200 p-2">PM</section>
      <section className="rounded-sm border border-gray-200 p-2">Vendor</section>
    </form>`;

  const cases = [
    { name: "flat divide rows → 0 errors", section: good, want: 0 },
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
const problems = collectProblems(settingsSection(src));
if (problems.length) {
  console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — Maintenance Settings is flat divide rows (no box-in-box).`);
