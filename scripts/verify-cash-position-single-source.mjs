#!/usr/bin/env node
// ROUND 326 audit C1 (CC-1) — ONE CASH POSITION. The cash-flow board and the Banking KPI took opening cash from
// sumAuthoritativeDepositoryCashCents; the cash forecast re-summed current_balance_cents with its own account_type text
// filter — three screens, more than one number for the same cash. Fails if either cash reader stops using the one
// source or computes its own opening from bank balances.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-cash-position-single-source";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  forecast: "apps/backend/src/accounting/cash-forecast.routes.ts",
  board: "apps/backend/src/cash-flow/cash-flow.service.ts",
};

export function problems(src) {
  const p = [];
  if (!/const openingBalance = await sumAuthoritativeDepositoryCashCents\(/.test(src.forecast)) p.push("the cash forecast must take opening cash from sumAuthoritativeDepositoryCashCents");
  if (!/const openingCashCents = await sumAuthoritativeDepositoryCashCents\(/.test(src.board)) p.push("the cash-flow board must take opening cash from sumAuthoritativeDepositoryCashCents");
  for (const [k, label] of [["forecast", "cash-forecast.routes.ts"], ["board", "cash-flow.service.ts"]]) {
    if (/SUM\(current_balance_cents\)/.test(src[k].replace(/\/\/.*$/gm, ""))) p.push(`${label} computes its own opening cash from bank balances (a second number)`);
  }
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["forecast own sum", { ...src, forecast: src.forecast + "\nconst x = `SELECT SUM(current_balance_cents) FROM banking.bank_accounts`;" }],
      ["forecast off source", { ...src, forecast: src.forecast.replace("const openingBalance = await sumAuthoritativeDepositoryCashCents(", "const openingBalance = await other(") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — the cash forecast and the cash-flow board read one opening cash (sumAuthoritativeDepositoryCashCents).`);
}
