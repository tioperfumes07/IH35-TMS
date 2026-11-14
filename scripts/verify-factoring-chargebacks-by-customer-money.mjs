#!/usr/bin/env node
/**
 * verify-factoring-chargebacks-by-customer-money — ROUND 8.20 board18.
 * Chargebacks-by-customer + aging-by-debtor money columns must MoneyCell → factoring cohort.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-factoring-chargebacks-by-customer-money";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/factoring/factoring-summary-groups.tsx";

export function check(src) {
  const f = [];
  if (!src) {
    f.push("factoring-summary-groups.tsx missing");
    return f;
  }
  if (!/MoneyCell/.test(src)) f.push("MoneyCell missing");
  if (!/factoring_chargebacks_customer/.test(src)) f.push("chargebacks customer entity drill missing");
  if (!/factoring_recourse_customer/.test(src)) f.push("aging recourse customer entity drill missing");
  if (/key: "chargebacks"[\s\S]{0,120}money\(r\.chargebacks\)/.test(src)) {
    f.push("chargebacks still plain money()");
  }
  if (/key: "balance"[\s\S]{0,120}money\(r\.balance\)/.test(src)) {
    f.push("aging balance still plain money()");
  }
  if (!/factoring-chargebacks-by-customer-/.test(src)) f.push("chargebacks-by-customer test id missing");
  if (!/factoring-aging-debtor-balance-/.test(src)) f.push("aging balance test id missing");
  return f;
}

function selftest(live) {
  const cases = [
    ["plain chargebacks", live.replace(/debtorMoneyCell\(r\.chargebacks[\s\S]*?\),/, "money(r.chargebacks),")],
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
  console.log(`${LABEL}: PASS — chargebacks/aging by customer amounts are MoneyCells`);
}
