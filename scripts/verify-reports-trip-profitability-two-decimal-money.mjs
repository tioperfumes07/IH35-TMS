#!/usr/bin/env node
/**
 * verify-reports-trip-profitability-two-decimal-money.mjs
 * LV-REPORTS-TRIP-PROFITABILITY-ZERO-DECIMAL-MONEY
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-trip-profitability-two-decimal-money";
const PAGE = "apps/frontend/src/pages/dispatch/TripProfitability.tsx";
const CARD = "apps/frontend/src/components/dispatch/tabs/SettlementProfitabilityCard.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const page = read(PAGE);
  if (!/from ["'].*lib\/money["']/.test(page) || !/formatUsdCents/.test(page)) {
    failures.push("TripProfitability must import formatUsdCents from lib/money");
  }
  if (/maximumFractionDigits:\s*0/.test(page)) {
    failures.push("TripProfitability must not configure zero-decimal currency formatting");
  }
  if (/new Intl\.NumberFormat\([\s\S]*style:\s*["']currency["']/.test(page)) {
    failures.push("TripProfitability must not hand-roll Intl.NumberFormat currency");
  }
  if (!/function money\(cents/.test(page) || !/return formatUsdCents\(cents\)/.test(page)) {
    failures.push("local money() helper must delegate to formatUsdCents");
  }

  const card = read(CARD);
  if (/maximumFractionDigits:\s*0/.test(card)) {
    failures.push("SettlementProfitabilityCard must not configure zero-decimal currency formatting");
  }
  if (!/minimumFractionDigits:\s*2/.test(card) || !/maximumFractionDigits:\s*2/.test(card)) {
    failures.push("SettlementProfitabilityCard money() must use two decimal places (QBO cents)");
  }
  if (/formatProfitCents/.test(card)) {
    failures.push("SettlementProfitabilityCard must not use compact formatProfitCents for drawer money");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    const bad = original.replace(
      /return formatUsdCents\(cents\);/,
      'return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((Number(cents) || 0) / 100);',
    );
    if (bad === original) fail("selftest could not plant zero-decimal Intl format");
    fs.writeFileSync(pagePath, bad);
    const planted = analyze();
    if (!planted.some((m) => /zero-decimal|hand-roll|formatUsdCents/.test(m))) {
      fail(`selftest expected page fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(pagePath, original);
  }
  const cardPath = path.join(process.cwd(), CARD);
  const cardOriginal = fs.readFileSync(cardPath, "utf8");
  try {
    const badCard = cardOriginal.replace(
      /maximumFractionDigits:\s*2/,
      "maximumFractionDigits: 0",
    );
    if (badCard === cardOriginal) fail("selftest could not plant zero-decimal on SettlementProfitabilityCard");
    fs.writeFileSync(cardPath, badCard);
    const planted = analyze();
    if (!planted.some((m) => /SettlementProfitabilityCard/.test(m))) {
      fail(`selftest expected card fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(cardPath, cardOriginal);
  }
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — Trip Profitability uses formatUsdCents; load Settlement card shows two decimals`);
