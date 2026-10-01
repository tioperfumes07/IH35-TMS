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
  if (!/BankingHomeAttentionStrip/.test(s.home)) f.push("must mount BankingHomeAttentionStrip");
  if (!/BANKING_SUBNAV_TAB_IDS/.test(s.home)) f.push("Home must filter subnav via BANKING_SUBNAV_TAB_IDS");
  if (!/data-c65-alert-dock/.test(s.strip) || !/fixed/.test(s.strip)) f.push("attention must be C-65 fixed side-dock");
  if (!/data-c64-driver-escrow/.test(s.escrow)) f.push("Driver Escrow missing data-c64-driver-escrow");
  if (!/Driver Escrow is a liability/.test(s.escrow)) f.push("must state liability");
  if (!/WhereTheMoneyIsRail|data-c64-money-rail/.test(s.home)) f.push("must mount money rail");
  if (!/NeedsCategorizingQueue|data-c64-needs-categorizing/.test(s.home)) f.push("must mount needs-categorizing");
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
