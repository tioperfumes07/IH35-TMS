#!/usr/bin/env node
/** @matrix-built {"modules":["factoring"],"cols":["layout"],"leafRe":"FactoringHomeBoard|FactoringHome.*NavyPageSubNav","task":"FAC-07-LAYOUT-TABS-FIRST"} */
/**
 * verify-factoring-layout-tabs-first — ROUND 443.267 board 4 retarget.
 *
 * FAC-07 (owner 2026-09-06) locked tabs-first so the factor profile could not push the navy strip
 * below the fold. The approved board (10-22-2026-LEAD-MOD-DESIGN-V3-Factoring) supersedes the
 * FAC-07 side-by-side DrillKpiCard + compact FactoringProfilePanel overview: Home is now
 * FactoringHomeBoard (KPI strip → Each purchase net vs kept → Terms on file → Measured note).
 *
 * This guard STILL pins tabs-first order, and pins the board mount + board sections/engines.
 * Compact FactoringProfilePanel stays implemented (Edit Terms opens the profile modal) but is
 * no longer required on the Home overview row.
 *
 * --selftest mutates each load-bearing fact and requires each mutation to FAIL; clean sources pass.
 */
import fs from "node:fs";

const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const BOARD = "apps/frontend/src/pages/factoring/components/FactoringHomeBoard.tsx";

const KPI_TEST_IDS = [
  "factoring-kpi-outstanding-liability",
  "factoring-kpi-advanced-mtd",
  "factoring-kpi-recourse-days",
  "factoring-kpi-chargebacks",
  "factoring-kpi-true-cost",
];

function analyze(src) {
  const { home, board } = src;
  const errors = [];

  if (!board) {
    errors.push(`${BOARD}: missing — 443.267 board-faithful Factoring Home`);
    return errors;
  }

  // ORDER: tabs first, banner below tabs, board below banner.
  const subnavIdx = home.indexOf("<NavyPageSubNav");
  const bannerIdx = home.indexOf("<DuplicateVendorsBanner");
  const boardIdx = home.indexOf("<FactoringHomeBoard");
  if (subnavIdx < 0) errors.push("FactoringHome must render <NavyPageSubNav> (the navy tab strip)");
  if (boardIdx < 0) errors.push("FactoringHome must mount <FactoringHomeBoard> (443.267 board 4)");
  if (subnavIdx < 0 || boardIdx < 0 || subnavIdx > boardIdx) {
    errors.push("FAC-07: <NavyPageSubNav> tab strip must render BEFORE FactoringHomeBoard (tabs on top)");
  }
  if (bannerIdx < 0 || subnavIdx < 0 || bannerIdx < subnavIdx || bannerIdx > boardIdx) {
    errors.push("FAC-07: the duplicate-vendor banner must sit below the tabs and above FactoringHomeBoard");
  }

  // Board sections + engines (approved board).
  if (!/data-testid="factoring-home-board"/.test(board)) {
    errors.push(`${BOARD}: board root test id missing`);
  }
  if (!/data-testid="factoring-home-kpi-row"/.test(board)) {
    errors.push(`${BOARD}: KPI strip test id missing`);
  }
  if (!/Outstanding liability/.test(board)) {
    errors.push(`${BOARD}: KPI strip must label Outstanding liability`);
  }
  if (!/Outstanding Liability Balance/.test(board)) {
    errors.push(`${BOARD}: must retain the honest Outstanding Liability Balance wording`);
  }
  if (!/True cost/.test(board)) {
    errors.push(`${BOARD}: KPI strip must include True cost`);
  }
  if (!/Each purchase — net to bank vs kept by Faro/.test(board)) {
    errors.push(`${BOARD}: must render the purchase net-vs-kept panel`);
  }
  if (!/Terms on file/.test(board)) {
    errors.push(`${BOARD}: must render Terms on file`);
  }
  if (!/data-testid="factoring-home-measured-note"/.test(board)) {
    errors.push(`${BOARD}: must render the Measured uncleared note`);
  }
  if (!/getFactoringSummary/.test(board)) {
    errors.push(`${BOARD}: KPIs must use getFactoringSummary`);
  }
  if (!/listFactoringPurchases/.test(board)) {
    errors.push(`${BOARD}: purchase chart / true cost must use listFactoringPurchases`);
  }
  if (!/EntityLink/.test(board) || !/kind="vendor"/.test(board)) {
    errors.push(`${BOARD}: Terms footer must EntityLink the factor vendor`);
  }
  for (const id of KPI_TEST_IDS) {
    if (!board.includes(`testId="${id}"`)) errors.push(`${BOARD}: KPI tile ${id} is missing`);
  }

  // r315 / r326 keepers still mounted on home.
  if (!/<FactoringCashFlowPanel/.test(home)) {
    errors.push("FactoringHome must keep FactoringCashFlowPanel mounted (r315)");
  }
  if (!/<FactoringKpiPanel/.test(home)) {
    errors.push("FactoringHome must keep FactoringKpiPanel mounted (r326)");
  }

  return errors;
}

const base = {
  home: fs.readFileSync(HOME, "utf8"),
  board: fs.existsSync(BOARD) ? fs.readFileSync(BOARD, "utf8") : "",
};

function withField(field, transform) {
  return { ...base, [field]: transform(base[field]) };
}

if (process.argv.includes("--selftest")) {
  const clean = analyze(base);
  if (clean.length) {
    console.error(`SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["home drops tab strip", withField("home", (s) => s.replace(/<NavyPageSubNav/g, "<GoneNav"))],
    ["home drops board", withField("home", (s) => s.replace(/<FactoringHomeBoard/g, "<GoneBoard"))],
    ["home moves tabs after board", withField("home", (s) => s.replace(/<NavyPageSubNav[\s\S]*?\/>\n/, ""))],
    ["home drops duplicate-vendor banner", withField("home", (s) => s.replace(/<DuplicateVendorsBanner/g, "<GoneBanner"))],
    ["board drops KPI strip", withField("board", (s) => s.replace(/data-testid="factoring-home-kpi-row"/g, 'data-testid="gone"'))],
    ["board drops True cost", withField("board", (s) => s.replace(/True cost/g, "Gone cost"))],
    ["board drops purchase panel", withField("board", (s) => s.replace(/Each purchase — net to bank vs kept by Faro/g, "Gone"))],
    ["board drops Terms", withField("board", (s) => s.replace(/Terms on file/g, "Gone"))],
    ["board drops summary engine", withField("board", (s) => s.replace(/getFactoringSummary/g, "getGone"))],
    ["home drops cash-flow panel", withField("home", (s) => s.replace(/<FactoringCashFlowPanel/g, "<GoneCash"))],
  ];
  let caught = 0;
  for (const [label, mutated] of mutations) {
    if (analyze(mutated).length > 0) {
      caught += 1;
      continue;
    }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`PASS verify-factoring-layout-tabs-first --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = analyze(base);
if (failures.length) {
  console.error("FAIL verify-factoring-layout-tabs-first");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-factoring-layout-tabs-first — tabs-first + FactoringHomeBoard (443.267 board 4)");
