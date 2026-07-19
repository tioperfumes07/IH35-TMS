#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ratesFile = path.join(ROOT, "apps/backend/src/ifta/ifta-tax-rates.json");
// Official final-rate calendar: https://www.iftach.org/downloads/Tax%20Rate%20Calendar%202026-2028.pdf
const FINAL_RATE_POSTING_DATES = {
  "Q1-2026": "2026-03-02",
  "Q2-2026": "2026-06-02",
  "Q3-2026": "2026-09-04",
  "Q4-2026": "2026-12-04",
  "Q1-2027": "2027-03-02",
  "Q2-2027": "2027-06-04",
  "Q3-2027": "2027-09-03",
  "Q4-2027": "2027-12-03",
  "Q1-2028": "2028-03-03",
  "Q2-2028": "2028-06-02",
  "Q3-2028": "2028-09-02",
  "Q4-2028": "2028-12-04",
};

function fail(message) {
  console.error(`verify:ifta-tax-rates-current FAIL: ${message}`);
  process.exit(1);
}

function priorQuarterKey(key) {
  const match = /^Q([1-4])-(\d{4})$/.exec(key);
  if (!match) throw new Error(`invalid quarter key: ${key}`);
  const quarter = Number(match[1]);
  const year = Number(match[2]);
  return quarter === 1 ? `Q4-${year - 1}` : `Q${quarter - 1}-${year}`;
}

export function requiredFinalQuarterKeys(date = new Date()) {
  const dateKey = date.toISOString().slice(0, 10);
  const finalized = Object.entries(FINAL_RATE_POSTING_DATES)
    .filter(([, postingDate]) => postingDate <= dateKey)
    .sort((left, right) => left[1].localeCompare(right[1]));
  const latest = finalized.at(-1)?.[0];
  if (!latest) throw new Error(`no official final-rate posting date covers ${dateKey}`);
  return [latest, priorQuarterKey(latest)];
}

function runSelftest() {
  const july = requiredFinalQuarterKeys(new Date("2026-07-18T12:00:00Z"));
  if (july.join(",") !== "Q2-2026,Q1-2026") {
    fail(`selftest expected July 2026 to require finalized Q2/Q1, got ${july.join(",")}`);
  }
  const september = requiredFinalQuarterKeys(new Date("2026-09-04T12:00:00Z"));
  if (september.join(",") !== "Q3-2026,Q2-2026") {
    fail(`selftest expected 2026-09-04 to require finalized Q3/Q2, got ${september.join(",")}`);
  }
}

if (!fs.existsSync(ratesFile)) fail(`missing ${path.relative(ROOT, ratesFile)}`);

const raw = JSON.parse(fs.readFileSync(ratesFile, "utf8"));
if (!raw._source || !String(raw._source).includes("iftach.org")) {
  fail("ifta-tax-rates.json must document iftach.org source URL in _source");
}

if (process.argv.includes("--selftest")) runSelftest();

let requiredKeys;
try {
  requiredKeys = requiredFinalQuarterKeys();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
for (const key of requiredKeys) {
  if (!raw[key] || typeof raw[key] !== "object" || Object.keys(raw[key]).length < 10) {
    fail(`missing or sparse tax rates for ${key}`);
  }
}

const currentDate = new Date();
const currentQuarter = Math.floor(currentDate.getUTCMonth() / 3) + 1;
const currentKey = `Q${currentQuarter}-${currentDate.getUTCFullYear()}`;
if (!raw[currentKey] && !requiredKeys.includes(currentKey)) {
  console.warn(
    `verify:ifta-tax-rates-current WARN: ${currentKey} is not final until ${FINAL_RATE_POSTING_DATES[currentKey] ?? "the official IFTA posting date"}`
  );
}

console.log("verify:ifta-tax-rates-current PASS");
