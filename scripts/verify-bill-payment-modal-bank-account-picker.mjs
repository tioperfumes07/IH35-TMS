#!/usr/bin/env node
/**
 * ACCT-F5981 — components/ap/BillPaymentModal.tsx ("Bill payment — multiple bills", opened from a
 * vendor's own page) is Required picker_law on accounting.modal.bill_payment
 * (docs/specs/scoreboard/modules/accounting.required.json) but had ZERO picker of any kind: Vendor
 * was correctly a readOnly field (the modal is always opened vendor-scoped from its caller), but
 * there was no field at all for WHICH bank/cash account funded the payment — the API's own
 * bank_account_id was simply never sent, so every payment recorded through this modal landed with
 * accounting.bill_payments.from_bank_account_id permanently NULL and no bank balance ever updated.
 * The sibling single-bill modal, PayBillModal.tsx, already has this exact field correctly built
 * (Combobox + Plaid "+ Add new bank account") — this guard asserts BillPaymentModal.tsx now mirrors
 * that same real picker, not a theater/blanket credit.
 */
import fs from "node:fs";

const LABEL = "verify-bill-payment-modal-bank-account-picker";
const F = { modal: "apps/frontend/src/components/ap/BillPaymentModal.tsx" };
const checks = [
  ["modal", /import \{ getAllAccounts \} from "\.\.\/\.\.\/api\/banking";/, "imports the real accounts API (same source PayBillModal.tsx reads)"],
  ["modal", /import \{ Combobox \} from "\.\.\/Combobox";/, "imports the real Combobox component, not a plain input"],
  ["modal", /import \{ PlaidLink \} from "\.\.\/banking\/PlaidLink";/, "imports PlaidLink for the + Add new bank account flow"],
  ["modal", /const needsBankAccount = paymentMethod !== "cash";/, "gates the picker on payment method, mirroring PayBillModal.tsx"],
  [
    "modal",
    /<Combobox[\s\S]{0,200}options={bankOptions}[\s\S]{0,200}allowAddNew={\{[\s\S]{0,80}label: "\+ Add new bank account",/,
    "renders a real Combobox with + Add new bank account as the picker-law first row",
  ],
  [
    "modal",
    /bank_account_id: needsBankAccount \? fromBankAccountId : undefined,/,
    "submits the selected bank_account_id to recordApBillPayment instead of always omitting it",
  ],
];
const live = Object.fromEntries(Object.entries(F).map(([k, file]) => [k, fs.readFileSync(file, "utf8")]));
const audit = (src) => checks.filter(([k, re]) => !re.test(src[k])).map(([, , msg]) => msg);
const failures = audit(live);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [k, re, msg] of checks) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const planted = live[k].replace(new RegExp(re.source, flags), "/* planted ACCT-F5981 defect */");
    if (planted === live[k] || !audit({ ...live, [k]: planted }).includes(msg)) {
      console.error(`${LABEL} SELFTEST FAIL — plant escaped: ${msg}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} regressions rejected`);
  process.exit(0);
}
console.log(`${LABEL} PASS — Bill payment (multiple bills) modal has a real bank-account picker, no longer silently omits it`);
