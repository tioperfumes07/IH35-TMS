#!/usr/bin/env node
/** Guard: Pay Bill bank picker — Combobox + inline + Add new + flat chrome + money-correct Plaid select (Accounting 6/M). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "apps/frontend/src/pages/accounting/PayBillModal.tsx");
const src = fs.readFileSync(file, "utf8");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

if (!src.includes("allowAddNew")) fail("From bank account must use Combobox allowAddNew");
if (!src.includes("+ Add new bank account")) fail("inline + Add new bank account label missing");
if (!src.includes("PlaidLink")) fail("Add-bank drawer must use PlaidLink (canonical bank provision)");
if (!src.includes("pay-bill-add-bank-drawer")) fail("nested add-bank drawer testid missing");
if (src.includes("SelectCombobox") && src.includes("From bank account")) {
  fail("From bank account must not use SelectCombobox (no inline +Create)");
}
// Box-in-box: payment fields must not sit inside a nested bordered grid panel.
if (src.includes("grid grid-cols-1 gap-2 rounded-sm border border-gray-200 bg-white p-2 md:grid-cols-6")) {
  fail("Pay Bill still nests fields in a bordered panel (box-in-box)");
}

// Money defect 1: must select the Plaid-returned account, not accountsQuery[0] after refetch.
if (!/onSuccess=\{async \(accounts\) =>/.test(src)) {
  fail("Plaid onSuccess must accept (accounts) — the returned row is the selected bank");
}
if (!src.includes("accounts[0]?.id")) {
  fail("Plaid onSuccess must setFromBankAccountId from accounts[0]?.id (not refreshed.data.accounts[0])");
}
if (/onSuccess=\{async \(\) =>[\s\S]*?accountsQuery\.refetch\(\)[\s\S]*?accounts\?\.\[0\]/.test(src)) {
  fail("Plaid onSuccess still selects refreshed.data.accounts[0] — pays the wrong bank");
}

// Money defect 2: form seed must NOT depend on accountsQuery.data?.accounts (refetch wipe).
const seedBlock = src.match(/useEffect\(\(\) => \{[\s\S]*?setBankCreateOpen\(false\);\s*\}, \[([^\]]+)\]\)/);
if (!seedBlock) fail("Pay Bill form seed useEffect not found");
if (seedBlock[1].includes("accountsQuery.data")) {
  fail("Form seed useEffect still depends on accountsQuery.data — Plaid refetch wipes method/amount/memo");
}
if (!src.includes("if (fromBankAccountId) return;")) {
  fail("Default-bank effect must refuse to overwrite an explicit/Plaid selection");
}

console.log("PASS: verify-acct-pay-bill-bank-picker");
