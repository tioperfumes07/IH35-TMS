#!/usr/bin/env node
/**
 * Banking Full Audit LINKAGE-REV FAIL 22 — by-linkage reverse API must have UI callers.
 * API + client existed; silence on Driver / Unit / Load surfaces is a Law §9 defect.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const api = fs.readFileSync(`${root}/apps/frontend/src/api/banking.ts`, "utf8");
  const panel = fs.readFileSync(
    `${root}/apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx`,
    "utf8"
  );
  const driver = fs.readFileSync(`${root}/apps/frontend/src/pages/drivers/DriverProfilePage.tsx`, "utf8");
  const unit = fs.readFileSync(`${root}/apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx`, "utf8");
  const load = fs.readFileSync(
    `${root}/apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx`,
    "utf8"
  );
  const manifest = fs.readFileSync(`${root}/apps/frontend/src/routes/manifest.tsx`, "utf8");

  if (!api.includes("getBankTransactionsByLinkage")) {
    failures.push("api client missing getBankTransactionsByLinkage");
  }
  if (!panel.includes("getBankTransactionsByLinkage")) {
    failures.push("LinkedBankTransactionsPanel must call getBankTransactionsByLinkage");
  }
  if (!panel.includes("query.isSuccess")) {
    failures.push("panel empty state must gate on isSuccess (not !isLoading)");
  }
  if (!panel.includes('data-testid="linked-bank-transactions-panel"')) {
    failures.push("missing linked-bank-transactions-panel testid");
  }
  if (!driver.includes("LinkedBankTransactionsPanel")) {
    failures.push("DriverProfilePage must mount LinkedBankTransactionsPanel");
  }
  if (!unit.includes("LinkedBankTransactionsPanel")) {
    failures.push("UnitFinanceLinkageTab must mount LinkedBankTransactionsPanel");
  }
  if (!load.includes("LinkedBankTransactionsPanel") || !load.includes("load_id")) {
    failures.push("LoadBankingLinkagePage must mount panel with load_id");
  }
  if (!manifest.includes("LoadBankingLinkagePage") || !manifest.includes("/dispatch/loads/:id")) {
    failures.push("manifest must route /dispatch/loads/:id to LoadBankingLinkagePage");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-by-linkage-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk("apps/frontend/src/api/banking.ts", "export function getBankTransactionsByLinkage() {}\n");
  mk(
    "apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx",
    `getBankTransactionsByLinkage\nquery.isSuccess\ndata-testid="linked-bank-transactions-panel"\n`
  );
  mk("apps/frontend/src/pages/drivers/DriverProfilePage.tsx", "LinkedBankTransactionsPanel\n");
  mk("apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx", "LinkedBankTransactionsPanel\n");
  mk(
    "apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx",
    "LinkedBankTransactionsPanel\nload_id\n"
  );
  mk(
    "apps/frontend/src/routes/manifest.tsx",
    'LoadBankingLinkagePage\npath="/dispatch/loads/:id"\n'
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk("apps/frontend/src/pages/drivers/DriverProfilePage.tsx", "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-by-linkage-reverse --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-by-linkage-reverse — OK");
}
