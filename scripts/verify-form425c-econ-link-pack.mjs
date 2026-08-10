#!/usr/bin/env node
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const exhibitC = read("apps/backend/src/reports/form-425c/exhibits/exhibit-c-bank-reconciliation.ts");
const viewer = read("apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx");

const checks = [
  ["statement-backed opening balance", exhibitC.includes("banking.reconciliation_sessions")],
  ["exact entity/account/period join", /rs\.operating_company_id = a\.operating_company_id[\s\S]*rs\.bank_account_id = a\.id[\s\S]*rs\.period_start = \$2::date[\s\S]*rs\.period_end = \$3::date/.test(exhibitC)],
  ["honest missing-source marker", exhibitC.includes('opening_balance_source: hasStatementOpening ? "reconciliation_session" : "unavailable"')],
  ["bank reconciliation forward link", viewer.includes('to="/accounting/reconciliation"')],
  ["accounting statements forward link", viewer.includes('to="/finance/statements"')],
  ["legal reports forward link", viewer.includes('to="/legal/reports"')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
console.log(`verify-form425c-econ-link-pack: ${checks.length}/${checks.length} PASS`);
