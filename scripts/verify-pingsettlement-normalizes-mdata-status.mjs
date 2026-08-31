#!/usr/bin/env node
/**
 * pingSettlementOnLoadEvent must normalize dispatchTargetStatus through fromMdataStatus
 * before its exact-match checks for "in_transit" and "delivered_pending_docs".
 * PINGSETTLEMENT-EXACT-MATCH-GAP — raw mdata values (at_pickup, at_delivery, delivered)
 * from driver-PWA callers were not normalized, so settlements never opened/closed
 * for loads that reached settleable status via the driver PWA path.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/backend/src/driver-finance/settlements-load-bookended.service.ts");
const src = readFileSync(filePath, "utf8");

const failures = [];

// Required: import fromMdataStatus
if (!src.includes('fromMdataStatus') || !src.includes('load-state-machine')) {
  failures.push("Missing fromMdataStatus import from load-state-machine");
}

// Required: normalizedStatus variable using fromMdataStatus
if (!src.includes("fromMdataStatus(opts.dispatchTargetStatus)")) {
  failures.push("pingSettlementOnLoadEvent must normalize dispatchTargetStatus via fromMdataStatus");
}

// Required: exact-match checks use normalizedStatus, not opts.dispatchTargetStatus
if (src.includes('opts.dispatchTargetStatus === "in_transit"')) {
  failures.push('Must use normalizedStatus === "in_transit", not opts.dispatchTargetStatus');
}
if (src.includes('opts.dispatchTargetStatus === "delivered_pending_docs"')) {
  failures.push('Must use normalizedStatus === "delivered_pending_docs", not opts.dispatchTargetStatus');
}

if (!src.includes('normalizedStatus === "in_transit"')) {
  failures.push('Missing normalizedStatus === "in_transit" check');
}
if (!src.includes('normalizedStatus === "delivered_pending_docs"')) {
  failures.push('Missing normalizedStatus === "delivered_pending_docs" check');
}

if (process.argv.includes("--selftest")) {
  const bad = src.replace("fromMdataStatus(opts.dispatchTargetStatus)", "opts.dispatchTargetStatus");
  if (bad.includes("fromMdataStatus(opts.dispatchTargetStatus)")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-pingsettlement-normalizes-mdata-status selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-pingsettlement-normalizes-mdata-status FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-pingsettlement-normalizes-mdata-status: OK — pingSettlementOnLoadEvent normalizes dispatchTargetStatus via fromMdataStatus");
process.exit(0);
