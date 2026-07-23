#!/usr/bin/env node
/**
 * Banking Full Audit LINKAGE FAIL — BLOCK-6b forward drill API must be wired in the Transactions
 * expanded row. API + client existed; silence in UI is a Law §9 defect.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const api = fs.readFileSync(`${root}/apps/frontend/src/api/banking.ts`, "utf8");
  const view = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx`,
    "utf8"
  );
  if (!api.includes("getBankTransactionCategorizationLinks")) {
    failures.push("api client missing getBankTransactionCategorizationLinks");
  }
  if (!view.includes("getBankTransactionCategorizationLinks")) {
    failures.push("BankingTransactionsDesignView must call getBankTransactionCategorizationLinks");
  }
  if (!view.includes('data-testid="banking-tx-categorization-links-panel"')) {
    failures.push("missing Linked-to (persisted) panel testid");
  }
  if (!view.includes("No persisted Driver / Unit / Load")) {
    failures.push("panel must refuse draft-as-link implication when empty");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-cat-links-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    "apps/frontend/src/api/banking.ts",
    "export function getBankTransactionCategorizationLinks() {}\n"
  );
  mk(
    "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    `getBankTransactionCategorizationLinks\ndata-testid="banking-tx-categorization-links-panel"\nNo persisted Driver / Unit / Load\n`
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-categorization-links-panel --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-categorization-links-panel — OK");
}
