#!/usr/bin/env node
/** @matrix-built {"modules":["banking","accounting","drivers","dispatch","fleet","vendors","customers"],"cols":["bank","gl_je","driver","unit","trailer","load","vendor","customer","connectivity","reverse_link"],"leafRe":"^unit\\.profile\\.bank_txns$|^trailer\\.profile\\.bank_txns$|^profiles\\.detail$|^detail\\.profile$|^customers\\.detail\\.profile$","task":"THEATER-BANK-LINKAGE-GL-JE-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-bank-linkage-gl-je-reverse";
const files = {
  route: "apps/backend/src/banking/categorization.routes.ts",
  api: "apps/frontend/src/api/banking.ts",
  panel: "apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx",
  driver: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  load: "apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx",
  unit: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  trailer: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
  vendor: "apps/frontend/src/pages/VendorDetail.tsx",
  customer: "apps/frontend/src/pages/CustomerDetail.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/bt\.matched_journal_entry_id::text AS matched_journal_entry_id/.test(s.route) || !/je\.memo AS matched_journal_entry_memo/.test(s.route)) failures.push("bank→JE fields missing");
  if (!/je\.id = bt\.matched_journal_entry_id/.test(s.route) || !/je\.operating_company_id = bt\.operating_company_id/.test(s.route)) failures.push("entity-scoped bank→JE join missing");
  if (
    !/export type LinkedBankTransactionRow[\s\S]{0,700}matched_journal_entry_id: string \| null/.test(s.api) ||
    !/export type LinkedBankTransactionRow[\s\S]{0,700}matched_journal_entry_memo: string \| null/.test(s.api) ||
    !/apiRequest<\{ rows: LinkedBankTransactionRow\[\]; total_count: number \}>/.test(s.api)
  ) failures.push("typed panel JE fields missing");
  if (!/row\.matched_journal_entry_id\s*\?\s*\([\s\S]{0,260}?kind="journal_entry"[\s\S]{0,160}?id=\{row\.matched_journal_entry_id\}/.test(s.panel)) {
    failures.push("canonical conditional JE drill missing");
  }
  if (!/query\.isError/.test(s.panel) || !/linked-bank-transactions-empty/.test(s.panel)) failures.push("honest panel states missing");
  const mounts = { driver: "driver_id", load: "load_id", unit: "unit_id", trailer: "trailer_id", vendor: "vendor_id", customer: "customer_id" };
  for (const [key, kind] of Object.entries(mounts)) if (!new RegExp(`LinkedBankTransactionsPanel[\\s\\S]{0,180}kind: ["']${kind}["']`).test(s[key])) failures.push(`${key} shared panel mount missing`);
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["field", "route", /bt\.matched_journal_entry_id::text AS matched_journal_entry_id/g, "NULL AS matched_journal_entry_id"],
    ["memo", "route", /je\.memo AS matched_journal_entry_memo/g, "NULL AS matched_journal_entry_memo"],
    ["join", "route", /je\.id = bt\.matched_journal_entry_id/g, "FALSE"],
    ["scope", "route", /je\.operating_company_id = bt\.operating_company_id/g, "TRUE"],
    ["typed-je-id", "api", /matched_journal_entry_id: string \| null;/g, "matched_journal_entry_id: null;"],
    ["typed-je-memo", "api", /matched_journal_entry_memo: string \| null;/g, "matched_journal_entry_memo: null;"],
    ["typed-return", "api", /apiRequest<\{ rows: LinkedBankTransactionRow\[\]; total_count: number \}>/g, "apiRequest<{ rows: unknown[]; total_count: number }>"] ,
    ["drill", "panel", /kind="journal_entry"/g, 'kind="bank_transaction"'],
    ["drill-id", "panel", /id=\{row\.matched_journal_entry_id\}/g, "id={row.id}"],
    ["error-state", "panel", /query\.isError/g, "query.isSuccess"],
    ["empty-state", "panel", /linked-bank-transactions-empty/g, "linked-bank-transactions-loading"],
    ["driver", "driver", /kind: "driver_id"/g, 'kind: "unit_id"'],
    ["load", "load", /kind: "load_id"/g, 'kind: "unit_id"'],
    ["unit", "unit", /kind: "unit_id"/g, 'kind: "load_id"'],
    ["trailer", "trailer", /kind: "trailer_id"/g, 'kind: "unit_id"'],
    ["vendor", "vendor", /kind: "vendor_id"/g, 'kind: "unit_id"'],
    ["customer", "customer", /kind: "customer_id"/g, 'kind: "unit_id"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const candidate = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (candidate[key] === source[key] || audit(candidate).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — shared entity-scoped bank reverse panels drill through to matched canonical JEs`);
