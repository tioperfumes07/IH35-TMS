#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","inventory","vendors"],"cols":["reverse_link"],"leafRe":"^(secondary\.pre_settlements|docs\.(ocr|equipment_transfers)|misc\.layover|assignments\.(wo_link|unit_link|vendor_link)|md\.(transaction_list|vendor_details))$","task":"LINK-F5152-DISPATCH-INVENTORY-VENDOR-WORKFLOW-LINKS","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  routes: "apps/frontend/src/routes/manifest.tsx",
  preSettlement: "apps/frontend/src/components/dispatch/PreSettlementPanel.tsx",
  ocr: "apps/frontend/src/pages/dispatch/OcrQueuePage.tsx",
  transfers: "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx",
  layover: "apps/frontend/src/pages/drivers/DriverLayoverHistoryPage.tsx",
  assignments: "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
  vendors: "apps/frontend/src/pages/Vendors.tsx",
  dispatchMatrix: "docs/specs/scoreboard/modules/dispatch.required.json",
  inventoryMatrix: "docs/specs/scoreboard/modules/inventory.required.json",
  vendorsMatrix: "docs/specs/scoreboard/modules/vendors.required.json",
};

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

const REQUIRED_LEAVES = {
  dispatchMatrix: ["secondary.pre_settlements", "docs.ocr", "docs.equipment_transfers", "misc.layover"],
  inventoryMatrix: ["assignments.wo_link", "assignments.unit_link", "assignments.vendor_link"],
  vendorsMatrix: ["md.transaction_list", "md.vendor_details"],
};

export function verify(source) {
  const failures = [];
  const need = (key, text, message) => { if (!source[key].includes(text)) failures.push(message); };
  need("routes", 'path="/dispatch/equipment-transfers"', "equipment-transfer queue must have a mounted route");
  need("routes", 'path="/dispatch/layovers/driver/:driverId"', "driver layover history must have a mounted route");
  need("routes", 'path="/accounting/pre-settlements"', "pre-settlement workflow must have a mounted canonical route");
  need("preSettlement", 'kind="settlement" id={settlement.id}', "pre-settlement header must drill to the settlement");
  need("preSettlement", 'kind="load"', "pre-settlement trips must drill to canonical loads");
  need("ocr", 'kind="customer" id={f.customer_id}', "OCR review must drill to its resolved customer");
  need("ocr", "convertOcrIntakeToBookLoad", "OCR review must retain its canonical Book Load handoff");
  need("transfers", 'kind="driver"', "equipment transfers must reverse-drill to both drivers");
  need("transfers", "operating_company_id=${encodeURIComponent(companyId)}", "equipment-transfer reads must remain explicitly company scoped");
  need("layover", 'kind="driver"', "layover history must reverse-drill to its driver profile");
  need("layover", "operatingCompanyId={operatingCompanyId}", "layover history must pass explicit company scope to its data panel");
  need("assignments", 'kind="work_order"', "assignment trail must drill to work orders");
  need("assignments", 'kind="unit"', "assignment trail must drill to units");
  need("assignments", 'kind="vendor"', "assignment trail must drill to vendors");
  need("vendors", 'vendor_id: selectedVendor!.id', "vendor transactions must read the selected vendor identity");
  need("vendors", '<EntityLink kind="bill" id={r.id}', "vendor transaction documents must drill to bills");
  need("vendors", 'data-testid="vendor-master-detail-record-link"', "vendor master-detail header must drill to the selected vendor");
  for (const [key, ids] of Object.entries(REQUIRED_LEAVES)) {
    let matrix;
    try { matrix = JSON.parse(source[key]); } catch (error) { failures.push(`${key} must parse: ${error.message}`); continue; }
    for (const id of ids) {
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("reverse_link")) failures.push(`${key}:${id} must inventory reverse_link`);
    }
  }
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error("dispatch/inventory/vendor workflow-link guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
if (process.argv.includes("--self-test")) {
  const mutations = [
    ["routes", 'path="/dispatch/equipment-transfers"', 'path="/dispatch/equipment-transfers-broken"'],
    ["routes", 'path="/dispatch/layovers/driver/:driverId"', 'path="/dispatch/layovers"'],
    ["routes", 'path="/accounting/pre-settlements"', 'path="/accounting/pre-settlements-broken"'],
    ["preSettlement", 'kind="settlement" id={settlement.id}', 'kind="load" id={settlement.id}'],
    ["preSettlement", 'kind="load"', 'kind="driver"'],
    ["ocr", 'kind="customer" id={f.customer_id}', 'kind="vendor" id={f.customer_id}'],
    ["ocr", "convertOcrIntakeToBookLoad", "convertOcrIntakeBroken"],
    ["transfers", 'kind="driver"', 'kind="unit"'],
    ["transfers", "operating_company_id=${encodeURIComponent(companyId)}", "operating_company_id="],
    ["layover", 'kind="driver"', 'kind="load"'],
    ["layover", "operatingCompanyId={operatingCompanyId}", "operatingCompanyId={undefined}"],
    ["assignments", 'kind="work_order"', 'kind="unit"'],
    ["assignments", 'kind="unit"', 'kind="driver"'],
    ["assignments", 'kind="vendor"', 'kind="customer"'],
    ["vendors", 'vendor_id: selectedVendor!.id', 'vendor_id: undefined'],
    ["vendors", '<EntityLink kind="bill" id={r.id}', '<span data-bill={r.id}'],
    ["vendors", 'data-testid="vendor-master-detail-record-link"', 'data-testid="broken-vendor-link"'],
    ["dispatchMatrix", '"id": "secondary.pre_settlements"', '"id": "secondary.pre_settlements.broken"'],
    ["inventoryMatrix", '"id": "assignments.wo_link"', '"id": "assignments.wo_link.broken"'],
    ["vendorsMatrix", '"id": "md.transaction_list"', '"id": "md.transaction_list.broken"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted defects were rejected`);
}
console.log("PASS: dispatch, inventory, and vendor workflows reverse-drill through canonical company-scoped identities");
