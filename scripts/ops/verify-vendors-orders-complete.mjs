#!/usr/bin/env node
/**
 * ORDERS 2026-10-01 VENDORS complete — mdata.vendors profile; contacts; bills+AP read-only;
 * work orders; fuel; documents; W-9/1099; insurance.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-vendors-orders-complete";

const DETAIL = "apps/frontend/src/pages/VendorDetail.tsx";
const API = "apps/frontend/src/api/mdata.ts";
const WO = "apps/frontend/src/pages/vendors/VendorWorkOrdersReverseSection.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function main() {
  const detail = read(DETAIL);
  const api = read(API);
  const wo = read(WO);

  assertIncludes(api, "/api/v1/mdata/vendors/${id}", API);
  assertIncludes(detail, 'from "../api/mdata"', DETAIL);
  assertIncludes(detail, "getVendor", DETAIL);
  assertIncludes(detail, 'data-vend-mdata="1"', DETAIL);
  assertIncludes(detail, 'data-vend-ap-readonly="1"', DETAIL);
  assertIncludes(detail, "Bills and A/P on this vendor profile are read only", DETAIL);
  assertIncludes(detail, 'data-testid="vendor-record-bill-payment-disabled"', DETAIL);
  if (/recordVendorBillPayment/.test(detail) && /recordVendorBillPayMutation\.mutateAsync/.test(detail)) {
    throw new Error(`${DETAIL}: Record bill payment write must stay off vendor profile`);
  }
  assertIncludes(detail, "Primary contact", DETAIL);
  assertIncludes(detail, "VendorWorkOrdersReverseSection", DETAIL);
  assertIncludes(wo, "listWorkOrdersFiltered", WO);
  assertIncludes(detail, "FuelTransactionsReverseSection", DETAIL);
  assertIncludes(detail, "DocumentsTab", DETAIL);
  assertIncludes(detail, "W-9 / 1099", DETAIL);
  assertIncludes(detail, "VendorInsurancePoliciesReverseSection", DETAIL);
  assertIncludes(detail, "eligible1099", DETAIL);

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
