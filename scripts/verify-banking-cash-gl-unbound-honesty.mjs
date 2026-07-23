#!/usr/bin/env node
/** Banking Full Audit FAIL 23 — Cash GL unbound coverage must be honest + bind path reachable. */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const page = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/CashGlSetupPage.tsx`, "utf8");
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  if (!page.includes('data-testid="banking-cash-gl-unbound-honesty-banner"')) {
    failures.push("CashGlSetupPage missing unbound honesty banner");
  }
  if (!page.includes("query.isSuccess") || !page.includes("unboundCount")) {
    failures.push("CashGlSetupPage must gate coverage honesty on isSuccess + unboundCount");
  }
  if (!page.includes("setBankAccountCashGl") || !page.includes("ReferenceSelect")) {
    failures.push("CashGlSetupPage must keep bind path (setBankAccountCashGl + ReferenceSelect)");
  }
  if (!home.includes('data-testid="banking-accounts-cash-gl-unbound-banner"')) {
    failures.push("BankingHome Accounts tab missing Cash GL unbound banner");
  }
  if (!home.includes("/banking/cash-gl-setup")) {
    failures.push("BankingHome must deep-link Cash GL setup");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-cash-gl-unbound-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/CashGlSetupPage.tsx`,
    `data-testid="banking-cash-gl-unbound-honesty-banner"\nquery.isSuccess\nunboundCount\nsetBankAccountCashGl\nReferenceSelect\n`
  );
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `data-testid="banking-accounts-cash-gl-unbound-banner"\n/banking/cash-gl-setup\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/CashGlSetupPage.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-cash-gl-unbound-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-cash-gl-unbound-honesty — OK");
}
