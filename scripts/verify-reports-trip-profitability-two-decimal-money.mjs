#!/usr/bin/env node
/**
 * verify-reports-trip-profitability-two-decimal-money.mjs
 * LV-REPORTS-TRIP-PROFITABILITY-ZERO-DECIMAL-MONEY
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-trip-profitability-two-decimal-money";
const PAGE = "apps/frontend/src/pages/dispatch/TripProfitability.tsx";
const CARD = "apps/frontend/src/components/dispatch/tabs/SettlementProfitabilityCard.tsx";

function read(rel, root = process.cwd()) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function analyze(root = process.cwd()) {
  const failures = [];
  const page = read(PAGE, root);
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

  const card = read(CARD, root);
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
  // Plant into a mkdtemp copy — never write tracked source.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trip-profit-selftest-"));
  try {
    for (const rel of [PAGE, CARD]) {
      fs.mkdirSync(path.dirname(path.join(tmpRoot, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmpRoot, rel), read(rel));
    }
    const tmpPagePath = path.join(tmpRoot, PAGE);
    const original = fs.readFileSync(tmpPagePath, "utf8");
    const bad = original.replace(
      /return formatUsdCents\(cents\);/,
      'return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format((Number(cents) || 0) / 100);',
    );
    if (bad === original) fail("selftest could not plant zero-decimal Intl format");
    fs.writeFileSync(tmpPagePath, bad);
    const planted = analyze(tmpRoot);
    if (!planted.some((m) => /zero-decimal|hand-roll|formatUsdCents/.test(m))) {
      fail(`selftest expected page fail; got: ${planted.join("; ")}`);
    }
    fs.writeFileSync(tmpPagePath, original);

    const tmpCardPath = path.join(tmpRoot, CARD);
    const cardOriginal = fs.readFileSync(tmpCardPath, "utf8");
    const badCard = cardOriginal.replace(
      /maximumFractionDigits:\s*2/,
      "maximumFractionDigits: 0",
    );
    if (badCard === cardOriginal) fail("selftest could not plant zero-decimal on SettlementProfitabilityCard");
    fs.writeFileSync(tmpCardPath, badCard);
    const plantedCard = analyze(tmpRoot);
    if (!plantedCard.some((m) => /SettlementProfitabilityCard/.test(m))) {
      fail(`selftest expected card fail; got: ${plantedCard.join("; ")}`);
    }
    fs.writeFileSync(tmpCardPath, cardOriginal);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
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
