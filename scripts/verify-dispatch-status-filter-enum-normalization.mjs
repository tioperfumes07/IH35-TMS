#!/usr/bin/env node
/**
 * DISPATCH-LOAD-STATUS-FILTER-ENUM-MISMATCH-400 guard.
 * The dispatch loads list endpoint must normalize wide mdata status values
 * (draft, booked, planned, assigned, at_pickup, at_delivery, delivered,
 * invoiced, paid, closed) through fromMdataStatus before validating against
 * the narrow dispatchStatusSchema. Without this, a frontend filter sending
 * a legacy status value gets a silent 400.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/backend/src/dispatch/loads.routes.ts");
const src = readFileSync(filePath, "utf8");

const failures = [];

// Required: WIDE_LOAD_STATUS_VALUES set
if (!src.includes("WIDE_LOAD_STATUS_VALUES")) {
  failures.push("Missing WIDE_LOAD_STATUS_VALUES set for wide status recognition");
}

// Required: normalizeDispatchStatusFilterValue function
if (!src.includes("function normalizeDispatchStatusFilterValue")) {
  failures.push("Missing normalizeDispatchStatusFilterValue function");
}

// Required: function uses fromMdataStatus
if (!src.includes("fromMdataStatus(raw)")) {
  failures.push("normalizeDispatchStatusFilterValue must call fromMdataStatus");
}

// Required: preprocess on status field that maps through normalizeDispatchStatusFilterValue
if (!src.includes("normalizeDispatchStatusFilterValue")) {
  failures.push("Status filter schema must use normalizeDispatchStatusFilterValue in preprocess");
}

// Required: the wide values must include the known legacy aliases
const wideValues = ["draft", "booked", "planned", "assigned", "at_pickup", "at_delivery", "delivered", "invoiced", "paid", "closed"];
for (const v of wideValues) {
  if (!src.includes(`"${v}"`)) {
    failures.push(`WIDE_LOAD_STATUS_VALUES missing legacy alias "${v}"`);
  }
}

if (process.argv.includes("--selftest")) {
  const bad = src.replace("fromMdataStatus(raw)", "raw");
  if (bad.includes("fromMdataStatus(raw)")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-dispatch-status-filter-enum-normalization selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-dispatch-status-filter-enum-normalization FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-dispatch-status-filter-enum-normalization: OK — wide status values normalized through fromMdataStatus before dispatchStatusSchema validation");
process.exit(0);
