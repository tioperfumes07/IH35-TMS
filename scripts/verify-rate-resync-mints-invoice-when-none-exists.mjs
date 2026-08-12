#!/usr/bin/env node
// CLS-RATE-TYPED-AFTER-BOOK-NO-INVOICE (verify-step 3155).
//
// ROOT CAUSE this closes: ACCT-F289 (PR #5998) made book-load.service.ts catch `load_has_no_rate`
// and SKIP proforma creation so a $0-rate load can be booked. That is correct, but it created a new
// gap this guard closes: resyncProformaInvoiceFromLoadRate (ACCT-F270/FAIL-I1) was a pure UPDATE — if
// no draft/proforma invoice_lines row existed to match (exactly the state ACCT-F289 leaves a
// $0-rate-at-book load in), the resync silently touched zero rows and the load never got an invoice
// even after dispatch/mdata later supplied the missing rate. "from-load invoice $0 when rate typed
// after book" (dispatch #3, INBOX item 5) was that exact shape.
//
// FIX: resyncProformaInvoiceFromLoadRate now falls back to buildInvoiceFromLoad(asProforma:true) when
// the UPDATE matches zero rows and the new rate is > 0 — minting the proforma booking would have made
// if the rate had existed at book time. buildInvoiceFromLoad's own existing-invoice lookup keeps this
// idempotent (any non-void invoice of any status short-circuits it, so a sent/paid invoice is never
// touched or duplicated).
//
// Static source assertion — no DB needed.
import fs from "node:fs";

const RESYNC_FILE = "apps/backend/src/accounting/resync-proforma-from-load-rate.ts";
const DISPATCH_CALLER = "apps/backend/src/dispatch/update-load.service.ts";
const MDATA_CALLER = "apps/backend/src/mdata/loads.routes.ts";

function fail(msg) {
  console.error(`FAIL verify-rate-resync-mints-invoice-when-none-exists: ${msg}`);
  process.exitCode = 1;
}

function checkResyncFile(src) {
  if (!src.includes('import { buildInvoiceFromLoad } from "./from-load.js";')) {
    fail(`${RESYNC_FILE}: no longer imports buildInvoiceFromLoad — the create-if-missing fallback was likely reverted.`);
    return;
  }
  if (!/if \(ids\.length === 0\) \{/.test(src)) {
    fail(`${RESYNC_FILE}: no "ids.length === 0" fallback branch — resync goes back to being update-only, silently orphaning invoice-less loads whose rate is set after booking.`);
    return;
  }
  if (!src.includes("asProforma: true")) {
    fail(`${RESYNC_FILE}: fallback no longer mints a proforma.`);
  }
  if (!src.includes('!== "load_has_no_rate") throw error;')) {
    fail(`${RESYNC_FILE}: fallback no longer re-throws non-load_has_no_rate errors — a real invoice-creation bug (e.g. missing customer AR config) would be swallowed silently.`);
  }
}

function checkCallerPassesUserId(file, src) {
  const callIdx = src.indexOf("resyncProformaInvoiceFromLoadRate(client, {");
  if (callIdx === -1) {
    fail(`${file}: resyncProformaInvoiceFromLoadRate call site not found.`);
    return;
  }
  const callBlock = src.slice(callIdx, callIdx + 300);
  if (!/userId:\s*\S+/.test(callBlock)) {
    fail(`${file}: resyncProformaInvoiceFromLoadRate call no longer passes userId — the create-fallback needs an actor to attribute the minted invoice to.`);
  }
}

function runChecks() {
  checkResyncFile(fs.readFileSync(RESYNC_FILE, "utf8"));
  checkCallerPassesUserId(DISPATCH_CALLER, fs.readFileSync(DISPATCH_CALLER, "utf8"));
  checkCallerPassesUserId(MDATA_CALLER, fs.readFileSync(MDATA_CALLER, "utf8"));
}

function selftest() {
  const original = fs.readFileSync(RESYNC_FILE, "utf8");
  let probesProven = 0;

  // Mutation 1: drop the create-fallback branch entirely (revert to pure UPDATE-only).
  {
    const fallbackStart = original.indexOf("  if (ids.length === 0) {");
    const fallbackEnd = original.indexOf("\n  }\n\n  return ids;", fallbackStart) + "\n  }".length;
    if (fallbackStart === -1 || fallbackEnd === -1) {
      console.error("SELFTEST SETUP FAILED: fallback block boundaries not found.");
      process.exitCode = 1;
      return;
    }
    const mutated = original.slice(0, fallbackStart) + original.slice(fallbackEnd);
    fs.writeFileSync(RESYNC_FILE, mutated);
    let caught = false;
    try {
      checkResyncFile(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(RESYNC_FILE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: dropping the create-fallback branch was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 2: swallow all errors from the fallback (not just load_has_no_rate).
  {
    const mutated = original.replace(
      'if ((error as { code?: string }).code !== "load_has_no_rate") throw error;',
      "// swallowed"
    );
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: rethrow guard pattern not found to mutate.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(RESYNC_FILE, mutated);
    let caught = false;
    try {
      checkResyncFile(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(RESYNC_FILE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: swallowing non-load_has_no_rate errors was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  console.log(`PASS verify-rate-resync-mints-invoice-when-none-exists --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  runChecks();
  if (process.exitCode !== 1) {
    console.log("PASS verify-rate-resync-mints-invoice-when-none-exists");
  }
}
