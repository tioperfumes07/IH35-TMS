#!/usr/bin/env node
/**
 * C-24 — QBO parity tail: D47 list dates use formatDateQboList; banking keeps formatDateUS.
 * Re-asserts tokens already shipped in #23385 and the list-column sweep.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const ok = (m) => console.log(`PASS: ${m}`);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function assertIncludes(rel, needles, label) {
  const src = read(rel);
  for (const n of needles) {
    if (!src.includes(n)) fail(`${label}: missing ${JSON.stringify(n)} in ${rel}`);
  }
  ok(label);
}

if (!process.argv.includes("--selftest")) {
  console.log("usage: node scripts/ops/verify-c24-qbo-parity-tail.mjs --selftest");
  process.exit(0);
}

assertIncludes(
  "apps/frontend/src/design/qbo-parity.ts",
  ["D47", "D48", "D49", "D52", "D53", "D54", "QBO_BANKING_ACTIONS", "listFormat"],
  "C-24 qbo-parity tokens still present",
);

// qbo-parity references the helper by name in comments; the live export is in formatDate.ts
assertIncludes(
  "apps/frontend/src/lib/formatDate.ts",
  ["export function formatDateQboList", "M/D/YY"],
  "C-24 formatDateQboList is the D47 list formatter",
);

assertIncludes(
  "apps/frontend/src/pages/Customers.tsx",
  ["formatDateQboList"],
  "C-24 Customers list dates use QBO list format",
);

assertIncludes(
  "apps/frontend/src/pages/Vendors.tsx",
  ["formatDateQboList"],
  "C-24 Vendors list dates use QBO list format",
);

assertIncludes(
  "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx",
  ["formatDateQboList"],
  "C-24 Load Costs list dates use QBO list format",
);

assertIncludes(
  "apps/frontend/src/pages/accounting/TransactionRegisterPage.tsx",
  ["formatDateQboList"],
  "C-24 Transaction Register list dates use QBO list format",
);

assertIncludes(
  "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
  ["formatDateQboList"],
  "C-24 Active WOs opened date uses QBO list format",
);

// 443.99 class B (CC-2, 2026-10-12) — D54 banking action labels.
//   old rule: the feed file contains the strings "Record transfer" and "D54" (both only in comments since
//             2a6438d954).
//   new rule: the feed's one action-label mapper, qboActionLabel(), returns the D54 token for every mode —
//             Match / Record transfer / Record as credit card payment / Loan / Add — read from QBO_BANKING_ACTIONS.
//   why: BANK-ACTION-QBO-01 (owner 2026-10-03, 2a6438d954) removed the separate "Action type" column that
//        carried the "// D54" comment; the D54 labels now live on the action button via qboActionLabel(). A
//        comment marker proves nothing; the mapper is what the operator sees. Stricter: a mode that loses its
//        D54 label, or a hard-coded label, now fails.
assertIncludes(
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  [
    "export function qboActionLabel(",
    'if (mode === "match") return QBO_BANKING_ACTIONS.match;',
    'if (mode === "transfer") return QBO_BANKING_ACTIONS.recordTransfer;',
    'if (mode === "cc_payment") return QBO_BANKING_ACTIONS.recordCcPayment;',
    'if (mode === "loan") return QBO_BANKING_ACTIONS.loan;',
    "return QBO_BANKING_ACTIONS.add;",
  ],
  "C-24 Banking D54 action labels remain",
);
assertIncludes(
  "apps/frontend/src/design/qbo-parity.ts",
  ['add: "Add"', 'match: "Match"', 'recordTransfer: "Record transfer"'],
  "C-24 D54 token values are the QuickBooks words",
);

console.log("verify-c24-qbo-parity-tail --selftest OK");
