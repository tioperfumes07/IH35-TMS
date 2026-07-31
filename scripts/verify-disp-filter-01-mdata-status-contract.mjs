#!/usr/bin/env node
/**
 * DISP-FILTER-01 — mdata loads list status contract matches Neon enum + statuses alias.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(resolve(ROOT, "apps/backend/src/mdata/loads.routes.ts"), "utf8");
const required = [
  "delivered_pending_docs",
  "completed_docs_received",
  "assigned_not_dispatched",
  "unassigned",
  "statusFilterSchema",
  "statuses: statusFilterSchema",
  "statusesParam",
];
const missing = required.filter((tok) => !src.includes(tok));
if (missing.length) {
  console.error("FAIL verify-disp-filter-01-mdata-status-contract — missing:", missing.join(", "));
  process.exit(1);
}
console.log("PASS verify-disp-filter-01-mdata-status-contract");
