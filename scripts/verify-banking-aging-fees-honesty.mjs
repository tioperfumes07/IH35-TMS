#!/usr/bin/env node
/**
 * Banking Full Audit — +30 aging fees must not be hardcoded $0.
 * 443.270-H (CC-2): the Banking V3 board (443.267) shows this figure from THE factoring KPI engine (FactoringSummaryCard
 * mtd.defaultInterest — the same engine Factoring renders); the old "— (see Chargebacks & Fees)" placeholder is gone by
 * design (ROUND 335 item 2). Honesty is asserted where it now lives: engine-sourced, never a typed 0.
 */
import fs from "node:fs";

const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const CARD = "apps/frontend/src/pages/banking/components/FactoringSummaryCard.tsx";

export function failuresFor(home, card) {
  const failures = [];
  if (home.includes("+30 aging fees") && /aging fees[\s\S]{0,80}money\.format\(0\)/.test(home)) {
    failures.push("must not hardcode +30 aging fees as money.format(0)");
  }
  if (!/getFactoringKpis\(companyId, monthToDate\.from, monthToDate\.to\)/.test(home) || !/<FactoringSummaryCard[\s\S]{0,400}mtd=\{factoringMtd\}/.test(home)) {
    failures.push("Banking home must feed the factoring card's MTD lines from THE factoring KPI engine (getFactoringKpis month-to-date)");
  }
  if (!/aging fees MTD<\/dt>\s*<EngineLine kpi=\{mtd\?\.defaultInterest \?\? null\}/.test(card)) {
    failures.push("aging fees must be the engine's defaultInterest line (EngineLine), never a typed figure");
  }
  return failures;
}

export function run(root = process.cwd()) {
  return failuresFor(fs.readFileSync(`${root}/${HOME}`, "utf8"), fs.readFileSync(`${root}/${CARD}`, "utf8"));
}

if (process.argv.includes("--selftest")) {
  const home = fs.readFileSync(HOME, "utf8");
  const card = fs.readFileSync(CARD, "utf8");
  if (failuresFor(home, card).length) { console.error("verify-banking-aging-fees-honesty --selftest FAIL: real tree not clean"); process.exit(1); }
  const plants = [
    ["hardcoded zero", `${home}\n+30 aging fees {money.format(0)}`, card],
    ["engine MTD dropped", home.replace("getFactoringKpis(companyId, monthToDate.from, monthToDate.to)", "Promise.resolve(null)"), card],
    ["typed figure", home, card.replace("<EngineLine kpi={mtd?.defaultInterest ?? null}", "<EngineLine kpi={null}")],
  ];
  for (const [name, h, c] of plants) {
    if (h === home && c === card) { console.error(`verify-banking-aging-fees-honesty --selftest FAIL: plant did not apply: ${name}`); process.exit(1); }
    if (!failuresFor(h, c).length) { console.error(`verify-banking-aging-fees-honesty --selftest FAIL: plant escaped: ${name}`); process.exit(1); }
  }
  console.log(`verify-banking-aging-fees-honesty --selftest OK (${plants.length}/${plants.length})`);
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-aging-fees-honesty — OK");
}
