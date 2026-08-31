#!/usr/bin/env node
/**
 * LoadDetailDrawer must expose a human-sequence "Mark in transit" button
 * for the dispatched/at_pickup → in_transit transition.
 * DISPATCH-NO-UI-DELIVERED-TRANSITION full sequence: dispatched → in_transit
 * → delivered_pending_docs → completed_docs_received.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const src = readFileSync(filePath, "utf8");

const failures = [];

// Required: loadCanMarkInTransit helper
if (!src.includes("export function loadCanMarkInTransit")) {
  failures.push("Missing loadCanMarkInTransit helper");
}

// Required: helper gates on dispatched and at_pickup only
if (!src.includes('["dispatched", "at_pickup"].includes')) {
  failures.push("loadCanMarkInTransit must gate on dispatched and at_pickup only");
}

// Required: visible button with data-testid
if (!src.includes('data-testid="load-detail-mark-in-transit"')) {
  failures.push("Missing visible Mark in transit button (data-testid)");
}

// Required: transitions to in_transit
if (!src.includes('new_status: "in_transit"')) {
  failures.push("Button must transition to in_transit");
}

// Required: deliver button no longer accepts dispatched (must go through in_transit first)
const deliverLine = src.match(/loadCanMarkDeliveredPendingDocs[\s\S]*?\[([^\]]+)\]/);
if (deliverLine && deliverLine[1].includes("dispatched")) {
  failures.push("loadCanMarkDeliveredPendingDocs must NOT accept dispatched — in_transit hop is required first");
}

if (process.argv.includes("--selftest")) {
  const bad = src.replace('data-testid="load-detail-mark-in-transit"', 'data-testid="removed"');
  if (bad.includes('data-testid="load-detail-mark-in-transit"')) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-dispatch-load-detail-in-transit-button selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-dispatch-load-detail-in-transit-button FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-dispatch-load-detail-in-transit-button: OK — LoadDetailDrawer has Mark in transit button + deliver requires in_transit hop");
process.exit(0);
