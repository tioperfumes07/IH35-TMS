#!/usr/bin/env node
/**
 * Guard: driver-as-vendor ensure (Accounting 5b/22).
 *
 * Enforces the FULL contract, not just "the route exists":
 *  1. POST /api/v1/mdata/vendors/ensure-drivers exists and INSERTs mdata.vendors.
 *  2. The route is RATE LIMITED. It fans out one SELECT (+ possibly one INSERT) per ACTIVE DRIVER,
 *     so an unthrottled caller drives unbounded round trips — CodeQL js/missing-rate-limiting.
 *  3. Driver identity is the mdata.vendors.driver_id FK, NOT the vendor_name / vendor_code text.
 *     A name match is not identity: two same-named drivers collapse onto one payee.
 *  4. A unique violation (23505 — uq_vendors_driver_active_per_company) is absorbed as
 *     "already present", and it is absorbed via a SAVEPOINT: withCurrentUser runs the handler in
 *     ONE transaction, so an un-savepointed 23505 aborts it and every later driver fails 25P02.
 *  5. BOTH vendor pickers that can pay a driver — VendorBillForm and RecordExpenseForm — actually
 *     CALL ensureDriverVendors. The original commit imported it into RecordExpenseForm without
 *     wiring it, which shipped as a dead import (TS6133) and a silently unfixed picker.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const read = (rel) => {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  return fs.readFileSync(p, "utf8");
};

const ROUTES_REL = "apps/backend/src/mdata/vendors.routes.ts";
const SHARED_REL = "apps/backend/src/mdata/ensure-driver-vendor.shared.ts";
const ROUTE_DECL = 'app.post("/api/v1/mdata/vendors/ensure-drivers"';
const routes = read(ROUTES_REL);
const api = read("apps/frontend/src/api/mdata.ts");

if (!routes.includes("/api/v1/mdata/vendors/ensure-drivers")) {
  fail("ensure-drivers route missing");
}
if (!routes.includes("INSERT INTO mdata.vendors")) {
  fail("ensure-drivers must INSERT vendors");
}

const handlerStart = routes.indexOf(ROUTE_DECL);
if (handlerStart < 0) fail(`${ROUTES_REL}: ensure-drivers route registration not found`);

// (2) rate limit on the ensure-drivers registration itself.
const registration = routes.slice(handlerStart, handlerStart + 400);
if (!/rateLimit:\s*\{[^}]*max:\s*\d+/.test(registration)) {
  fail(`${ROUTES_REL}: ensure-drivers route must declare config.rateLimit (per-driver fan-out)`);
}

// The ensure-drivers handler body — everything up to the next route registration.
const nextRoute = routes.indexOf('app.post("/api/v1/mdata/vendors"', handlerStart);
const handler = routes.slice(handlerStart, nextRoute > 0 ? nextRoute : routes.length);

// Logic may live inline in the route OR in ensure-driver-vendor.shared.ts (extracted so hire path
// and maintenance route cannot drift). The contract is the same either way.
const delegatesToShared = /\bensureDriverVendor\s*\(/.test(handler);
const contractSrc = delegatesToShared ? read(SHARED_REL) : handler;
const contractLabel = delegatesToShared ? SHARED_REL : ROUTES_REL;

if (delegatesToShared && !routes.includes("ensureDriverVendor")) {
  fail(`${ROUTES_REL}: ensure-drivers delegates to ensureDriverVendor but does not import it`);
}

// (3) driver_id FK is the identity key (an existing-payee LOOKUP filters on it), and it is written
// on INSERT. Anchored on SELECT ... WHERE so the `SET driver_id = $n::uuid` of the back-link UPDATE
// cannot satisfy this on its own.
if (!/SELECT[\s\S]{0,400}?WHERE[\s\S]{0,300}?\bdriver_id\s*=\s*\$\d+::uuid/.test(contractSrc)) {
  fail(`${contractLabel}: ensure-drivers must resolve the existing payee by mdata.vendors.driver_id`);
}
if (!/INSERT INTO mdata\.vendors[\s\S]{0,400}driver_id/.test(contractSrc)) {
  fail(`${contractLabel}: ensure-drivers INSERT must populate driver_id (FK), not just vendor_code`);
}

// (4) 23505 absorbed, inside a SAVEPOINT. Match the actual error-code comparison, not a comment
// that merely mentions the number.
if (!/\bcode\s*[!=]==\s*["']23505["']/.test(contractSrc)) {
  fail(`${contractLabel}: ensure-drivers must tolerate 23505 unique_violation as already-present`);
}
if (!contractSrc.includes("SAVEPOINT") || !contractSrc.includes("ROLLBACK TO SAVEPOINT")) {
  fail(
    `${contractLabel}: the 23505 path must use SAVEPOINT/ROLLBACK TO SAVEPOINT — withCurrentUser is one transaction`
  );
}

// FE client present.
if (!api.includes("ensureDriverVendors") || !api.includes("ensure-drivers")) {
  fail("FE client for ensure-drivers missing");
}

// (5) both driver-payable vendor pickers actually call it (an import alone is not wiring).
const PICKERS = [
  "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
];
for (const rel of PICKERS) {
  const src = read(rel);
  if (!src.includes("ensureDriverVendors")) {
    fail(`${rel}: must import ensureDriverVendors`);
  }
  if (!/await\s+ensureDriverVendors\(/.test(src)) {
    fail(`${rel}: imports ensureDriverVendors but never CALLS it (dead import — picker not fixed)`);
  }
}

console.log("PASS: verify-acct-ensure-driver-vendors");
