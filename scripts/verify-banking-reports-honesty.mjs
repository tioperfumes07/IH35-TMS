#!/usr/bin/env node
/** Banking Full Audit — Reports tab must not imply recon/feed clearance. */
import fs from "node:fs";
export function run(root = process.cwd()) {
  const failures = [];
  const page = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/BankingReportsTabContent.tsx`,
    "utf8"
  );
  if (!page.includes('data-testid="banking-reports-not-recon-proof-banner"')) {
    failures.push("missing reports not-recon-proof banner");
  }
  if (!page.includes("not bank reconciliation proof")) {
    failures.push("banner must refuse recon-proof implication");
  }
  if (!page.includes("/banking/transactions?type=uncategorized")) {
    failures.push("banner must link for-review");
  }
  return failures;
}
if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-reports-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking/components`, { recursive: true });
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/components/BankingReportsTabContent.tsx`,
    `data-testid="banking-reports-not-recon-proof-banner"\nnot bank reconciliation proof\n/banking/transactions?type=uncategorized\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/components/BankingReportsTabContent.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-reports-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-reports-honesty — OK");
}
