#!/usr/bin/env node
/**
 * 443.348 — geofence stop-stamp path must call the same side-effects as
 * dispatch/stop-stamp.service.ts (the canonical path).
 *
 * STATIC: geofence-detector.service.ts must import and call:
 *   - latchOnDeliveryEvidence  (raises receivable on delivery departure)
 *   - pingSettlementOnLoadEvent (settlement ping on departure)
 *   - appendCrudAudit           (WORM audit record)
 * AND must contain a load-status UPDATE after the stop stamp (status transition).
 *
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-geofence-stop-stamp-parity";
const TARGET = "apps/backend/src/telematics/geofence-detector.service.ts";

export function staticFailures(src) {
  const f = [];
  if (!/^import\s.*latchOnDeliveryEvidence/m.test(src))
    f.push("geofence-detector does not import latchOnDeliveryEvidence");
  if (!/^\s+await latchOnDeliveryEvidence\(/m.test(src))
    f.push("geofence-detector does not call latchOnDeliveryEvidence on departure");
  if (!/^import\s.*pingSettlementOnLoadEvent/m.test(src))
    f.push("geofence-detector does not import pingSettlementOnLoadEvent");
  if (!/^\s+await pingSettlementOnLoadEvent\(/m.test(src))
    f.push("geofence-detector does not call pingSettlementOnLoadEvent on departure");
  if (!/^import\s.*appendCrudAudit/m.test(src))
    f.push("geofence-detector does not import appendCrudAudit");
  if (!/^\s+await appendCrudAudit\(/m.test(src))
    f.push("geofence-detector does not call appendCrudAudit after stamp");
  if (!/UPDATE mdata\.loads SET status/.test(src))
    f.push("geofence-detector does not update mdata.loads status after stamp");
  return f;
}

const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");

if (process.argv.includes("--selftest")) {
  const plant = (from, to) => {
    if (!src.includes(from)) return null;
    return staticFailures(src.replace(from, to)).length > 0;
  };
  const cases = [
    ["clean sources pass", staticFailures(src).length === 0],
    ["no latch import FAILS", plant("import { latchOnDeliveryEvidence }", "import_REMOVED { latchOnDeliveryEvidence }")],
    ["no latch call FAILS", plant("await latchOnDeliveryEvidence(", "removed_latchOnDeliveryEvidence(")],
    ["no ping import FAILS", plant("import { pingSettlementOnLoadEvent }", "import_REMOVED { pingSettlementOnLoadEvent }")],
    ["no ping call FAILS", plant("await pingSettlementOnLoadEvent(", "removed_pingSettlementOnLoadEvent(")],
    ["no audit import FAILS", plant("import { appendCrudAudit }", "import_REMOVED { appendCrudAudit }")],
    ["no audit call FAILS", plant("await appendCrudAudit(", "removed_appendCrudAudit(")],
    ["no load status UPDATE FAILS", plant("UPDATE mdata.loads SET status", "UPDATE mdata.loads SET x")],
  ];
  let bad = 0;
  for (const [n, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = staticFailures(src);
if (failures.length) {
  console.error(`${LABEL}: FAIL — ${failures.length}`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — geofence departure path calls latchOnDeliveryEvidence, pingSettlementOnLoadEvent, appendCrudAudit, and load-status UPDATE`);
