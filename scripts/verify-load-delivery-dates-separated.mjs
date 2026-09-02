#!/usr/bin/env node
// ETA-MODEL BLOCK 1 guard — the two-date model stays separated and consumers read the EFFECTIVE
// delivery date through the shared helper, never a single hardcoded delivery date. This keeps a
// confirmed ETA slip flowing consistently to the board (and, later, the cash forecast).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
function failures(helperSource, loadsRouteSource, boardSource) {
  const problems = [];
  if (!helperSource.includes("effectiveDeliverySelectSql")) problems.push("effective-delivery helper must export effectiveDeliverySelectSql");
  if (!/COALESCE\(\s*\$\{loadAlias\}\.predicted_delivery_date,\s*\$\{deliveryAlias\}\.scheduled_arrival_at\s*\)/.test(helperSource)) {
    problems.push("helper must define effective = COALESCE(predicted_delivery_date, scheduled_arrival_at)");
  }
  if (!helperSource.includes("delivery_late_vs_appt")) problems.push("helper must expose the delivery_late_vs_appt flag");
  if (!loadsRouteSource.includes("effectiveDeliverySelectSql")) problems.push("loads list query must project via effectiveDeliverySelectSql");
  if (!boardSource.includes("load.effective_delivery_date")) problems.push("DispatchBoard must read effective_delivery_date");
  if (!boardSource.includes("delivery_late_vs_appt")) problems.push("DispatchBoard must surface the late-vs-appt indicator");
  if (/(INSERT|UPDATE|DELETE)\s+INTO?\s+accounting\./i.test(helperSource)) problems.push("effective-delivery helper must stay forecast/scheduling-only (no accounting writes)");
  return problems;
}

// 1. The shared helper is the single source of truth: effective = COALESCE(predicted, scheduled).
const helper = read("apps/backend/src/dispatch/effective-delivery.ts");
const loadsRoute = read("apps/backend/src/mdata/loads.routes.ts");
const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");

if (process.argv.includes("--selftest")) {
  const planted = board.replaceAll("load.effective_delivery_date", "load.delivery_scheduled_at");
  if (!failures(helper, loadsRoute, planted).includes("DispatchBoard must read effective_delivery_date")) {
    throw new Error("planted raw delivery-date consumer escaped");
  }
  console.log("PASS verify-load-delivery-dates-separated SELFTEST — planted raw delivery-date consumer rejected");
  process.exit(0);
}

const problems = failures(helper, loadsRoute, board);
if (problems.length > 0) {
  console.error(`FAIL verify-load-delivery-dates-separated: ${problems.join("; ")}`);
  process.exit(1);
}

console.log("PASS verify-load-delivery-dates-separated");
