#!/usr/bin/env node
// P19-MODULE-BANKING-TRANSFERS-REVERSE-LINK (verify-step reserved separately).
//
// ROOT CAUSE this closes: banking.transfers.from_account_id/to_account_id are a real, join-able
// link into banking.bank_accounts (or catalogs.accounts for the COA side) — listTransfers already
// filters by accountId, and the backend route (GET /api/v1/banking/transfers) already accepts it —
// but nothing on BankAccountDetailPage ever called it. An internal transfer into/out of an account
// was completely invisible on that account's own page, reachable only via a manual trip to the
// global /banking/transfers list with the filter set by hand. Live USMCA/TRK victims: transfer
// 89363414-... ($1.00, TRANSP->USMCA) touches account e83028a5-... and is not matched to any Plaid
// feed row either (matched_transfer_id), so it left no trace anywhere on that account's page.
//
// FIX: BankAccountDetailPage now queries listTransfers(accountId) and renders a Transfers section
// (direction relative to the viewed account, other-side EntityLink, amount, memo) alongside the
// existing Plaid-sourced register.
//
// Static source assertion — no DB needed.
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/banking/BankAccountDetail.tsx";

function fail(msg) {
  console.error(`FAIL verify-bank-account-detail-transfers-reverse-link: ${msg}`);
  process.exitCode = 1;
}

function check(src) {
  if (!src.includes("listTransfers(")) {
    fail(`${FILE}: no longer calls listTransfers() — the reverse link to banking.transfers is gone.`);
    return;
  }
  if (!/accountId:\s*id/.test(src)) {
    fail(`${FILE}: listTransfers() call no longer filters by this account's id.`);
  }
  if (!src.includes('data-testid="bank-account-detail-transfers"')) {
    fail(`${FILE}: the Transfers section is no longer rendered.`);
  }
}

function main() {
  check(fs.readFileSync(FILE, "utf8"));
  if (process.exitCode !== 1) {
    console.log("PASS verify-bank-account-detail-transfers-reverse-link");
  }
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  let probesProven = 0;

  // Mutation 1: drop the listTransfers call (regress to the class of bug this fixes).
  {
    const mutated = original.replace("queryFn: () => listTransfers(companyId, { accountId: id, status: \"active\", limit: 50 }),", "queryFn: () => Promise.resolve({ transfers: [] }),");
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: listTransfers call pattern not found.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(FILE, mutated);
    let caught = false;
    try {
      check(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(FILE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: dropping the listTransfers call was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 2: remove the rendered section's testid.
  {
    const mutated = original.replace('data-testid="bank-account-detail-transfers"', "");
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: testid pattern not found.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(FILE, mutated);
    let caught = false;
    try {
      check(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(FILE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: removing the section testid was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  console.log(`PASS verify-bank-account-detail-transfers-reverse-link --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  main();
}
