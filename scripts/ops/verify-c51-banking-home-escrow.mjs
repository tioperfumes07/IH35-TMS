#!/usr/bin/env node
/**
 * C-51 / ROUND 304 C-64 — Banking Home + Driver Escrow.
 * Asserts: Home + Accounts tabs (9 total), C-65 side-dock, Escrow board, Home board pieces.
 * Self-test: node scripts/ops/verify-c51-banking-home-escrow.mjs --selftest
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
  if (!/id:\s*"accounts",\s*label:\s*"Home"/.test(s.nav)) {
    f.push('BANKING_MODULE_TABS accounts label must be "Home"');
  }
  if (!/id:\s*"bank_accounts",\s*label:\s*"Accounts"/.test(s.nav)) {
    f.push('BANKING_MODULE_TABS must include bank_accounts "Accounts" (C-64)');
  }
  const tabCount = (s.nav.match(/^\s*\{ id:/gm) || []).length;
  if (tabCount !== 9) f.push(`BANKING_MODULE_TABS must be exactly 9 tabs (got ${tabCount})`);
  if (/id:\s*"statement_import"/.test(s.nav) || /id:\s*"plaid_connections"/.test(s.nav)) {
    f.push("Statement Import / Plaid must not be module tabs");
  }
  if (!/BankingHomeAttentionStrip/.test(s.home)) f.push("BankingHome must mount BankingHomeAttentionStrip");
  if (!/data-c51-home-attention/.test(s.strip)) f.push("attention strip missing data-c51-home-attention");
  if (!/data-c65-alert-dock/.test(s.strip)) f.push("attention strip must be C-65 side-dock (data-c65-alert-dock)");
  if (!/fixed/.test(s.strip)) f.push("attention strip must be position fixed (no layout shift)");
  if (!/uncategorizedCount/.test(s.strip) || !/reconciledAccountsCount/.test(s.strip)) {
    f.push("attention strip must surface uncategorized + reconciled facts");
  }
  if (!/qboConnected/.test(s.strip)) f.push("attention strip must surface QBO-not-connected");
  if (!/escrowBalanceCents/.test(s.strip)) f.push("attention strip must surface Driver Escrow liability");
  if (!/banking-escrow-liability-honesty-banner/.test(s.escrow)) {
    f.push("DriverEscrowTabContent missing liability honesty banner");
  }
  if (!/Driver Escrow is a liability/.test(s.escrow)) {
    f.push("Driver Escrow must state liability (not expense) in operator copy");
  }
  if (!/data-c64-driver-escrow/.test(s.escrow)) f.push("Driver Escrow board missing data-c64-driver-escrow");
  if (!/WhereTheMoneyIsRail|data-c64-money-rail/.test(s.home)) {
    f.push("Banking Home must mount Where the money is rail (C-64)");
  }
  if (!/NeedsCategorizingQueue|data-c64-needs-categorizing/.test(s.home)) {
    f.push("Banking Home must mount Needs categorizing queue (C-64)");
  }
  if (!/statement-import|Statement Import/.test(s.home)) {
    f.push("Statement Import must remain reachable from + New");
  }
  return f;
}

const sources = {
  nav: read("apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts"),
  home: read("apps/frontend/src/pages/banking/BankingHome.tsx"),
  strip: read("apps/frontend/src/pages/banking/components/BankingHomeAttentionStrip.tsx"),
  escrow: read("apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx"),
};

if (process.argv.includes("--selftest")) {
  const good = { ...sources };
  const bad = { ...sources, nav: sources.nav.replace('label: "Home"', 'label: "Accounts"') };
  const checks = [
    ["good passes", check(good).length === 0],
    ["Accounts label fails", check(bad).some((m) => /Home/.test(m))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-c51 --selftest FAIL");
    for (const [n] of failed) console.error(" ✗", n);
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
