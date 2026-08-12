#!/usr/bin/env node
// LOAD-SETTLEMENT-TAB-SHOWS-OPEN-NOT-SETTLING / ACCT-F372 (verify-step 3159).
//
// ROOT CAUSE this closes: the load drawer's "Settlement" tab mounts FinesDeductionsCard, which
// resolved "This settlement" purely from getPreSettlementForDriver(driverId) — the driver's
// currently-open pre-settlement cycle. A load already paid on a LOCKED settlement (a different row
// entirely) had no bearing on that lookup, so the tab named the wrong settlement — an empty open
// cycle sat where the load's real, already-paid settlement should have been shown. CC-1 shipped the
// backend half (PR #6006, GET /api/v1/driver-finance/settlements/for-load/:loadId, bill-first
// COALESCE(db.load_id, sl.load_id) — the same canonical join SETTLEMENT-DETAIL-LOAD-COALESCE-DRIFT
// already established) but explicitly left FE consumption to CC-2 (NEVER-FE lane boundary).
//
// FIX: FinesDeductionsCard now resolves getSettlementsForLoad(loadId) FIRST; when it returns a
// non-open settlement, that is what's shown (identity + status + net pay), with the open
// pre-settlement fallback ONLY rendered when no settled row exists — and even then relabelled
// "Open pre-settlement, no lines yet" instead of the old ambiguous "This settlement", so an empty
// open cycle can never again be mistaken for "this load was never settled".
//
// Static source assertion — no DB needed.
import fs from "node:fs";

const CARD_FILE = "apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx";
const API_FILE = "apps/frontend/src/api/driverFinance.ts";

function fail(msg) {
  console.error(`FAIL verify-load-drawer-settlement-tab-load-aware: ${msg}`);
  process.exitCode = 1;
}

function checkApiFile(src) {
  if (!src.includes("export function getSettlementsForLoad(")) {
    fail(`${API_FILE}: getSettlementsForLoad export missing — the load-aware reverse hop has no client.`);
  }
  if (!src.includes("/api/v1/driver-finance/settlements/for-load/")) {
    fail(`${API_FILE}: getSettlementsForLoad no longer calls the for-load endpoint.`);
  }
}

function checkCardFile(src) {
  if (!src.includes("getSettlementsForLoad")) {
    fail(`${CARD_FILE}: no longer imports/calls getSettlementsForLoad — the tab is back to driver-only resolution.`);
    return;
  }
  if (!/resolvedSettlementIsSettled\s*&&\s*resolvedSettlement/.test(src)) {
    fail(`${CARD_FILE}: no branch preferring a resolved (non-open) settlement over the open pre-settlement fallback.`);
  }
  if (!src.includes("Open pre-settlement, no lines yet")) {
    fail(`${CARD_FILE}: the open-pre-settlement fallback is no longer labelled distinctly from a real settled settlement.`);
  }
}

function runChecks() {
  checkApiFile(fs.readFileSync(API_FILE, "utf8"));
  checkCardFile(fs.readFileSync(CARD_FILE, "utf8"));
}

function selftest() {
  const original = fs.readFileSync(CARD_FILE, "utf8");
  let probesProven = 0;

  // Mutation 1: drop the "prefer resolved settlement" branch condition (always fall through to open).
  {
    const mutated = original.replace(
      "resolvedSettlementIsSettled && resolvedSettlement",
      "false && resolvedSettlement"
    );
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: branch condition pattern not found.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(CARD_FILE, mutated);
    let caught = false;
    try {
      checkCardFile(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(CARD_FILE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: neutering the resolved-settlement branch was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 2: revert the fallback label back to the old ambiguous "This settlement".
  {
    const mutated = original.replace("Open pre-settlement, no lines yet", "This settlement");
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: fallback label pattern not found.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(CARD_FILE, mutated);
    let caught = false;
    try {
      checkCardFile(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(CARD_FILE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: reverting the fallback label was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  console.log(`PASS verify-load-drawer-settlement-tab-load-aware --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  runChecks();
  if (process.exitCode !== 1) {
    console.log("PASS verify-load-drawer-settlement-tab-load-aware");
  }
}
