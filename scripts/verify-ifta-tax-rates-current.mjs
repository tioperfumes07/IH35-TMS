#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ratesFile = path.join(ROOT, "apps/backend/src/ifta/ifta-tax-rates.json");

function fail(message) {
  console.error(`verify:ifta-tax-rates-current FAIL: ${message}`);
  process.exit(1);
}

function quarterKey(date = new Date()) {
  const month = date.getUTCMonth();
  const quarter = Math.floor(month / 3) + 1;
  const year = date.getUTCFullYear();
  return { current: `Q${quarter}-${year}`, priorQuarter: quarter === 1 ? `Q4-${year - 1}` : `Q${quarter - 1}-${year}` };
}

if (!fs.existsSync(ratesFile)) fail(`missing ${path.relative(ROOT, ratesFile)}`);

const raw = JSON.parse(fs.readFileSync(ratesFile, "utf8"));
if (!raw._source || !String(raw._source).includes("iftach.org")) {
  fail("ifta-tax-rates.json must document iftach.org source URL in _source");
}

const { current, priorQuarter } = quarterKey();
for (const key of [current, priorQuarter]) {
  if (!raw[key] || typeof raw[key] !== "object" || Object.keys(raw[key]).length < 10) {
    fail(`missing or sparse tax rates for ${key}`);
  }
}

const nextQuarterMonth = (Math.floor(new Date().getUTCMonth() / 3) + 1) * 3;
const nextQ = nextQuarterMonth >= 12 ? 1 : Math.floor(nextQuarterMonth / 3) + 1;
const nextY = nextQuarterMonth >= 12 ? new Date().getUTCFullYear() + 1 : new Date().getUTCFullYear();
const futureKey = `Q${nextQ}-${nextY}`;
if (!raw[futureKey]) {
  console.warn(`verify:ifta-tax-rates-current WARN: no rates seeded yet for upcoming quarter ${futureKey}`);
}

console.log("verify:ifta-tax-rates-current PASS");
