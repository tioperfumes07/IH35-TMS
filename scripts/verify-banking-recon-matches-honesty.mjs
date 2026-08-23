#!/usr/bin/env node
/** Banking Full Audit — recon matches / reconcile queue must not fake “caught up”. */
import fs from "node:fs";
export function run(root = process.cwd()) {
  const failures = [];
  const recon = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankReconciliationPage.tsx`, "utf8");
  const queue = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingObligationReconcilePage.tsx`, "utf8");
  if (!recon.includes('data-testid="banking-recon-matches-never-proven-banner"')) {
    failures.push("BankReconciliationPage missing never-proven matches banner");
  }
  if (!recon.includes("Do not treat this screen as books reconciled")) {
    failures.push("BankReconciliationPage must refuse fake reconciled implication");
  }
  if (!recon.includes('to="/banking/reconciliation-workspace"')) {
    failures.push("BankReconciliationPage start-session hop must target /banking/reconciliation-workspace");
  }
  if (!recon.includes("getBankingTiles") || !recon.includes('tile_kind) === "real"')) {
    failures.push("BankReconciliationPage account picker must use real banking tiles (Home KPI source), not Plaid-only");
  }
  if (!queue.includes('data-testid="banking-reconcile-queue-empty-honesty-banner"')) {
    failures.push("BankingObligationReconcilePage missing empty-queue honesty banner");
  }
  if (!queue.includes("/banking/transactions?type=uncategorized")) {
    failures.push("reconcile queue banner must link for-review");
  }
  return failures;
}
if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-recon-matches-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankReconciliationPage.tsx`,
    `data-testid="banking-recon-matches-never-proven-banner"\nDo not treat this screen as books reconciled\nto="/banking/reconciliation-workspace"\ngetBankingTiles\ntile_kind) === "real"\n`
  );
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingObligationReconcilePage.tsx`,
    `data-testid="banking-reconcile-queue-empty-honesty-banner"\n/banking/transactions?type=uncategorized\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/BankReconciliationPage.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-recon-matches-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-recon-matches-honesty — OK");
}
