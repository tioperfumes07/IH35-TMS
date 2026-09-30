#!/usr/bin/env node
/**
 * C-51 — Banking Home + Driver Escrow redesign slice.
 * Asserts: Home tab label, attention strip, Driver Escrow liability banner, 10 tabs.
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
  if ((s.nav.match(/id:\s*"/g) || []).length < 10) f.push("BANKING_MODULE_TABS must keep 10 tabs");
  if (!/BankingHomeAttentionStrip/.test(s.home)) f.push("BankingHome must mount BankingHomeAttentionStrip");
  if (!/data-c51-home-attention/.test(s.strip)) f.push("attention strip missing data-c51-home-attention");
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
console.log("verify-c51-banking-home-escrow OK (Home label + attention strip + escrow liability)");
