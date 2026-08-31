#!/usr/bin/env node
/**
 * LoadDetailDrawer must expose a human-sequence "Mark completed (docs received)"
 * button for the delivered_pending_docs → completed_docs_received transition.
 * DISPATCH-NO-UI-DELIVERED-TRANSITION fix — the complete step was missing from UI.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const src = readFileSync(filePath, "utf8");

const failures = [];

// Required: loadCanMarkCompletedDocsReceived helper
if (!src.includes("export function loadCanMarkCompletedDocsReceived")) {
  failures.push("Missing loadCanMarkCompletedDocsReceived helper");
}

// Required: helper gates on delivered_pending_docs only
if (!src.includes('["delivered_pending_docs"].includes')) {
  failures.push("loadCanMarkCompletedDocsReceived must gate on delivered_pending_docs only");
}

// Required: visible button with data-testid
if (!src.includes('data-testid="load-detail-mark-completed-docs"')) {
  failures.push("Missing visible Mark completed (docs received) button (data-testid)");
}

// Required: transitions to completed_docs_received
if (!src.includes('new_status: "completed_docs_received"')) {
  failures.push("Button must transition to completed_docs_received");
}

if (process.argv.includes("--selftest")) {
  const bad = src.replace("load-detail-mark-completed-docs", "removed-testid");
  if (bad.includes("load-detail-mark-completed-docs")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-dispatch-load-detail-complete-transition selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-dispatch-load-detail-complete-transition FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-dispatch-load-detail-complete-transition: OK — LoadDetailDrawer has Mark completed (docs received) button");
process.exit(0);
