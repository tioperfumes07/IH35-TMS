#!/usr/bin/env node
// GUARD — Load Costs board: each non-"Costs" tab must render its OWN transaction register, never the
// same 19-column load board. Owner 2026-09-05: "what the fuck are all the boxes inside costs, expenses,
// bills… they all show the same." ROOT CAUSE was the tab row only FILTERING which loads showed on one
// shared board; FIX renders a per-type TransactionRegister for every non-costs tab. This guard fails if
// that split is removed or the register stops reading the real per-type list APIs.
import { readFileSync } from "node:fs";

const FILE = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const REQUIRED = [
  // the split: costs → board, everything else → register
  'costTab !== "costs" ? <TransactionRegister',
  "function TransactionRegister",
  'data-testid="load-costs-register"',
  // each type reads its OWN real source, not the board rows
  "listExpenses(companyId",   // expenses + repairs_maintenance
  "listBills(companyId",       // bills
  "listDriverBills(companyId", // driver pay
  "listCashAdvances(companyId",// fuel advances
  'tab === "repairs_maintenance"', // R&M narrows expenses to work-order-linked
  // the load overview board is still present for the Costs tab
  'tableTestId="accounting-load-costs-board"',
];

function check(src, file) {
  const missing = REQUIRED.filter((s) => !src.includes(s));
  // hard-guard against the regression: the register table must NOT be the load board's testid
  const boardOnlyEverywhere = src.includes("<ParityTable columns={columns}") && !src.includes('costTab !== "costs" ? <TransactionRegister');
  return { missing, boardOnlyEverywhere };
}

if (process.argv.includes("--selftest")) {
  const good = readFileSync(FILE, "utf8");
  const g = check(good, FILE);
  if (g.missing.length || g.boardOnlyEverywhere) {
    console.error("SELFTEST live-file FAIL", g);
    process.exit(1);
  }
  // planted regression: strip the register split → must fail
  const bad = good.replace('costTab !== "costs" ? <TransactionRegister tab={costTab} companyId={companyId} /> : ', "");
  const b = check(bad, "planted");
  if (!(b.missing.length || b.boardOnlyEverywhere)) {
    console.error("SELFTEST planted-regression did NOT fail — guard is toothless");
    process.exit(1);
  }
  console.log("SELFTEST PASS — live file clean, planted regression caught");
  process.exit(0);
}

const src = readFileSync(FILE, "utf8");
const { missing, boardOnlyEverywhere } = check(src, FILE);
if (missing.length) {
  console.error(`FAIL ${FILE} — missing per-tab register wiring:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
if (boardOnlyEverywhere) {
  console.error(`FAIL ${FILE} — every tab still renders the shared load board (no TransactionRegister split)`);
  process.exit(1);
}
console.log("PASS — Load Costs tabs each render their own transaction register; Costs keeps the board");
