#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^(vendor_credits\\.(list|detail)|vendor_credits)$","task":"ACCT-F5061-VENDOR-CREDIT-VENDOR-NAME","pr":"#PENDING"}
 * Rule-17 guard: vendor credits UI mounted + vendor/bill reverse drill (Law §9).
 * Backend + api client existed without any accounting surface — orphan API defect.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendor-credits-ui-linkage";
const PAGE = "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const SUBNAV = "apps/frontend/src/pages/accounting/subnav-manifest.ts";
const VENDOR_DETAIL = "apps/frontend/src/pages/VendorDetail.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertVendorCreditsUiLinkage() {
  const errors = [];
  const page = read(PAGE);
  const manifest = read(MANIFEST);
  const subnav = read(SUBNAV);
  const vendorDetail = read(VENDOR_DETAIL);

  if (!/path=["']\/accounting\/vendor-credits["']/.test(manifest) || !/VendorCreditsPage/.test(manifest)) {
    errors.push("manifest: must mount /accounting/vendor-credits → VendorCreditsPage");
  }
  if (!subnav.includes('path: "/accounting/vendor-credits"')) {
    errors.push("subnav-manifest: must register Vendor credits under billpay/more");
  }
  if (!page.includes("listVendorCredits")) {
    errors.push(`${PAGE}: must call listVendorCredits`);
  }
  if (!page.includes("ParityTable")) {
    errors.push(`${PAGE}: list must use ParityTable`);
  }
  if (!/kind=["']vendor["']/.test(page)) {
    errors.push(`${PAGE}: credits list must EntityLink vendor`);
  }
  // ACCT-F5061 — CLS-LINKAGE-ONEWAY: vendor EntityLink must use joined vendor_name, not null→UUID chrome.
  if (!/entityLabel\(\s*(?:row|credit)\.vendor_name\s*,\s*(?:row|credit)\.vendor_id\s*,\s*["']Vendor["']\s*\)/.test(page)) {
    errors.push(`${PAGE}: vendor EntityLink must entityLabel(….vendor_name, ….vendor_id, "Vendor")`);
  }
  if (/entityLabel\(\s*null\s*,\s*(?:row|credit)\.vendor_id\s*,\s*["']Vendor["']\s*\)/.test(page)) {
    errors.push(`${PAGE}: must not entityLabel(null, vendor_id) — UUID chrome`);
  }
  const routes = read("apps/backend/src/accounting/vendor-credits.routes.ts");
  if (!/v\.vendor_name/.test(routes) || !/LEFT JOIN mdata\.vendors/.test(routes)) {
    errors.push("vendor-credits.routes: list/detail must LEFT JOIN mdata.vendors for vendor_name");
  }
  if (!page.includes("getNextVendorCreditDocumentNumber")) {
    errors.push(`${PAGE}: create drawer must preview next document number`);
  }
  if (!/aria-label=["']Ref no\.["']/.test(page) || !page.includes("qbo-vendor-credit-header")) {
    errors.push(`${PAGE}: create drawer must show QBO Ref no. top-right`);
  }
  if (!page.includes("ReferenceSelect") || !page.includes('createKind="vendor"')) {
    errors.push(`${PAGE}: create flow must use ReferenceSelect createKind=vendor (+ Create)`);
  }
  if (!page.includes("vendor_id") || !/searchParams|URLSearchParams|useSearchParams/.test(page)) {
    errors.push(`${PAGE}: must honor vendor_id query param for vendor-detail reverse drill`);
  }
  // LST-F5202 — visible vendor filter must write URL.
  if (!/setSearchParams/.test(page) || !/vendor-credits-filter-vendor/.test(page)) {
    errors.push(`${PAGE}: vendor filter must sync to URL (setSearchParams + EntityPicker)`);
  }
  if (!vendorDetail.includes("listVendorCredits")) {
    errors.push("VendorDetail: must list vendor credits filtered by vendor_id (reverse drill)");
  }
  if (!/accounting\/vendor-credits/.test(vendorDetail)) {
    errors.push("VendorDetail: must link to /accounting/vendor-credits for vendor-scoped drill");
  }
  return errors;
}

function selftest() {
  const errors = assertVendorCreditsUiLinkage();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED — live sources rejected:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertVendorCreditsUiLinkage();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
