#!/usr/bin/env node
/**
 * verify-cashflow-outlook-no-box-in-box.mjs
 * Cash Flow Projected outlook must match CashFlow-Projected.dc.html (ROUND 8.5 CF3):
 * seven SEPARATE day tiles with gaps — not a joined strip, not nested rounded-lg/ring chrome.
 *
 * --selftest exercises pass + nested-tile / joined-strip failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx";
const LABEL = "verify-cashflow-outlook-no-box-in-box";
const NESTED_TILE_RE = /className="[^"]*rounded-lg[^"]*"/g;
const OUTLOOK_MARKER = 'data-testid="cash-flow-projected-outlook"';

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
  // Prefer the element that carries the test id (div or section).
  const openDiv = body.lastIndexOf("<div", marker);
  const openSection = body.lastIndexOf("<section", marker);
  const sectionStart = Math.max(openDiv, openSection);
  if (sectionStart < 0) return body.slice(marker);
  const tag = openDiv > openSection ? "div" : "section";
  const tail = body.slice(sectionStart);
  // Rough close: next sibling block at same indent is hard; take a bounded window.
  const endTag = `</${tag}>`;
  // Find matching close after a reasonable span of the outlook grid.
  let depth = 0;
  let i = 0;
  const openRe = new RegExp(`<${tag}\\b`, "g");
  const closeRe = new RegExp(endTag, "g");
  // Simple scan
  const tokens = [];
  const re = new RegExp(`</?${tag}\\b[^>]*>`, "g");
  let m;
  while ((m = re.exec(tail)) && tokens.length < 40) {
    tokens.push({ at: m.index, close: m[0].startsWith("</") });
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0) return tail.slice(0, m.index + m[0].length);
    } else {
      depth++;
    }
  }
  return tail.slice(0, 2500);
}

/** @param {string} section Projected outlook JSX slice */
export function collectProblems(section) {
  const problems = [];
  if (!section.includes(OUTLOOK_MARKER)) {
    problems.push(`${TARGET}: missing cash-flow-projected-outlook (CF3 seven-day tiles)`);
    return problems;
  }
  // CF3 board: seven-column grid with gap (separate tiles), not a joined divide-x strip.
  const separateTiles =
    /gridTemplateColumns:\s*"repeat\(7/.test(section) &&
    (/gap:\s*6\b/.test(section) || /gap:\s*6px/.test(section) || /gap:\s*"6px"/.test(section));
  if (!separateTiles) {
    problems.push(`${TARGET}: CF3 outlook must be repeat(7) grid with gap:6 separate day tiles`);
  }
  if (/7-Day Outlook/.test(section)) {
    problems.push(`${TARGET}: CF3 board has no extra "7-Day Outlook" heading above the tiles`);
  }
  const nestedRounded = section.match(NESTED_TILE_RE) ?? [];
  if (nestedRounded.length > 0) {
    problems.push(
      `${TARGET}: outlook nests ${nestedRounded.length} rounded-lg tile(s) — board uses square 2px tiles, no box-in-box`,
    );
  }
  if (/ring-2 ring-\[#1f2a44\]/.test(section)) {
    problems.push(`${TARGET}: outlook must not use ring borders on day cells (box-in-box chrome)`);
  }
  if (/divide-x divide-gray-100/.test(section)) {
    problems.push(`${TARGET}: CF3 forbids joined divide-x strip — use separate gapped tiles`);
  }
  return problems;
}

function selftest() {
  const goodBoard = `
    <div
      style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}
      data-testid="cash-flow-projected-outlook"
    >
      <button style={{ border: \`1px solid \${V3.border}\`, borderRadius: 2 }}>Mon</button>
    </div>`;

  const badJoinedHeading = `
    <section style={{ overflow: "hidden", border: \`1px solid \${V3.border}\`, background: V3.surface }} data-testid="cash-flow-projected-outlook">
      <p>7-Day Outlook</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        <button style={{ borderLeft: \`1px solid \${V3.borderSoft}\` }}>Mon</button>
      </div>
    </section>`;

  const badNested = `
    <div data-testid="cash-flow-projected-outlook" className="rounded-lg border">
      <div className="grid grid-cols-7 gap-1">
        <button className="rounded-lg ring-2 ring-[#1f2a44]">Mon</button>
      </div>
    </div>`;

  const cases = [
    { name: "CF3 separate gap:6 tiles → 0 errors", section: goodBoard, want: 0 },
    { name: "joined strip + heading → fail", section: badJoinedHeading, wantMin: 1 },
    { name: "nested rounded-lg + ring → fail", section: badNested, wantMin: 1 },
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
  console.log(`[${LABEL}] OK — CF3 Projected outlook uses separate gapped day tiles (board-identical)`);
}

main();
