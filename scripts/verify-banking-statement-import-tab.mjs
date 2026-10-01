#!/usr/bin/env node
/** ROUND 304 C-64 — Statement Import is reachable via + New + deep link, not a module tab. */
import fs from "node:fs";
export function run(root = process.cwd()) {
  const failures = [];
  const nav = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts`, "utf8");
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  const paths = fs.readFileSync(`${root}/apps/frontend/src/router/route-manifest.ts`, "utf8");
  const manifest = fs.readFileSync(`${root}/apps/frontend/src/routes/manifest.tsx`, "utf8");
  if (/id:\s*"statement_import"/.test(nav)) failures.push("statement_import must not be a BANKING_MODULE_TABS id (C-64 + New only)");
  if (!paths.includes('statement_import: "/banking/statement-import"')) failures.push("missing TAB_PATH");
  if (!manifest.includes('path="/banking/statement-import"')) failures.push("missing route");
  if (!home.includes('activeTab === "statement_import"')) failures.push("missing panel body for deep link");
  if (!home.includes("StatementUpload")) failures.push("must reuse StatementUpload");
  if (!/statement-import|Statement Import/.test(home)) failures.push("Statement Import must remain in + New menu");
  // Keep recon embed (Rule 07)
  const recon = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankReconciliationPage.tsx`, "utf8");
  if (!recon.includes("StatementUpload")) failures.push("Reconciliation must keep StatementUpload");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-stmt-");
  const files = {
    "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts": 'export const BANKING_MODULE_TABS = []\n',
    "apps/frontend/src/router/route-manifest.ts": 'statement_import: "/banking/statement-import"\n',
    "apps/frontend/src/routes/manifest.tsx": 'path="/banking/statement-import"\n',
    "apps/frontend/src/pages/banking/BankingHome.tsx": 'activeTab === "statement_import"\nStatementUpload\nStatement Import\n',
    "apps/frontend/src/pages/banking/BankReconciliationPage.tsx": "StatementUpload\n",
  };
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  }
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-statement-import-tab --selftest OK");
} else {
  const f = run();
  if (f.length) { console.error(f.join("\n")); process.exit(1); }
  console.log("verify-banking-statement-import-tab — OK (C-64 + New / deep link)");
}
