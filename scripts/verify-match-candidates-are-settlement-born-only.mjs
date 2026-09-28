#!/usr/bin/env node
/**
 * ROUND 155.24 — match candidate builder selects settlement-born documents ONLY.
 * Fails if fetchLedgerCandidates still queries expenses, journal_entries, invoices,
 * factoring_advances, transfers, AR payments, or any bill/bill_payment without the
 * settlement-born SQL predicates.
 *
 * Usage: node scripts/verify-match-candidates-are-settlement-born-only.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SERVICE = "apps/backend/src/accounting/bank-recon/match.service.ts";
const PREDICATE = "apps/backend/src/accounting/bank-recon/settlement-born-candidates.ts";
const LABEL = "verify-match-candidates-are-settlement-born-only";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function problemsFor({ service, predicate }) {
  const p = [];
  if (!/SETTLEMENT-BORN CANDIDATE UNIVERSE/i.test(predicate)) {
    p.push("predicate file missing SETTLEMENT-BORN definition header");
  }
  if (!/SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN/.test(predicate)) {
    p.push("predicate missing SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN");
  }
  if (!/SQL_BILL_IS_SETTLEMENT_BORN/.test(predicate)) {
    p.push("predicate missing SQL_BILL_IS_SETTLEMENT_BORN");
  }
  if (!/driver_bills row carrying settled_in_settlement_id/i.test(predicate)) {
    p.push("predicate header must define driver_bills settled_in_settlement_id");
  }
  if (!/BUILD NO TYPE FILTER/i.test(predicate)) {
    p.push("predicate header must lock BUILD NO TYPE FILTER");
  }

  if (!/from "\.\/settlement-born-candidates\.js"/.test(service) && !/from '\.\/settlement-born-candidates\.js'/.test(service)) {
    p.push("match.service must import settlement-born-candidates");
  }
  if (!/SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN/.test(service)) {
    p.push("fetchLedgerCandidates must gate bill_payments on SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN");
  }
  if (!/SQL_BILL_IS_SETTLEMENT_BORN/.test(service)) {
    p.push("fetchLedgerCandidates must gate bills on SQL_BILL_IS_SETTLEMENT_BORN");
  }

  // Forbidden sources inside fetchLedgerCandidates body only (not loadLedgerAmountCents).
  const fetchStart = service.indexOf("async function fetchLedgerCandidates");
  if (fetchStart < 0) {
    p.push("fetchLedgerCandidates missing");
    return p;
  }
  const after = service.slice(fetchStart);
  const fetchEnd = after.indexOf("\nasync function loadLedgerAmountCents");
  const body = fetchEnd > 0 ? after.slice(0, fetchEnd) : after.slice(0, 4500);

  const forbidden = [
    [/FROM accounting\.expenses\b/i, "expenses"],
    [/FROM accounting\.journal_entries\b/i, "journal_entries"],
    [/FROM accounting\.payments\b/i, "AR payments"],
    [/FROM banking\.transfers\b/i, "transfers"],
    [/factoring_advances/i, "factoring_advances"],
    [/FROM accounting\.invoices\b/i, "invoices"],
  ];
  for (const [re, name] of forbidden) {
    if (re.test(body)) p.push(`fetchLedgerCandidates must NOT select from ${name}`);
  }

  // Bill query must NOT drop a bill after one reconciliation_matches hit (155.25 multi-match).
  if (/ledger_entry_kind = 'bill'[\s\S]{0,200}match_state IN \('auto_matched', 'user_matched'\)/.test(body)) {
    p.push("open bills must remain candidates until balance zero — do not exclude on prior bill match");
  }

  return p;
}

function selftest() {
  const goodPred = `
 * SETTLEMENT-BORN CANDIDATE UNIVERSE
 * a driver_bills row carrying settled_in_settlement_id
 * BUILD NO TYPE FILTER
 export const SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN = 'x';
 export const SQL_BILL_IS_SETTLEMENT_BORN = 'y';
 `;
  const goodSvc = `
 import { SQL_BILL_IS_SETTLEMENT_BORN, SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN } from "./settlement-born-candidates.js";
 async function fetchLedgerCandidates() {
   SELECT ... FROM accounting.bill_payments bp WHERE ${"${SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN}"}
   SELECT ... FROM accounting.bills b WHERE ${"${SQL_BILL_IS_SETTLEMENT_BORN}"}
 }
 /** Re-export classifier */
 `;
  if (problemsFor({ service: goodSvc, predicate: goodPred }).length) {
    throw new Error("expected PASS on good fixtures");
  }
  const bad = goodSvc.replace("FROM accounting.bill_payments", "FROM accounting.expenses e\n FROM accounting.bill_payments");
  if (!problemsFor({ service: bad, predicate: goodPred }).length) {
    throw new Error("expected FAIL when expenses queried");
  }
  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = problemsFor({ service: read(SERVICE), predicate: read(PREDICATE) });
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const x of problems) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
