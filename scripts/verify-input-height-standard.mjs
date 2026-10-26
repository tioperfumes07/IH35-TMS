#!/usr/bin/env node
/**
 * IH35-347-A: Input height standard guard.
 *
 * OWNER DESIGN LAW rule 2 (docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md; owner 10-25-2026 4:05 PM):
 *   40px (h-10) — a field being edited in a form (FORM_INPUT_CLASS, FORM_FIELD_CONTROL_SIZE_CLASS)
 *   34px (h-8.5) — every filter / select / search box (FILTER_CONTROL_SIZE_CLASS)
 * (This guard said h-9 / 36px until 10-25-2026 — off the law.) Inside every popup/drawer the 40px height, the 132px date
 * box and the 120px money box are enforced ONCE by styles/control-sizing-law.css; this guard fails if that file loses
 * its import or its values.
 *
 * Allowlist exceptions (compact UI utilities, not form fields):
 *   table/Paginator.tsx   — page-jump input
 *   table/ColumnChooser.tsx — column-search input (popover)
 *   forms/              — primitive source of truth (fixed at the source)
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "apps/frontend/src");

// Non-standard height patterns on input/select elements (spec IH35-347-A).
// h-7 (28px), h-[30px], h-[38px]: the classes the spec explicitly calls out for removal.
// h-8 (32px) is not in scope for this guard (it is a separate follow-up sweep).
const BANNED_HEIGHTS = [
  /\bh-7\b/,
  /h-\[30px\]/,
  /h-\[38px\]/,
  /h-\[28px\]/,
];

// Files/paths exempt from this check
const ALLOWLIST = [
  "table/Paginator.tsx",       // compact page-jump input
  "table/ColumnChooser.tsx",   // compact column-search input
];

function isAllowlisted(filePath) {
  return ALLOWLIST.some((p) => filePath.endsWith(p));
}

/** A grep'd `<input`/`<select` line carrying a className with a banned height. */
function isBannedLine(content) {
  return content.includes("className") && BANNED_HEIGHTS.some((p) => p.test(content));
}

function readLawSources() {
  return {
    law: readFileSync(path.join(SRC, "styles/control-sizing-law.css"), "utf8"),
    idx: readFileSync(path.join(SRC, "index.css"), "utf8"),
    tokens: readFileSync(path.join(SRC, "design/tokens.ts"), "utf8"),
    inputCls: readFileSync(path.join(SRC, "components/forms/inputClass.ts"), "utf8"),
  };
}

/** Pure check of the CONTROL SIZING LAW sources so --selftest can plant defects into copies. */
function lawFailures({ law, idx, tokens, inputCls }) {
  const need = [
    [/@import ['"]\.\/styles\/control-sizing-law\.css['"]/.test(idx), "index.css must @import ./styles/control-sizing-law.css"],
    [/height:\s*40px/.test(law), "control-sizing-law.css must set form fields to height: 40px"],
    [/width:\s*132px/.test(law), "control-sizing-law.css must set date boxes to width: 132px"],
    [/width:\s*120px/.test(law), "control-sizing-law.css must set money boxes to width: 120px"],
    [/FORM_FIELD_CONTROL_SIZE_CLASS = "h-10 /.test(tokens), "design/tokens.ts FORM_FIELD_CONTROL_SIZE_CLASS must be h-10 (40px)"],
    [/FORM_INPUT_CLASS = "h-10 /.test(inputCls), "components/forms/inputClass.ts FORM_INPUT_CLASS must be h-10 (40px)"],
  ];
  return need.filter(([ok]) => !ok).map(([, msg]) => msg);
}

if (process.argv.includes("--selftest")) {
  const real = readLawSources();
  const cases = [["real sizing-law sources pass", lawFailures(real).length === 0]];
  const plant = (key, from, to) => ({ ...real, [key]: real[key].split(from).join(to) });
  for (const [name, mutated] of [
    ["index.css loses the sizing-law import", { ...real, idx: real.idx.replace(/@import ['"]\.\/styles\/control-sizing-law\.css['"];?/g, "") }],
    ["form fields drop to 36px", { ...real, law: real.law.replace(/height:\s*40px/g, "height: 36px") }],
    ["date box widened off the law", { ...real, law: real.law.replace(/width:\s*132px/g, "width: 160px") }],
    ["FORM_INPUT_CLASS back to h-9", plant("inputCls", 'FORM_INPUT_CLASS = "h-10 ', 'FORM_INPUT_CLASS = "h-9 ')],
  ]) cases.push([`planted "${name}" caught`, JSON.stringify(mutated) !== JSON.stringify(real) && lawFailures(mutated).length > 0]);
  cases.push(['banned h-7 input line is flagged', isBannedLine('<input className="h-7 w-full" />')]);
  cases.push(['banned h-[38px] select line is flagged', isBannedLine('<select className="h-[38px]">')]);
  cases.push(['h-10 input line is not flagged', !isBannedLine('<input className="h-10 w-full" />')]);
  let ok = 0;
  for (const [name, pass] of cases) { console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`); if (pass) ok += 1; }
  console.log(`verify-input-height-standard SELFTEST ${ok === cases.length ? "PASS" : "FAIL"} — ${ok}/${cases.length} cases`);
  process.exit(ok === cases.length ? 0 : 1);
}

let violations = [];

// grep for lines that contain a raw <input or <select with a className that has a banned height
// We look for multi-token patterns: a line with <input or <select AND a banned height class
try {
  const result = execSync(
    `grep -rn '<input\\|<select' ${SRC} --include="*.tsx"`,
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );

  for (const line of result.split("\n")) {
    if (!line.trim()) continue;
    const colonIdx = line.indexOf(":");
    const rest = line.slice(colonIdx + 1);
    const lineNumEnd = rest.indexOf(":");
    const filePath = line.slice(0, colonIdx);
    const lineNum = rest.slice(0, lineNumEnd);
    const content = rest.slice(lineNumEnd + 1);

    // Skip test files
    if (filePath.includes("__tests__") || filePath.includes(".test.")) continue;
    // Skip allowlisted files
    if (isAllowlisted(filePath)) continue;

    if (isBannedLine(content)) {
      violations.push({ file: filePath.replace(ROOT + "/", ""), line: lineNum, content: content.trim() });
    }
  }
} catch (e) {
  if (e.status !== 1) {
    // grep exit 1 = no matches (OK); other errors = real errors
    console.error("grep error:", e.message);
    process.exit(1);
  }
}

// CONTROL SIZING LAW — the one place the popup/drawer field sizes are set must stay wired and on the law's values.
for (const msg of lawFailures(readLawSources())) violations.push({ file: "control-sizing-law", line: "-", content: msg });

if (violations.length > 0) {
  console.error(`verify-input-height-standard: FAIL — ${violations.length} input element(s) with non-standard height:`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.content.slice(0, 120)}`);
  }
  console.error("Standard heights: h-10 / 40px (form fields) · h-8.5 / 34px (filters, search). Fix at the primitive, not at the screen.");
  process.exit(1);
}

console.log(`verify-input-height-standard: PASS — 0 non-standard input heights`);
process.exit(0);
