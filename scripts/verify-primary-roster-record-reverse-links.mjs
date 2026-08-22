#!/usr/bin/env node
/** @matrix-built {"modules":["vendors","maintenance"],"cols":["ap_bill","work_order","liability","connectivity","reverse_link"],"leafRe":"^(detail\\.ap\\.bills|wo\\.console\\.list)$","task":"LINK-F5139-PRIMARY-ROSTER-RECORD-REVERSE-LINKS","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  advances: "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx",
  vendors: "apps/frontend/src/pages/VendorDetail.tsx",
  workOrders: "apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx",
  maintenanceMatrix: "docs/specs/scoreboard/modules/maintenance.required.json",
};
const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function verify(source) {
  const failures = [];
  const need = (key, text, message) => { if (!source[key].includes(text)) failures.push(message); };
  need("advances", 'kind="cash_advance"', "cash advance roster primary identity must use the canonical kind");
  need("advances", 'id={String(row.id)}', "cash advance roster must drill through by canonical row id");
  need("advances", 'data-testid="cash-advance-roster-record-link"', "cash advance roster link must stay mounted");
  need("vendors", 'data-testid="vendor-payment-bill-link"', "vendor payment application bill identity must drill through");
  if (!/<EntityLink\b(?=[^>]*kind="work_order")(?=[^>]*id=\{String\(row\.id\)\})(?=[^>]*data-testid="work-order-console-record-link")[^>]*\/>/.test(source.workOrders)) {
    failures.push("work-order console primary identity must drill through by its canonical normalized row id");
  }
  let matrix;
  try { matrix = JSON.parse(source.maintenanceMatrix); } catch (error) { failures.push(`maintenance matrix must parse: ${error.message}`); }
  const leaf = matrix?.leaves?.find((candidate) => candidate.id === "wo.console.list");
  if (!leaf?.required?.includes("reverse_link")) failures.push("wo.console.list must inventory reverse_link");
  if (!leaf?.required?.includes("work_order")) failures.push("wo.console.list must inventory work_order");
  if (leaf?.route_hint !== "/maintenance/work-orders") failures.push("wo.console.list must name the mounted console route");
  return failures;
}
const source = read();
const failures = verify(source);
if (failures.length) { console.error("primary roster reverse-link guard failed:"); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1); }
if (process.argv.includes("--self-test")) {
  const mutations = [
    ["advances", 'kind="cash_advance"', 'kind="liability"'],
    ["advances", 'id={String(row.id)}', 'id={undefined}'],
    ["vendors", 'data-testid="vendor-payment-bill-link"', 'data-testid="broken-vendor-bill-link"'],
    ["workOrders", 'data-testid="work-order-console-record-link"', 'data-testid="broken-work-order-link"'],
    ["workOrders", 'id={String(row.id)}', 'id={row.id}'],
    ["maintenanceMatrix", '"id": "wo.console.list"', '"id": "wo.console.list.broken"'],
    ["maintenanceMatrix", '"route_hint": "/maintenance/work-orders"', '"route_hint": "/maintenance"'],
    ["maintenanceMatrix", '"work_order",\n        "connectivity",\n        "reverse_link"', '"work_order_broken",\n        "connectivity",\n        "reverse_link_broken"'],
    ["advances", 'data-testid="cash-advance-roster-record-link"', 'data-testid="broken-cash-advance-link"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replace(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted defects were rejected`);
}
console.log("PASS: primary roster records drill through across Settlements, Vendors, and Maintenance");
