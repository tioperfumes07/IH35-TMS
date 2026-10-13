#!/usr/bin/env node
// ROUND 443.33 (Lead, measured on CC-3's fork rehearsal): booking priced a load 1 cent off the settlement — 586.39 vs 586.40 on
// 5778 / 5779 — because book-load rounded the raw float product (1303.1 x 45 = 58639.4999…) instead of the ONE money rule:
// apps/backend/src/driver-finance/deadhead-rule.ts milesTimesRateCents (integer cents, half-up, float noise removed).
//
// Static: in the driver-pay / load-pricing engines (book-load, the Settlement Creator, the deadhead rule, driver bills), no
// Math.round over a miles x rate product outside milesTimesRateCents itself; booking's loaded leg and override and the
// Creator's line-haul seed call milesTimesRateCents. --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-driver-pay-rounding-one-rule";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULE = "apps/backend/src/driver-finance/deadhead-rule.ts";
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";
const SEED = "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts";
const SCAN_DIRS = ["apps/backend/src/dispatch", "apps/backend/src/driver-finance"];

/** A Math.round(...) whose argument multiplies a MILES value by a RATE value (unit conversions such as x 100 / x 10 are not money). */
function isRawMilesTimesRate(line) {
  const m = line.match(/Math\.round\(([^;]*)\)/);
  if (!m || !m[1].includes("*")) return false;
  const arg = m[1];
  return /\w*(miles|Miles)\w*/.test(arg.replace(/haversineMiles\([^)]*\)/g, "")) && /\w*(rate|Rate|perMile|PerMile)\w*/.test(arg);
}

export function scan(files) {
  const f = [];
  for (const [rel, text] of files) {
    text.split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (rel === RULE && /return Math\.round\(Number\(\(miles \* rateCents\)\.toFixed\(6\)\)\);/.test(line)) return; // the one rule itself
      if (isRawMilesTimesRate(line)) f.push(`${rel}:${i + 1}: raw Math.round over a miles x rate product — use milesTimesRateCents (${line.trim().slice(0, 120)})`);
    });
  }
  return f;
}

export function wiring(book, seed) {
  const f = [];
  if (!/milesTimesRateCents\(miles, perMile\)/.test(book)) f.push(`${BOOK}: the loaded leg must price with milesTimesRateCents`);
  if (!/const overrideCents = milesTimesRateCents\(perLoadMiles, perLoadRateDollars \* 100\);/.test(book)) f.push(`${BOOK}: the override must price with milesTimesRateCents`);
  if (!/milesTimesRateCents\(Number\(load\.loaded_miles\), load\.line_haul_rate_cents\)/.test(seed)) f.push(`${SEED}: the Creator's line haul must price with milesTimesRateCents`);
  return f;
}

function listTs(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== "__tests__") out.push(...listTs(rel)); }
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(rel);
  }
  return out;
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const files = () => SCAN_DIRS.flatMap(listTs).map((rel) => [rel, read(rel)]);

if (process.argv.includes("--selftest")) {
  const book = read(BOOK), seed = read(SEED);
  const fails = [];
  const clean = [...scan(files()), ...wiring(book, seed)];
  if (clean.length) fails.push(`tree not clean: ${clean.slice(0, 3).join("; ")}`);
  const plants = [
    ["raw loaded product", scan([[BOOK, "      cardCents = ok ? Math.round(perMile * miles) : null;"]])],
    ["raw override product", scan([[BOOK, "    const overrideCents = Math.round(perLoadRateDollars * 100 * perLoadMiles);"]])],
    ["raw creator product", scan([[SEED, "      ? Math.round(load.line_haul_rate_cents * Number(load.loaded_miles))"]])],
    ["raw abandonment product", scan([["apps/backend/src/driver-finance/abandonment.service.ts", "      : Math.round(miles * deadheadRate);"]])],
    ["loaded leg unwired", wiring(book.replace("milesTimesRateCents(miles, perMile)", "Math.round(perMile * miles)"), seed)],
    ["creator unwired", wiring(book, seed.replace("milesTimesRateCents(Number(load.loaded_miles), load.line_haul_rate_cents)", "0"))],
  ];
  for (const [name, out] of plants) if (out.length === 0) fails.push(`plant escaped: ${name}`);
  if (scan([[RULE, "  return Math.round(Number((miles * rateCents).toFixed(6)));"]]).length) fails.push("the one rule itself was flagged");
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 1}/${plants.length + 1}`);
  process.exit(0);
}

const fails = [...scan(files()), ...wiring(read(BOOK), read(SEED))];
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — miles x rate is priced by milesTimesRateCents only (dispatch + driver-finance)`);
