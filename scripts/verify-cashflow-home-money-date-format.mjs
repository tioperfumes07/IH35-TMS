#!/usr/bin/env node
/**
 * Codex Round 7.6 — Cash Flow Home 13-week matrix must show $ + cents and MM/DD/YYYY week labels.
 * formatCompactDollars (rounded bare dollars + MM-DD) is forbidden.
 */
import fs from "node:fs";

const LABEL = "verify-cashflow-home-money-date-format";
const FILE = "apps/frontend/src/pages/cash-flow/tabs/CashFlowHomeTab.tsx";

const src = fs.readFileSync(FILE, "utf8");
const fails = [];

if (!/import \{ formatDateUS \} from ["'].*formatDate["']/.test(src)) {
  fails.push(`${FILE}: must import formatDateUS`);
}
if (!/formatDateUS\(iso\)/.test(src) && !/return formatDateUS\(iso\)/.test(src)) {
  fails.push(`${FILE}: weekLabel/monthLabel must use formatDateUS`);
}
if (/return `\$\{m\}-\$\{d\}`/.test(src) || /return `\${m}-\${d}`/.test(src)) {
  fails.push(`${FILE}: must not render MM-DD week labels`);
}
if (/function formatCompactDollars/.test(src)) {
  fails.push(`${FILE}: formatCompactDollars (rounded bare dollars) is forbidden`);
}
if (!/formatUsdCents\(cents\)/.test(src) && !/formatMatrixMoney/.test(src)) {
  fails.push(`${FILE}: matrix money must route through formatUsdCents`);
}
if (!/function formatMatrixMoney/.test(src)) {
  fails.push(`${FILE}: must keep formatMatrixMoney helper for null → —`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = src
    .replace(/import \{ formatDateUS \} from ["'][^"']+["'];\n?/, "")
    .replace(/function weekLabel\(iso: string\): string \{[\s\S]*?\n\}/, 'function weekLabel(iso: string): string {\n  const [, m, d] = iso.split("-");\n  return `${m}-${d}`;\n}')
    .replace(/function formatMatrixMoney[\s\S]*?\n\}/, "function formatCompactDollars(cents: number | null): string {\n  if (cents === null || cents === 0) return \"—\";\n  return String(Math.round(Math.abs(cents) / 100));\n}")
    .replace(/formatMatrixMoney/g, "formatCompactDollars");
  const planted = [];
  if (!/import \{ formatDateUS \}/.test(plant)) planted.push("no formatDateUS import");
  if (/return `\$\{m\}-\$\{d\}`/.test(plant) || /\$\{m\}-\$\{d\}/.test(plant)) planted.push("mm-dd");
  if (/function formatCompactDollars/.test(plant)) planted.push("compact");
  if (planted.length < 2) {
    console.error(`${LABEL} --selftest FAIL plant weak`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Cash Flow Home uses formatUsdCents + formatDateUS`);
