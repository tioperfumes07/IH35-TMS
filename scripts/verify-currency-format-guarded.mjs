#!/usr/bin/env node
// Guard: the dispatch board's currency formatting can NEVER crash the List/Table grid on a no-load
// (truck-centric Awaiting) row. formatMoneyCents must return "—" on a missing amount and default the
// currency, and the board's Linehaul cell must route through it (no raw Intl.NumberFormat).
// House USD path must use formatUsdCents (lib/money); MXN may keep Intl.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-currency-format-guarded: ${m}`);
  process.exit(1);
};

const constants = read("apps/frontend/src/components/dispatch/constants.ts");
// formatMoneyCents accepts nullable amount and returns "—" on missing input.
if (!/formatMoneyCents\(valueCents: number \| null \| undefined/.test(constants)) {
  fail("formatMoneyCents must accept a nullable amount (number | null | undefined)");
}
if (!/if \(valueCents == null[\s\S]{0,80}return "—"/.test(constants)) fail("formatMoneyCents must return '—' on a null/NaN amount (no NumberFormat call)");
if (!/const cur = currency \|\| "USD"/.test(constants)) fail("formatMoneyCents must default a missing currency to USD (never pass blank/undefined to NumberFormat)");
if (!/from ["'][^"']*lib\/money["']/.test(constants) || !/formatUsdCents/.test(constants)) {
  fail("formatMoneyCents must import formatUsdCents from lib/money for the USD path");
}
if (!/cur === "MXN"/.test(constants)) fail("formatMoneyCents must keep an explicit MXN Intl branch");
if (!/return formatUsdCents\(valueCents\)/.test(constants)) fail("formatMoneyCents USD path must return formatUsdCents(valueCents)");

// The board's Linehaul cell routes through formatMoneyCents (no raw currency NumberFormat on the board).
const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (/new Intl\.NumberFormat\([^)]*style:\s*["']currency/.test(board)) fail("DispatchBoard must NOT call Intl.NumberFormat(currency) directly — use formatMoneyCents");
if (!/linehaul[\s\S]{0,80}formatMoneyCents/.test(board)) fail("Linehaul cell must use formatMoneyCents");

// Book load wizard + settlement profitability: no per-file USD Intl money helper.
const book = read("apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");
if (/new Intl\.NumberFormat\([\s\S]{0,120}style:\s*["']currency["']/.test(book)) {
  fail("BookLoadModalV4 must NOT hand-roll Intl.NumberFormat currency — use formatUsdCents");
}
if (!/formatUsdCents\(customerInvoiceTotal\)/.test(book)) fail("BookLoadModalV4 invoice total must use formatUsdCents");

const profit = read("apps/frontend/src/components/dispatch/tabs/SettlementProfitabilityCard.tsx");
if (!/formatUsdCents/.test(profit) || !/from ["'][^"']*lib\/money["']/.test(profit)) {
  fail("SettlementProfitabilityCard must import formatUsdCents from lib/money");
}
if (!/cur === "MXN"/.test(profit)) fail("SettlementProfitabilityCard must keep an explicit MXN Intl branch");

// The regression test exists (renders a no-load row's currency path).
read("apps/frontend/src/components/dispatch/constants.money.test.ts");

console.log("PASS verify-currency-format-guarded");
