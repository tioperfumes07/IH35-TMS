#!/usr/bin/env node
/**
 * verify:money-input-format  (SYS-MONEY root guard — Wave 1B)
 *
 * Locks the money INPUT/DISPLAY formatting fixes so they cannot regress:
 *
 *  1. The shared MoneyInput ($ prefix + value) must render "$0.00" with NO gap.
 *     Regression shape: the value column drifts back to `text-right` (which floats
 *     the number to the far edge, reading "$   0.00"). Assert MoneyInput keeps the
 *     $ glyph immediately before a left-aligned value.
 *
 *  2. No user-facing money field may render a literal "$ <digit>" (space between the
 *     dollar sign and a number) in any placeholder / default / string across the
 *     frontend src tree.
 *
 *  3. The Cash Flow money formatters must show two decimal places — the "Predicted
 *     net cash flow" total regressed to `$0` via `maximumFractionDigits: 0`. Forbid
 *     that anti-pattern in the cash-flow tabs.
 *
 * Every fix gets a static CI guard so it can't silently come back.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "apps/frontend/src");

const failures = [];
function fail(msg) {
  failures.push(msg);
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`missing expected file: ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

// ── Check 1: shared MoneyInput keeps $ adjacent to a left-aligned value ──────────
const moneyInputRel = "apps/frontend/src/components/forms/MoneyInput.tsx";
const moneyInput = read(moneyInputRel);
if (moneyInput) {
  // The single <input> in MoneyInput must be left-aligned so the value hugs the $.
  const inputMatch = moneyInput.match(/<input[\s\S]*?className="([^"]*)"/);
  if (!inputMatch) {
    fail(`${moneyInputRel}: could not locate the money <input> className`);
  } else {
    const cls = inputMatch[1];
    if (/\btext-right\b/.test(cls)) {
      fail(
        `${moneyInputRel}: money <input> is text-right again — that floats the value to the far edge and reopens the "$   0.00" gap. Use text-left so it renders "$0.00".`
      );
    }
    if (!/\btext-left\b/.test(cls)) {
      fail(`${moneyInputRel}: money <input> must be text-left so the value sits immediately after the $ (renders "$0.00").`);
    }
  }
  // The $ prefix span must still be present.
  if (!/>\$<\/span>/.test(moneyInput)) {
    fail(`${moneyInputRel}: the "$" prefix span is missing.`);
  }
}

// ── Check 2: no literal "$ <digit>" (space between $ and a number) anywhere ──────
const LITERAL_GAP = /\$ \d/; // "$ 0", "$ 1,234", etc.
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(full);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (LITERAL_GAP.test(line)) {
          const rel = path.relative(ROOT, full);
          fail(`${rel}:${i + 1}: literal "$ <digit>" money string — remove the space (should be "$0.00", not "$ 0.00"): ${line.trim()}`);
        }
      });
    }
  }
}
if (fs.existsSync(SRC)) walk(SRC);

// ── Check 3: cash-flow money formatters must not drop cents ──────────────────────
const CASHFLOW_TABS = [
  "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx",
  "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx",
];
for (const rel of CASHFLOW_TABS) {
  const src = read(rel);
  if (!src) continue;
  // Forbid currency formatting that truncates cents (maximumFractionDigits: 0 on a USD currency format).
  const currencyLines = src.split("\n");
  currencyLines.forEach((line, i) => {
    if (/style:\s*"currency"/.test(line) && /maximumFractionDigits:\s*0\b/.test(line)) {
      fail(`${rel}:${i + 1}: money value truncated to 0 decimals (maximumFractionDigits: 0) — money must show two decimals ("$0.00", not "$0").`);
    }
  });
}

if (failures.length > 0) {
  console.error("verify:money-input-format FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:money-input-format: ok");
