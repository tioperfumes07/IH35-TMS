#!/usr/bin/env node
/**
 * verify-cashflow-outlook-no-box-in-box.mjs
 * Cash Flow 7-Day Outlook strip must use a single outer section frame with flat divide-x day cells
 * (ORPH-004 / AUD-F016) — no nested rounded-lg tiles or ring borders inside the bordered card.
 *
 * --selftest exercises pass + nested-tile failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx";
const LABEL = "verify-cashflow-outlook-no-box-in-box";
const NESTED_TILE_RE = /className="[^"]*rounded-lg[^"]*"/g;
const OUTLOOK_MARKER = "7-Day Outlook";

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/** @param {string} src full component source */
export function outlookSection(src) {
  const body = stripComments(src);
  const marker = body.indexOf(OUTLOOK_MARKER);
  if (marker < 0) return "";
  const sectionStart = body.lastIndexOf("<section", marker);
  if (sectionStart < 0) return body.slice(marker);
  const tail = body.slice(sectionStart);
  const end = tail.indexOf("</section>");
  return end >= 0 ? tail.slice(0, end + "</section>".length) : tail;
}

/** @param {string} section 7-Day Outlook JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes(OUTLOOK_MARKER)) {
    problems.push(`${TARGET}: missing 7-Day Outlook strip`);
    return problems;
  }
  if (!/<section className="overflow-hidden rounded-lg border border-gray-200 bg-white">/.test(section)) {
    problems.push(`${TARGET}: 7-Day Outlook root must be a single overflow-hidden section frame`);
  }
  const nestedRounded = section.match(NESTED_TILE_RE) ?? [];
  const innerNested = nestedRounded.filter(
    (m) => !m.includes("overflow-hidden rounded-lg border border-gray-200 bg-white"),
  );
  if (innerNested.length > 0) {
    problems.push(
      `${TARGET}: 7-Day Outlook nests ${innerNested.length} rounded-lg tile(s) — use flat divide-x cells only`,
    );
  }
  if (/ring-2 ring-\[#1f2a44\]/.test(section)) {
    problems.push(`${TARGET}: 7-Day Outlook must not use ring borders on day cells (box-in-box chrome)`);
  }
  if (!/divide-x divide-gray-100/.test(section)) {
    problems.push(`${TARGET}: 7-Day Outlook must flatten day cells with divide-x rows`);
  }
  if (/grid grid-cols-7 gap-1/.test(section)) {
    problems.push(`${TARGET}: 7-Day Outlook must not use gap-1 nested tiles (box-in-box chrome)`);
  }
  return problems;
}

function selftest() {
  const good = `
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
        <p>7-Day Outlook</p>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[420px] grid-cols-7 divide-x divide-gray-100">
          <button className="flex flex-col items-center py-2 transition-colors hover:bg-gray-50">Mon</button>
        </div>
      </div>
    </section>`;

  const badNested = `
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p>7-Day Outlook</p>
      <div className="grid grid-cols-7 gap-1 min-w-[420px]">
        <button className="flex flex-col items-center rounded-lg py-2 ring-2 ring-[#1f2a44]">Mon</button>
      </div>
    </div>`;

  const cases = [
    { name: "flat divide-x cells → 0 errors", section: good, want: 0 },
    { name: "nested rounded-lg + ring tiles → fail", section: badNested, wantMin: 1 },
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

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const full = path.join(ROOT, TARGET);
  if (!fs.existsSync(full)) {
    console.error(`[${LABEL}] FAIL: ${TARGET} missing`);
    process.exit(1);
  }
  const src = fs.readFileSync(full, "utf8");
  const section = outlookSection(src);
  const problems = collectProblems(section);
  if (problems.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — 7-Day Outlook uses flat section + divide-x cells (ORPH-004)`);
}

main();
