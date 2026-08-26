#!/usr/bin/env node
/**
 * GUARD — verify-quickcreate-workorder-title-cased
 *
 * CURRENT-LAW (2026-08-25) item 4: "title-case names/addresses on create payload". Two more
 * unwired create paths beyond CreateDriverModal.tsx (already fixed):
 *
 *   1. QuickCreateEntityModal.tsx — the shared inline "+ Add" picker creator for customer/part
 *      submitted name/company/location raw.
 *   2. CreateWorkOrderModal.tsx — shop_name/shop_address (the vendor shop identity fields on a WO)
 *      submitted raw.
 *   3. BookLoadModalV4.tsx — stop city / address_line1 / site_contact_name submitted raw
 *      (BOOKLOAD-STOP-NAME-ADDRESS-NOT-TITLE-CASED). Touch only those three payload values.
 *
 * METHOD: static source-text assertions that each payload field is wrapped in
 * properPersonOrPlaceName(). --selftest mutates the REAL files and requires every assertion to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-quickcreate-workorder-title-cased";

const QUICK_CREATE = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";
const CREATE_WO = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";
const BOOK_LOAD = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

export function checkQuickCreate(text) {
  const problems = [];
  if (!/import\s*\{\s*properPersonOrPlaceName\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/lib\/properDisplayText"/.test(text)) {
    problems.push("QuickCreateEntityModal: properPersonOrPlaceName is not imported.");
  }
  if (!/import\s*\{\s*NewCustomerDrawerForm\s*\}/.test(text) || !/kind === "customer"/.test(text) || !/<NewCustomerDrawerForm/.test(text)) {
    problems.push("QuickCreateEntityModal: kind=customer must embed NewCustomerDrawerForm (Lists/Customers +Create chrome).");
  }
  if (!/part_description:\s*titleCasedName,/.test(text)) {
    problems.push("QuickCreateEntityModal: createPartsInventoryPurchase's part_description is not the title-cased value.");
  }
  if (!/location:\s*parsed\.data\.location\?\.trim\(\)\s*\?\s*properPersonOrPlaceName\(parsed\.data\.location\)\s*:\s*undefined/.test(text)) {
    problems.push("QuickCreateEntityModal: location is not wrapped in properPersonOrPlaceName().");
  }
  return problems;
}

export function checkCreateWo(text) {
  const problems = [];
  if (!/import\s*\{\s*properPersonOrPlaceName\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/lib\/properDisplayText"/.test(text)) {
    problems.push("CreateWorkOrderModal: properPersonOrPlaceName is not imported.");
  }
  if (!/shop_name:\s*values\.shop_name\?\.trim\(\)\s*\?\s*properPersonOrPlaceName\(values\.shop_name\)\s*:\s*undefined/.test(text)) {
    problems.push("CreateWorkOrderModal: shop_name is not wrapped in properPersonOrPlaceName().");
  }
  if (!/shop_address:\s*values\.shop_address\?\.trim\(\)\s*\?\s*properPersonOrPlaceName\(values\.shop_address\)\s*:\s*undefined/.test(text)) {
    problems.push("CreateWorkOrderModal: shop_address is not wrapped in properPersonOrPlaceName().");
  }
  return problems;
}

export function checkBookLoad(text) {
  const problems = [];
  if (!/import\s*\{\s*properPersonOrPlaceName\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/lib\/properDisplayText"/.test(text)) {
    problems.push("BookLoadModalV4: properPersonOrPlaceName is not imported.");
  }
  if (!/city:\s*stop\.city\?\.trim\(\)\s*\?\s*properPersonOrPlaceName\(stop\.city\)\s*:\s*""/.test(text)) {
    problems.push("BookLoadModalV4: stop city is not wrapped in properPersonOrPlaceName().");
  }
  if (!/address_line1:\s*stop\.address_line1\?\.trim\(\)\s*\?\s*properPersonOrPlaceName\(stop\.address_line1\)\s*:\s*""/.test(text)) {
    problems.push("BookLoadModalV4: stop address_line1 is not wrapped in properPersonOrPlaceName().");
  }
  if (!/site_contact_name:\s*stop\.site_contact_name\?\.trim\(\)\s*\?\s*properPersonOrPlaceName\(stop\.site_contact_name\)\s*:\s*undefined/.test(text)) {
    problems.push("BookLoadModalV4: stop site_contact_name is not wrapped in properPersonOrPlaceName().");
  }
  return problems;
}

function run() {
  const quickCreateText = readFileSync(QUICK_CREATE, "utf8");
  const createWoText = readFileSync(CREATE_WO, "utf8");
  const bookLoadText = readFileSync(BOOK_LOAD, "utf8");
  const problems = [...checkQuickCreate(quickCreateText), ...checkCreateWo(createWoText), ...checkBookLoad(bookLoadText)];
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — QuickCreate / CreateWorkOrder / BookLoad stop city+address+contact title-case name/address fields.`);
}

function selftest() {
  const failures = [];
  const quickCreateReal = readFileSync(QUICK_CREATE, "utf8");
  const createWoReal = readFileSync(CREATE_WO, "utf8");
  const bookLoadReal = readFileSync(BOOK_LOAD, "utf8");

  if (checkQuickCreate(quickCreateReal).length) failures.push("QuickCreateEntityModal baseline should pass");
  if (checkCreateWo(createWoReal).length) failures.push("CreateWorkOrderModal baseline should pass");
  if (checkBookLoad(bookLoadReal).length) failures.push("BookLoadModalV4 baseline should pass");

  // Offender 1: QuickCreateEntityModal drops Lists customer chrome.
  const qcOffender1 = quickCreateReal.replace("<NewCustomerDrawerForm", "<NotNewCustomerDrawerForm");
  const p1 = checkQuickCreate(qcOffender1);
  if (!p1.some((m) => m.includes("NewCustomerDrawerForm"))) {
    failures.push(`offender-1 (customer not Lists chrome) NOT caught: ${p1.join(" | ") || "none"}`);
  }

  // Offender 2: QuickCreateEntityModal reverts part location to raw.
  const qcOffender2 = quickCreateReal.replace(
    "location: parsed.data.location?.trim() ? properPersonOrPlaceName(parsed.data.location) : undefined,",
    "location: parsed.data.location || undefined,"
  );
  const p2 = checkQuickCreate(qcOffender2);
  if (!p2.some((m) => m.includes("location"))) {
    failures.push(`offender-2 (raw location) NOT caught: ${p2.join(" | ") || "none"}`);
  }

  // Offender 3: CreateWorkOrderModal reverts shop_name to raw.
  const woOffender1 = createWoReal.replace(
    "shop_name: values.shop_name?.trim() ? properPersonOrPlaceName(values.shop_name) : undefined,",
    "shop_name: values.shop_name || undefined,"
  );
  const p3 = checkCreateWo(woOffender1);
  if (!p3.some((m) => m.includes("shop_name"))) {
    failures.push(`offender-3 (raw shop_name) NOT caught: ${p3.join(" | ") || "none"}`);
  }

  // Offender 4: CreateWorkOrderModal reverts shop_address to raw.
  const woOffender2 = createWoReal.replace(
    "shop_address: values.shop_address?.trim() ? properPersonOrPlaceName(values.shop_address) : undefined,",
    "shop_address: values.shop_address || undefined,"
  );
  const p4 = checkCreateWo(woOffender2);
  if (!p4.some((m) => m.includes("shop_address"))) {
    failures.push(`offender-4 (raw shop_address) NOT caught: ${p4.join(" | ") || "none"}`);
  }

  const blOffender1 = bookLoadReal.replace(
    'city: stop.city?.trim() ? properPersonOrPlaceName(stop.city) : "",',
    "city: stop.city,"
  );
  const p5 = checkBookLoad(blOffender1);
  if (!p5.some((m) => m.includes("city"))) {
    failures.push(`offender-5 (raw Book Load city) NOT caught: ${p5.join(" | ") || "none"}`);
  }

  const blOffender2 = bookLoadReal.replace(
    "address_line1: stop.address_line1?.trim() ? properPersonOrPlaceName(stop.address_line1) : \"\",",
    "address_line1: stop.address_line1,"
  );
  const p6 = checkBookLoad(blOffender2);
  if (!p6.some((m) => m.includes("address_line1"))) {
    failures.push(`offender-6 (raw Book Load address_line1) NOT caught: ${p6.join(" | ") || "none"}`);
  }

  const blOffender3 = bookLoadReal.replace(
    "site_contact_name: stop.site_contact_name?.trim() ? properPersonOrPlaceName(stop.site_contact_name) : undefined,",
    "site_contact_name: stop.site_contact_name || undefined,"
  );
  const p7 = checkBookLoad(blOffender3);
  if (!p7.some((m) => m.includes("site_contact_name"))) {
    failures.push(`offender-7 (raw Book Load site_contact_name) NOT caught: ${p7.join(" | ") || "none"}`);
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 7/7 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
