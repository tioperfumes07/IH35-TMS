#!/usr/bin/env node
// ETA-MODEL BLOCK 1 guard — the two-date model stays separated and consumers read the EFFECTIVE
// delivery date through the shared helper, never a single hardcoded delivery date. This keeps a
// confirmed ETA slip flowing consistently to the board (and, later, the cash forecast).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-load-delivery-dates-separated: ${m}`);
  process.exit(1);
};

// 1. The shared helper is the single source of truth: effective = COALESCE(predicted, scheduled).
const helper = read("apps/backend/src/dispatch/effective-delivery.ts");
if (!helper.includes("effectiveDeliverySelectSql")) fail("effective-delivery helper must export effectiveDeliverySelectSql");
if (!/COALESCE\(\s*\$\{loadAlias\}\.predicted_delivery_date,\s*\$\{deliveryAlias\}\.scheduled_arrival_at\s*\)/.test(helper)) {
  fail("helper must define effective = COALESCE(predicted_delivery_date, scheduled_arrival_at)");
}
if (!helper.includes("delivery_late_vs_appt")) fail("helper must expose the delivery_late_vs_appt flag");

// 2. The loads list query reads delivery dates THROUGH the helper, not a bespoke COALESCE/expr.
const loadsRoute = read("apps/backend/src/mdata/loads.routes.ts");
if (!loadsRoute.includes("effectiveDeliverySelectSql")) fail("loads list query must project via effectiveDeliverySelectSql");

// 3. The board consumes effective_delivery_date (not just the city / a raw scheduled date).
const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (!board.includes("effective_delivery_date")) fail("DispatchBoard must read effective_delivery_date");
if (!board.includes("delivery_late_vs_appt")) fail("DispatchBoard must surface the late-vs-appt indicator");

// 4. Forecast-only boundary: the helper must not WRITE to accounting/AR/QBO (prose mentioning
//    "invoice"/"QBO" in the doc comment is fine; an actual INSERT/UPDATE is not).
if (/(INSERT|UPDATE|DELETE)\s+INTO?\s+accounting\./i.test(helper)) fail("effective-delivery helper must stay forecast/scheduling-only (no accounting writes)");

console.log("PASS verify-load-delivery-dates-separated");
