#!/usr/bin/env node
// ROUND 296 6 of 6 (CC-1) — CPA ANSWERS C5 (corrected): the COMPANY absorbs factoring chargebacks, NOT the driver.
// Fails if:
//   1. bank categorization's recover-from-driver path stops refusing a line categorized to any factoring account;
//   2. the settlement close's chargeback term reads anything but abandonment chargebacks (a driver-fault recovery);
//   3. any driver-finance file (deductions, settlements, driver bills) references a factoring role to charge a driver.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-no-factoring-chargeback-to-driver";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BANK = "apps/backend/src/banking/bank-driver-expense-deduction.service.ts";
const CLOSE = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";
const ROLES = ["factor_reserve_held", "factor_cash_reserve_held", "factor_reserve_default", "factoring_advance_liability", "factoring_recoursed_ar", "factor_fee_expense", "factor_transaction_fee", "factor_wire_fee", "factor_default_interest_payable"];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== "__tests__") walk(p, out); }
    else if (/\.ts$/.test(e) && !/\.test\.ts$/.test(e)) out.push(p);
  }
  return out;
}

export function problems(files) {
  const p = [];
  const bank = files[BANK] ?? "";
  for (const r of ROLES) if (!bank.includes(`"${r}"`)) p.push(`bank driver deduction must refuse factoring role ${r}`);
  if (!/return \{ posted: false, reason: "factoring_chargeback_company_absorbs" \}/.test(bank)) p.push("bank driver deduction must refuse a factoring account (factoring_chargeback_company_absorbs)");
  const close = files[CLOSE] ?? "";
  if (!/sl\.line_type = 'abandonment_chargeback'/.test(close)) p.push("the close's chargeback term must be abandonment chargebacks only");
  for (const [rel, src] of Object.entries(files)) {
    if (!rel.startsWith("apps/backend/src/driver-finance/")) continue;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const r of ROLES) if (code.includes(`"${r}"`) || code.includes(`'${r}'`)) p.push(`${rel} references factoring role ${r} (a factoring loss is never a driver charge)`);
  }
  return p;
}

function load() {
  const out = { [BANK]: readFileSync(path.join(ROOT, BANK), "utf8") };
  for (const f of walk(path.join(ROOT, "apps/backend/src/driver-finance"))) out[path.relative(ROOT, f)] = readFileSync(f, "utf8");
  return out;
}

export function run() {
  return problems(load());
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = load();
  const own = problems(files);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["bank refusal removed", { ...files, [BANK]: files[BANK].replace('reason: "factoring_chargeback_company_absorbs" }', 'reason: "x" }') }],
      ["driver path charges recourse", { ...files, "apps/backend/src/driver-finance/x.ts": 'const r = "factoring_recoursed_ar";' }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — no settlement, driver-bill or deduction path can route a factoring chargeback to a driver.`);
}
