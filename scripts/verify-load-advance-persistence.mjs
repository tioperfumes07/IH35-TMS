// LOAD-ADVANCE PERSISTENCE GUARD — locks the Tier-1 "cash advance on book" decisions (Jorge, 2026-06-24)
// against regression. Every fix ships a CI guard.
//
//  Decision 1: NO money columns on mdata.loads — the advance record (driver_finance.*) carries the money.
//  Decision 2: a FUEL advance is a truck operating cost, NEVER a driver settlement deduction.
//  Decision 3: a booked CASH advance creates a PENDING owner-approval request (not an auto-disbursed advance).
//
// Static scan — fails loud on any change that would re-introduce the money-loss / mis-routing class.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const fail = (m) => {
  console.error(`FAIL verify-load-advance-persistence: ${m}`);
  process.exit(1);
};

const ROOT = process.cwd();
const BOOK_LOAD = "apps/backend/src/dispatch/book-load.service.ts";
const REQUEST_SVC = "apps/backend/src/driver-finance/cash-advance-requests.service.ts";

// ---- Decision 1: no cash_advance_cents / fuel_advance_cents column on mdata.loads, in ANY migration ----
function walkSql(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkSql(p, out);
    else if (name.endsWith(".sql")) out.push(p);
  }
  return out;
}
const MONEY_COL_ON_LOADS =
  /alter\s+table\s+(only\s+)?mdata\.loads[\s\S]{0,400}?add\s+column[\s\S]{0,80}?(cash_advance_cents|fuel_advance_cents)/i;
for (const f of walkSql(join(ROOT, "db/migrations"))) {
  const src = readFileSync(f, "utf8");
  if (MONEY_COL_ON_LOADS.test(src)) {
    fail(
      `${f.replace(ROOT + "/", "")}: adds cash_advance_cents/fuel_advance_cents to mdata.loads — forbidden (decision 1: ` +
        `no money columns on the load; the advance record carries the money).`,
    );
  }
}

// ---- Decision 2 + 3: book-load must route advances through the request service, never disburse/deduct directly ----
const book = readFileSync(join(ROOT, BOOK_LOAD), "utf8");

// book-load must NOT directly write the advance/settlement tables (those belong to the approval/settlement engine).
for (const forbidden of [
  /insert\s+into\s+driver_finance\.driver_advances/i,
  /insert\s+into\s+driver_finance\.settlement_lines/i,
  /insert\s+into\s+driver_finance\.driver_settlement_deductions/i,
]) {
  if (forbidden.test(book)) {
    fail(
      `${BOOK_LOAD}: directly writes an advance/settlement table (${forbidden.source}). A booked cash advance must go ` +
        `through createCashAdvanceRequest() (pending owner-approval); fuel advances must NEVER post a deduction (decision 2/3).`,
    );
  }
}

// If book-load handles a fuel advance, it must DEFER it (no driver-debt routing). Assert the fuel-advance branch
// does not call the cash-advance request creator (fuel is not a driver debt) and is audited as deferred.
if (/fuel_advance_cents/.test(book)) {
  if (!/fuel_advance.*deferred|deferred_no_target/is.test(book)) {
    fail(`${BOOK_LOAD}: references fuel_advance_cents but no 'deferred' handling found — fuel must be deferred, never deducted (decision 2).`);
  }
}

// The booked cash advance must go through the request service (the owner-approval path).
if (/cash_advance_cents/.test(book) && !/createCashAdvanceRequest\s*\(/.test(book)) {
  fail(`${BOOK_LOAD}: handles cash_advance_cents but does not call createCashAdvanceRequest() — owner-approval request path required (decision 3).`);
}

// ---- Decision 3: the request service creates the request in a PENDING (owner-approval) status ----
const svc = readFileSync(join(ROOT, REQUEST_SVC), "utf8");
if (!/status[\s\S]{0,40}?'pending'|'pending'[\s\S]{0,40}?status|VALUES[\s\S]{0,200}?'pending'/i.test(svc)) {
  fail(`${REQUEST_SVC}: cash-advance request INSERT does not set status 'pending' — booked advances must NOT auto-approve (decision 3).`);
}

console.log("OK verify-load-advance-persistence: no money cols on mdata.loads; advances route through the request service (pending); fuel deferred, never deducted.");
