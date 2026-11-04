#!/usr/bin/env node
/**
 * ROWS 91 / 148 / 149 (Cash Flow register) — locks three root-cause fixes:
 *  91  card payables (Dreamline 2510, WEX 2520) are forecast outflows, read by ONE shared reader (cash-flow/card-payables.ts)
 *      used by BOTH the rolling ledger and the weekly accounting forecast. No second copy of the 2510/2520 query.
 *  148 ONE opening-cash figure: every surface reads sumAuthoritativeDepositoryCashCents / listAuthoritativeDepositoryCashByAccount;
 *      the Manual tab's projection never opens from the saved forecast.opening_balance row.
 *  149 bank cash excludes card payables (Liability) and Faro reserves: bankCashLedgerFilterSql is applied to all 4 cash queries.
 * Usage: node scripts/verify-rows-91-148-149.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  svc: "apps/backend/src/cash-flow/cash-flow.service.ts",
  reader: "apps/backend/src/cash-flow/card-payables.ts",
  fc: "apps/backend/src/accounting/cash-forecast.routes.ts",
  math: "apps/backend/src/accounting/cash-forecast.math.ts",
  wallet: "apps/backend/src/banking/internal-wallet-balance.ts",
  manual: "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx",
};

export function check(src) {
  const f = [];
  if (!/export async function readCardPayableBalances/.test(src.reader) || !/export async function readCardPayableOutflows/.test(src.reader))
    f.push(`${F.reader}: shared card-payable readers missing`);
  if (!/readCardPayableBalances\(/.test(src.svc)) f.push(`${F.svc}: rolling ledger must read card payables via readCardPayableBalances`);
  if (/resolveRoleAccountOptional\(|journal_entry_postings[\s\S]{0,200}card_payable/.test(src.svc)) f.push(`${F.svc}: a second 2510/2520 card-payable query reappeared (use card-payables.ts)`);
  if (!/readCardPayableOutflows\(/.test(src.fc)) f.push(`${F.fc}: weekly cash forecast does not read card payables`);
  if (!/outflowCardPayables/.test(src.fc) || !/outflowCardPayables/.test(src.math) || !/- cardPayables/.test(src.math))
    f.push("cash-forecast: card payables not subtracted in buildForecastWeeks");
  const uses = (src.wallet.match(/\$\{bankCashLedgerFilterSql\(/g) ?? []).length;
  if (uses < 4) f.push(`${F.wallet}: bankCashLedgerFilterSql must be on all 4 cash queries (found ${uses})`);
  if (/Liability/.test((src.wallet.match(/export function bankCashLedgerFilterSql[\s\S]*?\n}\n/) ?? [""])[0]))
    f.push(`${F.wallet}: bank cash filter must not admit Liability accounts`);
  if (/hasSavedOpening|openingQuery\.data\?\.amount_cents/.test(src.manual))
    f.push(`${F.manual}: Manual projection opens from the saved forecast.opening_balance again (second opening-cash figure)`);
  if (!/const openingCents = Math\.round\(bankTotalDollars \* 100\)/.test(src.manual))
    f.push(`${F.manual}: openingCents must be the shared bank total`);
  return f;
}

function load() {
  return Object.fromEntries(Object.entries(F).map(([k, p]) => [k, fs.readFileSync(path.join(root, p), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = load();
  const base = check(good);
  if (base.length) { console.error("selftest: live tree must pass first:\n" + base.join("\n")); process.exit(1); }
  const mutants = [
    ["svc", (s) => s + "\nawait resolveRoleAccountOptional(c, o, r);"],
    ["fc", (s) => s.replaceAll("readCardPayableOutflows(", "x(")],
    ["math", (s) => s.replace("- cardPayables", "")],
    ["wallet", (s) => s.replaceAll("${bankCashLedgerFilterSql(", "${nope(")],
    ["manual", (s) => s.replace("const openingCents = Math.round(bankTotalDollars * 100)", "const hasSavedOpening = true; const openingCents = 0")],
  ];
  for (const [k, fn] of mutants) {
    const bad = { ...good, [k]: fn(good[k]) };
    if (check(bad).length === 0) { console.error(`selftest FAILED: mutant on ${k} not caught`); process.exit(1); }
  }
  console.log("verify-rows-91-148-149 selftest OK (live tree passes, all mutants caught)");
  process.exit(0);
}
const failures = check(load());
if (failures.length) { console.error("verify-rows-91-148-149 FAILED:\n" + failures.join("\n")); process.exit(1); }
console.log("verify-rows-91-148-149 OK");
