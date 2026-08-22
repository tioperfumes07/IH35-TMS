#!/usr/bin/env node
/** @matrix-built {"modules":["settlements"],"cols":["connectivity","reverse_link"],"leaves":["cash_advances"],"task":"CLASS-F5887-PRIMARY-ROSTER-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["vendors"],"cols":["ap_bill","connectivity","reverse_link"],"leaves":["detail.ap.bills"],"task":"CLASS-F5887-PRIMARY-ROSTER-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["maintenance"],"cols":["work_order","connectivity","reverse_link"],"leaves":["wo.console.list"],"task":"CLASS-F5887-PRIMARY-ROSTER-REVERSE-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  advances: "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx",
  vendors: "apps/frontend/src/pages/VendorDetail.tsx",
  workOrders: "apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx",
  settlementsMatrix: "docs/specs/scoreboard/modules/settlements.required.json",
  vendorsMatrix: "docs/specs/scoreboard/modules/vendors.required.json",
  maintenanceMatrix: "docs/specs/scoreboard/modules/maintenance.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-primary-roster-record-reverse-links.mjs",
};
const HEADERS = [
  '/** @matrix-built {"modules":["settlements"],"cols":["connectivity","reverse_link"],"leaves":["cash_advances"],"task":"CLASS-F5887-PRIMARY-ROSTER-REVERSE-EXACT","vertical":"class-sweep"} */',
  '/** @matrix-built {"modules":["vendors"],"cols":["ap_bill","connectivity","reverse_link"],"leaves":["detail.ap.bills"],"task":"CLASS-F5887-PRIMARY-ROSTER-REVERSE-EXACT","vertical":"class-sweep"} */',
  '/** @matrix-built {"modules":["maintenance"],"cols":["work_order","connectivity","reverse_link"],"leaves":["wo.console.list"],"task":"CLASS-F5887-PRIMARY-ROSTER-REVERSE-EXACT","vertical":"class-sweep"} */',
];
const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function verify(source) {
  const failures = [];
  const need = (key, text, message) => { if (!source[key].includes(text)) failures.push(message); };
  need("advances", 'kind="cash_advance"', "cash advance roster primary identity must use the canonical kind");
  need("advances", 'id={String(row.id)}', "cash advance roster must drill through by canonical row id");
  need("advances", 'data-testid="cash-advance-roster-record-link"', "cash advance roster link must stay mounted");
  if (!/<EntityLink\b(?=[^>]*kind="bill")(?=[^>]*id=\{b\.id\})(?=[^>]*data-testid="vendor-payment-bill-link")[^>]*\/>/.test(source.vendors)) {
    failures.push("vendor payment application bill identity must drill through by canonical bill id");
  }
  if (!/<EntityLink\b(?=[^>]*kind="work_order")(?=[^>]*id=\{String\(row\.id\)\})(?=[^>]*data-testid="work-order-console-record-link")[^>]*\/>/.test(source.workOrders)) {
    failures.push("work-order console primary identity must drill through by its canonical normalized row id");
  }
  const required = [
    ["settlementsMatrix", "cash_advances", ["connectivity", "reverse_link"], "/driver-finance/cash-advance-requests"],
    ["vendorsMatrix", "detail.ap.bills", ["ap_bill", "connectivity", "reverse_link"], "/vendors/:id?tab=ap"],
    ["maintenanceMatrix", "wo.console.list", ["work_order", "connectivity", "reverse_link"], "/maintenance/work-orders"],
  ];
  for (const [key, id, cols, route] of required) {
    let matrix;
    try { matrix = JSON.parse(source[key]); } catch (error) { failures.push(`${key} must parse: ${error.message}`); continue; }
    const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
    for (const col of cols) if (!leaf?.required?.includes(col)) failures.push(`${id} must inventory ${col}`);
    if (leaf?.route_hint !== route) failures.push(`${id} must name mounted route ${route}`);
  }
  const annotationBlock = source.self.split('import fs from "node:fs";')[0];
  for (const header of HEADERS) if (!annotationBlock.includes(header)) failures.push(`missing exact matrix header: ${header}`);
  try {
    const feed = JSON.parse(source.feed);
    if (feed.entries?.some((entry) => entry.guard === FILES.self)) failures.push("manual feed must not duplicate exact in-guard ownership");
  } catch (error) { failures.push(`wire sprint feed must parse: ${error.message}`); }
  return failures;
}
const source = read();
const failures = verify(source);
if (failures.length) { console.error("primary roster reverse-link guard failed:"); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1); }
if (process.argv.includes("--self-test")) {
  const mutations = [
    ["advances", 'kind="cash_advance"', 'kind="liability"'],
    ["advances", 'id={String(row.id)}', 'id={undefined}'],
    ["vendors", 'kind="bill"', 'kind="vendor"'],
    ["vendors", 'id={b.id}', 'id={undefined}'],
    ["vendors", 'data-testid="vendor-payment-bill-link"', 'data-testid="broken-vendor-bill-link"'],
    ["workOrders", 'data-testid="work-order-console-record-link"', 'data-testid="broken-work-order-link"'],
    ["workOrders", 'id={String(row.id)}', 'id={row.id}'],
    ["advances", 'data-testid="cash-advance-roster-record-link"', 'data-testid="broken-cash-advance-link"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replace(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  const matrixMutations = [
    ["settlementsMatrix", "cash_advances", ["connectivity", "reverse_link"]],
    ["vendorsMatrix", "detail.ap.bills", ["ap_bill", "connectivity", "reverse_link"]],
    ["maintenanceMatrix", "wo.console.list", ["work_order", "connectivity", "reverse_link"]],
  ];
  for (const [key, id, cols] of matrixMutations) {
    for (const token of [`\"id\": \"${id}\"`, ...cols.map((col) => `\"${col}\"`)]) {
      const changed = source[key].replace(token, `${token}.broken`);
      if (changed === source[key]) throw new Error(`self-test fixture missing: ${key} ${token}`);
      if (!verify({ ...source, [key]: changed }).length) throw new Error(`self-test matrix mutation survived: ${key} ${token}`);
    }
  }
  for (const header of HEADERS) {
    const brokenHeader = header.replace('"vertical":"class-sweep"', '"vertical":"broken"');
    if (!verify({ ...source, self: source.self.replace(header, brokenHeader) }).length) throw new Error("self-test header mutation survived");
  }
  const feed = JSON.parse(source.feed);
  feed.entries.unshift({ guard: FILES.self, modules: ["maintenance"], cols: ["reverse_link"], leafRe: ".*" });
  if (!verify({ ...source, feed: JSON.stringify(feed) }).length) throw new Error("self-test feed mutation survived");
  console.log("PASS: 23 planted defects were rejected");
}
console.log("PASS: primary roster records drill through across Settlements, Vendors, and Maintenance");
