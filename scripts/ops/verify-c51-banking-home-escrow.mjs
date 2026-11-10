#!/usr/bin/env node
/**
 * C-51 / ROUND 304 C-64 — Banking Home + Driver Escrow.
 * 9-tab visible subnav; Statement/Plaid registered but filtered; C-65 side-dock; Escrow board.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(s) {
  const f = [];
  if (!/id:\s*"accounts",\s*label:\s*"Home"/.test(s.nav)) f.push('accounts label must be "Home"');
  if (!/id:\s*"bank_accounts",\s*label:\s*"Accounts"/.test(s.nav)) f.push("must include bank_accounts Accounts");
  if (!/BANKING_SUBNAV_TAB_IDS/.test(s.nav)) f.push("BANKING_SUBNAV_TAB_IDS required");
  // sweepA (2026-11-10) — owner board 10-22 / 443.267 (#27321): Banking Home is Money in·out / Lines to review / Drift
  // KPIs -> Accounts -> Reconciliation drift -> Latest lines; the C-64 attention strip, money rail and needs-categorizing
  // queue were taken OFF Home ("drift alerts live inside the Home board, not a global strip"). The C-64 Home checks now
  // hold that ruling: the board is mounted and the removed chrome does not come back. (Board content: verify-banking-home-preview-parity.)
  if (!/testId="banking-home-accounts-board"/.test(s.home)) f.push("Home must mount the 443.267 accounts board (banking-home-accounts-board)");
  if (/<BankingHomeAttentionStrip\b|import[^;]*\bBankingHomeAttentionStrip\b/.test(s.home)) f.push("Home must not mount the C-64 BankingHomeAttentionStrip (443.267 owner board moved drift into the Home board)");
  if (!/BANKING_SUBNAV_TAB_IDS/.test(s.home)) f.push("Home must filter subnav via BANKING_SUBNAV_TAB_IDS");
  if (!/data-c65-alert-dock/.test(s.strip) || !/fixed/.test(s.strip)) f.push("attention must be C-65 fixed side-dock");
  if (!/data-c64-driver-escrow/.test(s.escrow)) f.push("Driver Escrow missing data-c64-driver-escrow");
  if (!/Driver Escrow is a liability/.test(s.escrow)) f.push("must state liability");
  if (/<WhereTheMoneyIsRail\b|data-c64-money-rail/.test(s.home)) f.push("Home must not mount the C-64 money rail (removed by the 443.267 owner board)");
  if (/<NeedsCategorizingQueue\b|data-c64-needs-categorizing/.test(s.home)) f.push("Home must not mount the C-64 needs-categorizing queue (removed by the 443.267 owner board)");
  return f;
}

const sources = {
  nav: read("apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts"),
  home: read("apps/frontend/src/pages/banking/BankingHome.tsx"),
  strip: read("apps/frontend/src/pages/banking/components/BankingHomeAttentionStrip.tsx"),
  escrow: read("apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx") +
    read("apps/frontend/src/pages/banking/components/DriverEscrowBoardSection.tsx"),
};

if (process.argv.includes("--selftest")) {
  const good = { ...sources };
  const bad = { ...sources, nav: sources.nav.replace('label: "Home"', 'label: "Accounts"') };
  const checks = [
    ["good passes", check(good).length === 0],
    ["Accounts label fails", check(bad).some((m) => /Home/.test(m))],
    ["443.267 board unmounted fails", check({ ...sources, home: sources.home.replaceAll('testId="banking-home-accounts-board"', 'testId="x"') }).some((m) => /accounts board/.test(m))],
    ["C-64 money rail back on Home fails", check({ ...sources, home: sources.home + "\n<WhereTheMoneyIsRail />" }).some((m) => /money rail/.test(m))],
    ["C-64 attention strip back on Home fails", check({ ...sources, home: sources.home + "\n<BankingHomeAttentionStrip />" }).some((m) => /AttentionStrip/.test(m))],
    ["Escrow liability statement dropped fails", check({ ...sources, escrow: sources.escrow.replaceAll("Driver Escrow is a liability", "x") }).some((m) => /liability/.test(m))],
  ];
  if (checks.some(([, ok]) => !ok)) {
    console.error("verify-c51 --selftest FAIL");
    process.exit(1);
  }
  console.log(`verify-c51-banking-home-escrow --selftest PASS (${checks.length})`);
  process.exit(0);
}

const failures = check(sources);
if (failures.length) {
  console.error("verify-c51-banking-home-escrow FAILED");
  for (const x of failures) console.error(" ✗", x);
  process.exit(1);
}
console.log("verify-c51-banking-home-escrow OK (C-64 Home+Escrow + C-65 side-dock)");
