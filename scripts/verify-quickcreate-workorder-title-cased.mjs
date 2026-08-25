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
 *
 * METHOD: static source-text assertions that each payload field is wrapped in
 * properPersonOrPlaceName(). --selftest mutates the REAL files and requires every assertion to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-quickcreate-workorder-title-cased";

const QUICK_CREATE = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";
const CREATE_WO = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";

export function checkQuickCreate(text) {
  const problems = [];
  if (!/import\s*\{\s*properPersonOrPlaceName\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/lib\/properDisplayText"/.test(text)) {
    problems.push("QuickCreateEntityModal: properPersonOrPlaceName is not imported.");
  }
  if (!/name:\s*titleCasedName,\s*\n\s*operating_company_id/.test(text)) {
    problems.push("QuickCreateEntityModal: createCustomer's name field is not the title-cased value.");
  }
  if (!/main_contact_name:\s*parsed\.data\.company\?\.trim\(\)\s*\?\s*properPersonOrPlaceName\(parsed\.data\.company\)\s*:\s*undefined/.test(text)) {
    problems.push("QuickCreateEntityModal: main_contact_name is not wrapped in properPersonOrPlaceName().");
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

function run() {
  const quickCreateText = readFileSync(QUICK_CREATE, "utf8");
  const createWoText = readFileSync(CREATE_WO, "utf8");
  const problems = [...checkQuickCreate(quickCreateText), ...checkCreateWo(createWoText)];
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — QuickCreateEntityModal (customer/part) and CreateWorkOrderModal (shop_name/shop_address) title-case their name/address fields.`);
}

function selftest() {
  const failures = [];
  const quickCreateReal = readFileSync(QUICK_CREATE, "utf8");
  const createWoReal = readFileSync(CREATE_WO, "utf8");

  if (checkQuickCreate(quickCreateReal).length) failures.push("QuickCreateEntityModal baseline should pass");
  if (checkCreateWo(createWoReal).length) failures.push("CreateWorkOrderModal baseline should pass");

  // Offender 1: QuickCreateEntityModal reverts main_contact_name to raw.
  const qcOffender1 = quickCreateReal.replace(
    'main_contact_name: parsed.data.company?.trim() ? properPersonOrPlaceName(parsed.data.company) : undefined,',
    "main_contact_name: parsed.data.company?.trim() || undefined,"
  );
  const p1 = checkQuickCreate(qcOffender1);
  if (!p1.some((m) => m.includes("main_contact_name"))) {
    failures.push(`offender-1 (raw main_contact_name) NOT caught: ${p1.join(" | ") || "none"}`);
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

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 4/4 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
