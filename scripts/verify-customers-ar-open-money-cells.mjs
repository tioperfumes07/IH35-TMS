#!/usr/bin/env node
/**
 * verify-customers-ar-open-money-cells — ROUND 8.20 board9.
 * Customers list Open balance / Cleared AR columns must MoneyCell→invoices hasBalance.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-customers-ar-open-money-cells";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/customers/CustomersListView.tsx";

export function check(src) {
  const f = [];
  if (!src) {
    f.push("CustomersListView.tsx missing");
    return f;
  }
  if (!/MoneyCell/.test(src)) f.push("MoneyCell missing");
  if (/key: "ar_open_cents"[\s\S]{0,400}fmtMoney\(row\.ar_open_cents\)/.test(src)) {
    f.push("ar_open_cents still plain fmtMoney");
  }
  if (!/target:\s*"invoices"/.test(src) || !/hasBalance:\s*true/.test(src)) {
    f.push("AR open must AmountLink invoices hasBalance");
  }
  if (!/customers-ar-open-/.test(src)) {
    f.push("ar_open MoneyCell test id missing");
  }
  return f;
}

function selftest(live) {
  const cases = [
    ["plain ar", live.replace(/key: "ar_open_cents"[\s\S]*?data-testid=\{`customers-ar-open-\$\{row\.id\}`\}[\s\S]*?\/>/, 'key: "ar_open_cents", render: (row) => fmtMoney(row.ar_open_cents)')],
    ["no MoneyCell", live.replace(/MoneyCell/g, "Plain")],
    ["file deleted", ""],
  ];
  let pass = check(live).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(live));
  for (const [name, src] of cases) {
    if (check(src).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const src = fs.existsSync(path.join(ROOT, FILE)) ? fs.readFileSync(path.join(ROOT, FILE), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(src);
else {
  const f = check(src);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — customers AR open amounts are MoneyCells`);
}
