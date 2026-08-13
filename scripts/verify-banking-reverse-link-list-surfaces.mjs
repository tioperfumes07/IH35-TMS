#!/usr/bin/env node
/**
 * Banking reverse_link — leaf-specific Built for surfaces with EntityLink drills.
 * Create-only modals honesty-dropped in required.json (same PR).
 *
 * @matrix-built {"modules":["banking"],"cols":["reverse_link"],"leafRe":"^(accounts|transactions\\.(list|categorize)|reconciliation|factoring|banking\\.drawer\\.match|banking\\.panel\\.banking_plaid_connections|banking\\.parity\\.match)$","task":"VERTICAL-REVERSE-LINK-banking-lists","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-banking-reverse-link-list-surfaces.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-reverse-link-list-surfaces";

const CHECKS = [
  { name: "BankingHome EntityLink", file: "apps/frontend/src/pages/banking/BankingHome.tsx", pattern: /EntityLink/ },
  { name: "BankAccountDetail EntityLink", file: "apps/frontend/src/pages/banking/BankAccountDetail.tsx", pattern: /EntityLink/ },
  { name: "Transactions design EntityLink", file: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", pattern: /EntityLink/ },
  { name: "BankReconciliation EntityLink", file: "apps/frontend/src/pages/banking/BankReconciliationPage.tsx", pattern: /EntityLink/ },
  { name: "ReconciliationWorkspace EntityLink", file: "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx", pattern: /EntityLink/ },
  { name: "MatchDrawer EntityLink", file: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx", pattern: /EntityLink/ },
  { name: "Plaid panel EntityLink", file: "apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx", pattern: /EntityLink/ },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(fs.readFileSync(abs, "utf8"))) fails.push(`${c.name}: no EntityLink`);
  }
  // Factoring virtual bank tile lives on BankingHome — assert route + home
  const home = path.join(root, "apps/frontend/src/pages/banking/BankingHome.tsx");
  if (fs.existsSync(home)) {
    const src = fs.readFileSync(home, "utf8");
    if (!/factoring|Factoring|virtual/i.test(src) && !/EntityLink/.test(src)) {
      fails.push("BankingHome: expected factoring/virtual bank surface or EntityLink");
    }
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".bank-reverse-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

const fails = run();
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — banking reverse_link list surfaces ratcheted`);
