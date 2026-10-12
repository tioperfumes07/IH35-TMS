#!/usr/bin/env node
// GUARD — Load Costs board: each non-"Costs" tab must render its OWN transaction register, never the
// same 19-column load board. Owner 2026-09-05: "what the fuck are all the boxes inside costs, expenses,
// bills… they all show the same." ROOT CAUSE was the tab row only FILTERING which loads showed on one
// shared board; FIX renders a per-type TransactionRegister for every non-costs tab. This guard fails if
// that split is removed or the register stops reading the real per-type list APIs.
import { readFileSync } from "node:fs";

const FILE = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
// 443.99 (CC-2, 2026-10-12) split anchor:
//   old: 'costTab !== "costs" ? <TransactionRegister' — Costs → board, every other tab → register.
//   new: 'costTab !== "costs" && costTab !== "resettlement" ? <TransactionRegister' — Costs and Resettlement → board
//        (Resettlement is the board filtered to invoiced loads), every other transaction tab → its own register.
//   why: REG-040 owner follow-up (#21674, f1ec6457a6) added the Resettlement view, which is a load view, not a
//        transaction register. Same regression still fails: removing the register branch, or routing the transaction
//        tabs back to the shared board, drops this anchor.
const SPLIT = 'costTab !== "costs" && costTab !== "resettlement" ? <TransactionRegister';
const REQUIRED = [
  // the split: costs/resettlement → board, every transaction tab → register
  SPLIT,
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
  const boardOnlyEverywhere = src.includes("<ParityTable columns={columns}") && !src.includes(SPLIT);
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
  const plants = [
    ["register branch stripped", good.replace(/costTab !== "costs" && costTab !== "resettlement" \? <TransactionRegister [^>]*\/> : /, "")],
    ["transaction tabs routed to the shared board", good.replace(SPLIT, 'false ? <TransactionRegister')],
    ["bills register reads board rows", good.replaceAll("listBills(companyId", "listBoardRows(companyId")],
    ["driver pay register reads board rows", good.replaceAll("listDriverBills(companyId", "listBoardRows(companyId")],
    ["Costs board removed", good.replace('tableTestId="accounting-load-costs-board"', 'tableTestId="x"')],
  ];
  let caught = 0;
  for (const [name, bad] of plants) {
    if (bad === good) { console.error(`SELFTEST anchor missing for plant: ${name}`); process.exit(1); }
    const b = check(bad, "planted");
    if (b.missing.length || b.boardOnlyEverywhere) caught += 1;
    else console.error(`SELFTEST planted regression NOT caught: ${name}`);
  }
  if (caught !== plants.length) process.exit(1);
  console.log(`SELFTEST PASS — live file clean, ${caught}/${plants.length} planted regressions caught`);
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
