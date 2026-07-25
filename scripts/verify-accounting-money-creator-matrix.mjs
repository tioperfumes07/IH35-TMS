#!/usr/bin/env node
/**
 * ACCT-F11 — Accounting money-creator VERIFY-1 structural matrix.
 * Asserts Bill / Expense / Pay Bill / JE / Receive Payment creators use ParityDrawer
 * (not thin full-page / centered-only Modal as the primary chrome).
 *
 *   node scripts/verify-accounting-money-creator-matrix.mjs
 *   node scripts/verify-accounting-money-creator-matrix.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-money-creator-matrix";

const CREATORS = [
  { name: "VendorBillCreatePage", rel: "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx" },
  { name: "ExpenseCreatePage", rel: "apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx" },
  { name: "PayBillModal", rel: "apps/frontend/src/pages/accounting/PayBillModal.tsx" },
  { name: "ManualJEModal", rel: "apps/frontend/src/components/accounting/ManualJEModal.tsx" },
  { name: "RecordPaymentModal", rel: "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx" },
];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function contractErrors(fileMap) {
  const errors = [];
  for (const c of CREATORS) {
    const src = fileMap[c.rel];
    if (src == null) {
      errors.push(`missing ${c.rel}`);
      continue;
    }
    if (!src.includes("ParityDrawer")) {
      errors.push(`${c.name}: must use ParityDrawer (QBO side-panel chrome)`);
    }
    if (!/from ["'].*ParityDrawer["']/.test(src) && !src.includes('from "../parity/ParityDrawer"') && !src.includes('from "../../components/parity/ParityDrawer"')) {
      // re-export shells may not import — allow if body has ParityDrawer JSX
      if (!src.includes("<ParityDrawer")) {
        errors.push(`${c.name}: ParityDrawer import/JSX required`);
      }
    }
  }
  return errors;
}

function selftest() {
  const good = Object.fromEntries(CREATORS.map((c) => [c.rel, 'import { ParityDrawer } from "x";\n<ParityDrawer open />']));
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good`);
    process.exit(1);
  }
  const bad = { ...good, [CREATORS[0].rel]: "export function VendorBillCreatePage(){ return <div>thin page</div> }" };
  if (!contractErrors(bad).some((e) => e.includes("VendorBillCreatePage"))) {
    console.error(`${LABEL} --selftest FAIL did not catch thin page`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const fileMap = Object.fromEntries(CREATORS.map((c) => [c.rel, read(c.rel)]));
const errors = contractErrors(fileMap);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Bill/Expense/PayBill/JE/ReceivePayment use ParityDrawer (VERIFY-1 structural)`);
process.exit(0);
