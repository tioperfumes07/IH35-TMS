#!/usr/bin/env node
/**
 * ROUND 433-CUR #2 — ONE QBO format layer + year-selectable DatePicker.
 *
 * Lead measured apps/frontend/src/utils empty and no year selector on DatePicker.
 * Real formatters already live in lib/money + lib/formatDate; this guard pins:
 *   1) utils/qboFormat.ts barrel re-exports money + date + tabular-nums
 *   2) DatePicker calendar has aria-label="Year" <select> (year-selectable)
 *   3) Hand-rolled style:"currency" on money surfaces may only SHRINK (ratchet)
 *
 * Usage:
 *   node scripts/verify-qbo-format-layer.mjs
 *   node scripts/verify-qbo-format-layer.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-format-layer";
const BARREL = path.join(ROOT, "apps/frontend/src/utils/qboFormat.ts");
const DATEPICKER = path.join(ROOT, "apps/frontend/src/components/forms/DatePicker.tsx");
const SRC = path.join(ROOT, "apps/frontend/src");

/** Frozen after 433-CUR #2 banking/accounting conversion. Count may never go UP. */
const HANDROLL_CEILING = 58;

const EXEMPT = new Set([
  "apps/frontend/src/lib/money.ts",
  "apps/frontend/src/components/MoneyText.tsx",
  "apps/frontend/src/utils/qboFormat.ts",
]);

const REQUIRED_EXPORTS = [
  "formatUsdCents",
  "formatUsd",
  "formatNumber",
  "formatDateUS",
  "formatDateQboList",
  "QBO_MONEY_CELL_CLASS",
  "TABULAR_NUMS_CLASS",
];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "__tests__") continue;
      walk(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
}

export function countHandrolledCurrency(files) {
  const RAW = /style:\s*['"]currency['"]/;
  let occurrences = 0;
  for (const { relPath, source } of files) {
    if (EXEMPT.has(relPath)) continue;
    for (const line of source.split("\n")) {
      if (RAW.test(line)) occurrences += 1;
    }
  }
  return occurrences;
}

export function checkBarrel(source) {
  const missing = REQUIRED_EXPORTS.filter((name) => !source.includes(name));
  const reExportsMoney = /from\s+["']\.\.\/lib\/money["']/.test(source);
  const reExportsDate = /from\s+["']\.\.\/lib\/formatDate["']/.test(source);
  return { missing, reExportsMoney, reExportsDate };
}

export function checkDatePickerYearSelect(source) {
  const hasYearAria = /aria-label=["']Year["']/.test(source);
  const hasSelect = /<select[\s\S]*?aria-label=["']Year["']/.test(source) ||
    /aria-label=["']Year["'][\s\S]*?<\/select>/.test(source);
  const hasYearRange = /function yearRange\b/.test(source) || /yearRange\(/.test(source);
  return { hasYearAria, hasSelect, hasYearRange };
}

function fail(msg) {
  console.error(`${LABEL} FAIL — ${msg}`);
  process.exit(1);
}

function runSelftest() {
  const barrelOk = checkBarrel(`
    export { formatUsdCents, formatUsd, formatNumber, QBO_MONEY_CELL_CLASS } from "../lib/money";
    export { formatDateUS, formatDateQboList } from "../lib/formatDate";
    export { QBO_MONEY_CELL_CLASS as TABULAR_NUMS_CLASS } from "../lib/money";
  `);
  if (barrelOk.missing.length || !barrelOk.reExportsMoney || !barrelOk.reExportsDate) {
    throw new Error(`selftest barrel fixture must pass — got ${JSON.stringify(barrelOk)}`);
  }
  const barrelBad = checkBarrel(`export const x = 1;`);
  if (barrelBad.missing.length < 5) {
    throw new Error("selftest empty barrel must miss required exports");
  }

  const dpOk = checkDatePickerYearSelect(`
    function yearRange() { return [2020]; }
    <select aria-label="Year" className="dp-select">{years.map(y => <option>{y}</option>)}</select>
  `);
  if (!dpOk.hasYearAria || !dpOk.hasSelect || !dpOk.hasYearRange) {
    throw new Error(`selftest DatePicker year fixture must pass — got ${JSON.stringify(dpOk)}`);
  }
  const dpBad = checkDatePickerYearSelect(`<div>no year</div>`);
  if (dpBad.hasYearAria || dpBad.hasYearRange) {
    throw new Error("selftest DatePicker without year must fail");
  }

  const hand = countHandrolledCurrency([
    { relPath: "apps/frontend/src/lib/money.ts", source: `style: "currency"` },
    { relPath: "apps/frontend/src/pages/x.tsx", source: `style: "currency"\nstyle: "currency"` },
  ]);
  if (hand !== 2) throw new Error(`selftest hand-roll count expected 2 got ${hand}`);

  console.log(`[${LABEL}] --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  try {
    runSelftest();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
  process.exit(0);
}

if (!fs.existsSync(BARREL)) fail(`missing ${path.relative(ROOT, BARREL)} — build ONE format module at utils/qboFormat.ts`);
const barrelSrc = fs.readFileSync(BARREL, "utf8");
const barrel = checkBarrel(barrelSrc);
if (barrel.missing.length) fail(`utils/qboFormat.ts missing exports: ${barrel.missing.join(", ")}`);
if (!barrel.reExportsMoney) fail("utils/qboFormat.ts must re-export from ../lib/money (do not duplicate money math)");
if (!barrel.reExportsDate) fail("utils/qboFormat.ts must re-export from ../lib/formatDate (do not duplicate date math)");

if (!fs.existsSync(DATEPICKER)) fail("DatePicker.tsx missing");
const dpSrc = fs.readFileSync(DATEPICKER, "utf8");
const dp = checkDatePickerYearSelect(dpSrc);
if (!dp.hasYearAria) fail('DatePicker must offer a year selector (aria-label="Year") — owner: calendars cannot change the year');
if (!dp.hasSelect) fail('DatePicker year control must be a <select aria-label="Year">');
if (!dp.hasYearRange) fail("DatePicker must build a yearRange for the year <select>");

const files = [];
walk(SRC, files);
const entries = files.map((f) => ({
  relPath: path.relative(ROOT, f).split(path.sep).join("/"),
  source: fs.readFileSync(f, "utf8"),
}));
const handrolls = countHandrolledCurrency(entries);
if (handrolls > HANDROLL_CEILING) {
  fail(`hand-rolled style:"currency" went UP: ceiling ${HANDROLL_CEILING} -> ${handrolls}. Import from utils/qboFormat (or lib/money), never per-page Intl currency.`);
}

console.log(
  `${LABEL} OK — barrel exports ${REQUIRED_EXPORTS.length}/${REQUIRED_EXPORTS.length}; DatePicker year <select> pinned; hand-roll currency ${handrolls} (ceiling ${HANDROLL_CEILING}${handrolls < HANDROLL_CEILING ? `, ${HANDROLL_CEILING - handrolls} under` : ""})`,
);
process.exit(0);
