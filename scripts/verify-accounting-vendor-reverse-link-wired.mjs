#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["reverse_link","connectivity"],"task":"WAVE-B-vendor-reverse-link","leafRe":"^(bills\\.|vendors\\.|ap\\.)"} */
// CLASS-WAVE B (reverse_link/connectivity) — Wave-B investigation (2026-08-12) found this family
// already fully built in code but never tagged in docs/specs/scoreboard/wire-sprint-built.json, so
// the module matrix showed it red despite the wiring being real. This is a REGRESSION guard for
// that wiring, not new feature work — it locks in what already exists so it "stays fixed."
//
// THE REVERSE-LINK CHAIN this guards: a vendor detail page can drill FORWARD into its bills
// (GET /api/v1/vendors/:vendorId/bills) and its bill-payments (GET /api/v1/vendors/:id/bill-payments),
// and a bill-payment can drill BACK to itself by id (GET /api/v1/accounting/bill-payments/:id,
// explicitly commented "Law §9 reverse drill-through" at its registration site) — the double-linkage
// shape Wave B requires: forward (vendor -> its money objects) AND reverse (money object -> itself /
// its vendor), not just a one-way FK write.
//
// Static source check — no DB needed. Confirms the route registrations exist; does not re-verify the
// SQL behind them (that is the job of the accounting money-path guards already covering bills.routes.ts).
import fs from "node:fs";

const BILLS_ROUTES = "apps/backend/src/accounting/bills.routes.ts";
const VENDOR_BILL_PAYMENTS_ROUTES = "apps/backend/src/accounting/vendor-bill-payments.routes.ts";

function fail(msg) {
  console.error(`FAIL verify-accounting-vendor-reverse-link-wired: ${msg}`);
  process.exitCode = 1;
}

function checkBillsRoutes(src) {
  if (!src.includes('"/api/v1/vendors/:vendorId/bills"')) {
    fail(`${BILLS_ROUTES}: GET /api/v1/vendors/:vendorId/bills (vendor -> bills forward drill) not found.`);
  }
  if (!src.includes('"/api/v1/accounting/bill-payments/:id"')) {
    fail(`${BILLS_ROUTES}: GET /api/v1/accounting/bill-payments/:id (reverse drill-through, Law §9) not found.`);
  }
}

function checkVendorBillPaymentsRoutes(src) {
  // The route string "/api/v1/vendors/:id/bill-payments" is registered for BOTH GET (list) and POST
  // (create) — anchor on `app.get(` too, or a mutation to only the GET line would go undetected
  // (the POST registration's identical route string would still satisfy a bare .includes() check).
  if (!src.includes('app.get("/api/v1/vendors/:id/bill-payments"')) {
    fail(`${VENDOR_BILL_PAYMENTS_ROUTES}: GET /api/v1/vendors/:id/bill-payments (vendor -> bill-payments forward drill) not found.`);
  }
}

function selftest() {
  const originalBills = fs.readFileSync(BILLS_ROUTES, "utf8");
  const originalVendorBP = fs.readFileSync(VENDOR_BILL_PAYMENTS_ROUTES, "utf8");
  let probesProven = 0;

  {
    const mutated = originalBills.replace('"/api/v1/vendors/:vendorId/bills"', '"/api/v1/vendors/:vendorId/bills-REMOVED"');
    if (mutated === originalBills) {
      console.error("SELFTEST SETUP FAILED: vendor bills route pattern not found to mutate.");
      process.exit(1);
    }
    checkBillsRoutes(mutated);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (!caught) {
      console.error("SELFTEST INERT: removing the vendor->bills forward drill route was not caught.");
      process.exit(1);
    }
    probesProven++;
  }

  {
    const mutated = originalBills.replace('"/api/v1/accounting/bill-payments/:id"', '"/api/v1/accounting/bill-payments/:id-REMOVED"');
    if (mutated === originalBills) {
      console.error("SELFTEST SETUP FAILED: bill-payments reverse-drill route pattern not found to mutate.");
      process.exit(1);
    }
    checkBillsRoutes(mutated);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (!caught) {
      console.error("SELFTEST INERT: removing the bill-payments reverse drill-through route was not caught.");
      process.exit(1);
    }
    probesProven++;
  }

  {
    const mutated = originalVendorBP.replace('app.get("/api/v1/vendors/:id/bill-payments"', 'app.get("/api/v1/vendors/:id/bill-payments-REMOVED"');
    if (mutated === originalVendorBP) {
      console.error("SELFTEST SETUP FAILED: vendor bill-payments route pattern not found to mutate.");
      process.exit(1);
    }
    checkVendorBillPaymentsRoutes(mutated);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (!caught) {
      console.error("SELFTEST INERT: removing the vendor->bill-payments forward drill route was not caught.");
      process.exit(1);
    }
    probesProven++;
  }

  console.log(`PASS verify-accounting-vendor-reverse-link-wired --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  checkBillsRoutes(fs.readFileSync(BILLS_ROUTES, "utf8"));
  checkVendorBillPaymentsRoutes(fs.readFileSync(VENDOR_BILL_PAYMENTS_ROUTES, "utf8"));
  if (process.exitCode !== 1) {
    console.log("PASS verify-accounting-vendor-reverse-link-wired — vendor<->bills<->bill-payments double-linkage (Wave-B reverse_link/connectivity) confirmed wired.");
  }
}
