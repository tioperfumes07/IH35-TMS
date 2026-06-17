#!/usr/bin/env node
// Guard: the dispatch board's currency formatting can NEVER crash the List/Table grid on a no-load
// (truck-centric Awaiting) row. formatMoneyCents must return "—" on a missing amount and default the
// currency, and the board's Linehaul cell must route through it (no raw Intl.NumberFormat).
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
if (!/currency: currency \|\| "USD"/.test(constants)) fail("formatMoneyCents must default a missing currency to USD (never pass blank/undefined to NumberFormat)");

// The board's Linehaul cell routes through formatMoneyCents (no raw currency NumberFormat on the board).
const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (/new Intl\.NumberFormat\([^)]*style:\s*["']currency/.test(board)) fail("DispatchBoard must NOT call Intl.NumberFormat(currency) directly — use formatMoneyCents");
if (!/linehaul[\s\S]{0,80}formatMoneyCents/.test(board)) fail("Linehaul cell must use formatMoneyCents");

// The regression test exists (renders a no-load row's currency path).
read("apps/frontend/src/components/dispatch/constants.money.test.ts");

console.log("PASS verify-currency-format-guarded");
