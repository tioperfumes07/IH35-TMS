#!/usr/bin/env node
/** Fill-not-shell — Fuel reverse sections use FuelBoardSection (not bare title cards). */
import fs from "node:fs";

const FILES = [
  ["apps/frontend/src/components/fuel/RelayFillsReverseSection.tsx", "Relay fills", "relay-fills"],
  ["apps/frontend/src/components/fuel/FuelCardsReverseSection.tsx", "Fuel cards", "fuel-cards"],
  ["apps/frontend/src/components/fuel/FuelCardOverageReverseSection.tsx", "Fuel card overages", "fuel-card-overage-reverse"],
  ["apps/frontend/src/components/fuel/FuelFraudAlertsReverseSection.tsx", "Fuel fraud alerts", "fuel-fraud"],
  ["apps/frontend/src/components/fuel/FuelTransactionsReverseSection.tsx", "Fuel transactions", "fuel-transactions"],
];

const selftest = process.argv.includes("--selftest");

function analyze(sources) {
  const e = [];
  for (const [rel, title, needle] of FILES) {
    const src = sources[rel] ?? "";
    if (!src.includes("<FuelBoardSection") || !src.includes(`title="${title}"`)) {
      e.push(`${rel}: must wrap "${title}" in FuelBoardSection`);
    }
    if (/rounded-sm border border-gray-200 bg-white p-3/.test(src)) {
      e.push(`${rel}: must not keep layered bare card (${needle})`);
    }
  }
  return e;
}

const base = Object.fromEntries(FILES.map(([rel]) => [rel, fs.readFileSync(rel, "utf8")]));

if (selftest) {
  const clean = analyze(base);
  if (clean.length) {
    console.error("SELFTEST FAIL live:\n- " + clean.join("\n- "));
    process.exit(1);
  }
  let caught = 0;
  for (const [rel] of FILES) {
    const planted = { ...base, [rel]: base[rel].replace(/<FuelBoardSection/g, "<div") };
    if (analyze(planted).length) caught += 1;
    else {
      console.error(`SELFTEST FAIL — plant escaped: ${rel}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-fuel-reverse-board-sections --selftest ${caught}/${FILES.length}`);
  process.exit(0);
}

const fails = analyze(base);
if (fails.length) {
  console.error("FAIL verify-fuel-reverse-board-sections");
  fails.forEach((f) => console.error("- " + f));
  process.exit(1);
}
console.log("PASS verify-fuel-reverse-board-sections — 5 Fuel reverse sections → FuelBoardSection");
