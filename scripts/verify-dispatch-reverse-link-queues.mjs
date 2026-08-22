#!/usr/bin/env node
/**
 * @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leafRe":"^(queues\\.(border|alerts|trip_pairing|factoring|factoring_queue)|docs\\.(ocr|equipment_transfers)|misc\\.layover)$","task":"VERTICAL-REVERSE-LINK-dispatch-queues","vertical":"column-wave"}
 * Ratchet exact canonical row drills on every governed Dispatch queue leaf.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-reverse-link-queues";
const files = {
  border: "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx",
  atRisk: "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
  trips: "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx",
  factoringQueue: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx",
  factoringList: "apps/frontend/src/pages/accounting/FactoringListPage.tsx",
  ocr: "apps/frontend/src/pages/dispatch/OcrQueuePage.tsx",
  transfers: "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx",
  layover: "apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, rel]) => [key, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const checks = [
  ["border", /kind="unit" id=\{row\.unit_id\} label=\{label\}[\s\S]{0,80}?border-history-unit-link/, "border row unit drill"],
  ["border", /kind="driver" id=\{selected\.driver_id\} label=\{label\}[\s\S]{0,80}?border-history-driver-link/, "border detail driver drill"],
  ["border", /kind="load" id=\{selected\.load_id\} label=\{label\}[\s\S]{0,80}?border-history-load-link/, "border detail load drill"],
  ["border", /kind="vendor" id=\{selected\.customs_broker_id\} label=\{label\}[\s\S]{0,80}?border-history-broker-link/, "border detail broker drill"],
  ["atRisk", /kind="load" id=\{load\.id\} name=\{load\.load_number\} noun="Load"/, "at-risk load drill"],
  ["atRisk", /kind="customer" id=\{load\.customer_id\} name=\{load\.customer_name\} noun="Customer"/, "at-risk customer drill"],
  ["atRisk", /kind="driver" id=\{load\.driver_id\} name=\{load\.driver_name\} noun="Driver"/, "at-risk driver drill"],
  ["atRisk", /kind="unit" id=\{load\.unit_id\} name=\{load\.unit_number\} noun="Unit"/, "at-risk unit drill"],
  ["trips", /kind="unit" id=\{u\.unit_id\} name=\{u\.unit_number\} noun="Unit"/, "unbooked unit drill"],
  ["trips", /kind="driver" id=\{u\.driver_id\} name=\{u\.driver_name\} noun="Driver"/, "unbooked driver drill"],
  ["trips", /kind="unit" id=\{t\.unit_id\} name=\{t\.unit_number\} noun="Unit"/, "paired unit drill"],
  ["trips", /kind="driver" id=\{t\.driver_id\} name=\{t\.driver_name\} noun="Driver"/, "paired driver drill"],
  ["factoringQueue", /kind="load" id=\{row\.load_id\} label=\{entityLabel\(row\.load_number, row\.load_id, "Load"\)\}/, "factoring queue load drill"],
  ["factoringQueue", /kind="customer"[\s\S]{0,80}?id=\{row\.customer_id\}[\s\S]{0,100}?entityLabel\(row\.customer_name, row\.customer_id, "Customer"\)/, "factoring queue customer drill"],
  ["factoringQueue", /kind="invoice"[\s\S]{0,80}?id=\{row\.invoice_id\}[\s\S]{0,110}?entityLabel\(row\.invoice_display_id, row\.invoice_id, "Invoice"\)/, "factoring queue invoice drill"],
  ["factoringList", /kind="factoring_advance"[\s\S]{0,80}?id=\{row\.id\}[\s\S]{0,100}?entityLabel\(row\.display_id, row\.id, "Advance"\)/, "factoring list advance drill"],
  ["ocr", /kind="customer" id=\{f\.customer_id\} name=\{f\.customer_name_raw\} noun="Customer"/, "OCR customer drill"],
  ["ocr", /kind="load" id=\{item\.converted_load_id\} name=\{null\} noun="Load"/, "OCR converted-load drill"],
  ["transfers", /kind="trailer"[\s\S]{0,80}?id=\{row\.equipment_uuid\}[\s\S]{0,80}?name=\{row\.equipment_number\}/, "transfer equipment drill"],
  ["transfers", /kind="driver"[\s\S]{0,80}?id=\{row\.from_driver_uuid\}[\s\S]{0,80}?name=\{row\.from_driver_name\}/, "transfer from-driver drill"],
  ["transfers", /kind="driver"[\s\S]{0,80}?id=\{row\.to_driver_uuid\}[\s\S]{0,80}?name=\{row\.to_driver_name\}/, "transfer to-driver drill"],
  ["layover", /kind="load" id=\{row\.previous_load_uuid\}[\s\S]{0,100}?entityLabel\(row\.previous_load_number, row\.previous_load_uuid, "Load"\)/, "layover previous-load drill"],
  ["layover", /kind="load" id=\{row\.next_load_uuid\}[\s\S]{0,130}?entityLabel\(row\.next_load_number, row\.next_load_uuid, "Load"\)/, "layover next-load drill"],
];

export function collectFailures(src = source) {
  return checks.filter(([key, pattern]) => !pattern.test(src[key])).map(([, , name]) => name);
}

function selftest() {
  const baseline = collectFailures();
  if (baseline.length) throw new Error(`clean baseline red: ${baseline.join("; ")}`);
  let rejected = 0;
  for (const [key, pattern, name] of checks) {
    const plantedText = source[key].replace(pattern, `/* planted ${name} */`);
    if (plantedText === source[key]) throw new Error(`plant target missing: ${name}`);
    if (collectFailures({ ...source, [key]: plantedText }).includes(name)) rejected += 1;
  }
  if (rejected !== checks.length) throw new Error(`rejected ${rejected}/${checks.length} plants`);
  console.log(`[${LABEL}] --selftest PASS: rejected ${rejected}/${checks.length} independent exact-row plants`);
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const failures = collectFailures();
    if (failures.length) throw new Error(failures.join("; "));
    console.log(`[${LABEL}] PASS: ${checks.length} exact queue reverse drills ratcheted`);
  }
} catch (error) {
  console.error(`[${LABEL}] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
