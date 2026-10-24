#!/usr/bin/env node
/**
 * Register row 152 / audit D033 (Lead 443.301): Maintenance money tiles (MTD Cost, Open $, severe-repair totals,
 * Total Inventory Value) printed whole dollars — "$" + n.toLocaleString() drops the cents. QBO money is always two
 * decimals. Every Maintenance surface formats money through lib/money (formatUsd / formatUsdCents / formatUsdCentsTable)
 * or Intl currency style. Fails on a "$" glued to a bare toLocaleString(); --selftest plants each form and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.join(ROOT, "apps/frontend/src/pages/maintenance");
const LABEL = "verify-maintenance-money-two-decimals";
// "$${x.toLocaleString()}"  ·  >${x.toLocaleString()}<  (JSX text "$" then expression)  ·  "$" + x.toLocaleString()
const BAD = [
  /\$\$\{[^}]*toLocaleString\(\s*\)\s*\}/,
  /\$\{[^}]*\.toLocaleString\(\s*\)\s*\}/,
  /["'`]\$["'`]\s*\+\s*[^;\n]*toLocaleString\(\s*\)/,
];
const DATE_HINT = /Date\(|_at\b|\bat\)|toLocaleDateString|toLocaleTimeString/;

export function scan(files) {
  const out = [];
  for (const [file, src] of files) {
    src.split("\n").forEach((line, i) => {
      if (DATE_HINT.test(line)) return;
      if (BAD.some((re) => re.test(line))) out.push(`${file}:${i + 1}: money printed without cents — use formatUsd / formatUsdCents`);
    });
  }
  return out;
}

function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push([path.relative(ROOT, p), fs.readFileSync(p, "utf8")]);
  }
  return acc;
}

if (process.argv.includes("--selftest")) {
  const clean = [["clean.tsx", 'const v = formatUsd(n);\nconst eta = `ETA: ${new Date(x).toLocaleString()}`;']];
  if (scan(clean).length) { console.error(`${LABEL} SELFTEST FAIL: clean source rejected`); process.exit(1); }
  const plants = [
    ["template $$", "const usd = (n) => `$${n.toLocaleString()}`;"],
    ["jsx text $", "<span>${Number(a.total ?? 0).toLocaleString()}</span>"],
    ["concat", 'const s = "$" + total.toLocaleString();'],
  ];
  for (const [label, src] of plants) {
    if (!scan([["plant.tsx", src]]).length) { console.error(`${LABEL} SELFTEST FAIL: plant escaped — ${label}`); process.exit(1); }
  }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const bad = scan(walk(DIR));
if (bad.length) { console.error(`${LABEL}: FAIL — ${bad.length}\n  ${bad.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — 0 Maintenance money values printed without cents`);
