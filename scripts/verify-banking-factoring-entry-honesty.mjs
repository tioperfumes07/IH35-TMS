#!/usr/bin/env node
/**
 * Banking Full Audit — Factoring entry must not invent Advances funded MTD from cash KPIs.
 *
 * NARROWED 2026-09-13 (ROUND-20.8 B3) — the dedicated "factoring entry unproven banner" this guard used to require lived
 * inside the now-deleted Factoring TAB content.
 * 443.270-H (CC-2): the Banking V3 board (443.267) replaced the "— (see Factoring module)" placeholder with THE factoring
 * KPI engine's month-to-date purchased line (FactoringSummaryCard mtd.purchased — the same engine Factoring renders,
 * ROUND 335 item 2). The honesty rule is unchanged and asserted where it now lives: never derived from cash KPIs
 * (cashPosting - factoringReserve), always the engine's line.
 */
import fs from "node:fs";

const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const CARD = "apps/frontend/src/pages/banking/components/FactoringSummaryCard.tsx";

export function failuresFor(home, card) {
  const failures = [];
  if (home.includes("cashPosting - factoringReserve") || card.includes("cashPosting - factoringReserve")) {
    failures.push("must not invent Advances funded MTD from cashPosting - factoringReserve");
  }
  if (!/getFactoringKpis\(companyId, monthToDate\.from, monthToDate\.to\)/.test(home) || !/<FactoringSummaryCard[\s\S]{0,400}mtd=\{factoringMtd\}/.test(home)) {
    failures.push("Banking home must feed the factoring card's MTD lines from THE factoring KPI engine (getFactoringKpis month-to-date)");
  }
  if (!/Purchased MTD \(gross\)<\/dt>\s*<EngineLine kpi=\{mtd\?\.purchased \?\? null\}/.test(card)) {
    failures.push("the funded / purchased MTD line must be the engine's purchased line (EngineLine), never a derived figure");
  }
  return failures;
}

export function run(root = process.cwd()) {
  return failuresFor(fs.readFileSync(`${root}/${HOME}`, "utf8"), fs.readFileSync(`${root}/${CARD}`, "utf8"));
}

if (process.argv.includes("--selftest")) {
  const home = fs.readFileSync(HOME, "utf8");
  const card = fs.readFileSync(CARD, "utf8");
  if (failuresFor(home, card).length) { console.error("verify-banking-factoring-entry-honesty --selftest FAIL: real tree not clean"); process.exit(1); }
  const plants = [
    ["MTD invented from cash KPIs", `${home}\nconst advances = cashPosting - factoringReserve;`, card],
    ["engine MTD dropped", home.replace("getFactoringKpis(companyId, monthToDate.from, monthToDate.to)", "Promise.resolve(null)"), card],
    ["derived purchased figure", home, card.replace("<EngineLine kpi={mtd?.purchased ?? null}", "<EngineLine kpi={null}")],
  ];
  for (const [name, h, c] of plants) {
    if (h === home && c === card) { console.error(`verify-banking-factoring-entry-honesty --selftest FAIL: plant did not apply: ${name}`); process.exit(1); }
    if (!failuresFor(h, c).length) { console.error(`verify-banking-factoring-entry-honesty --selftest FAIL: plant escaped: ${name}`); process.exit(1); }
  }
  console.log(`verify-banking-factoring-entry-honesty --selftest OK (${plants.length}/${plants.length})`);
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-factoring-entry-honesty — OK");
}
