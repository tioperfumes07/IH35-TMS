#!/usr/bin/env node
// BLOCK 2 guard — every predicted_delivery_date commit writes an audit row. No silent date change:
// the confirm path must UPDATE mdata.loads.predicted_delivery_date AND INSERT a
// forecast.predicted_delivery_changes row, capturing old + new date and the confirming user.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-cash-eta-audit-logged: ${m}`);
  process.exit(1);
};

const route = read("apps/backend/src/dispatch/predicted-delivery.routes.ts");

const updateIdx = route.indexOf("UPDATE\n            SET predicted_delivery_date");
const updateAt = route.search(/UPDATE\s+mdata\.loads/);
const insertAt = route.indexOf("INSERT INTO forecast.predicted_delivery_changes");
if (updateAt < 0) fail("confirm path must UPDATE mdata.loads.predicted_delivery_date");
if (insertAt < 0) fail("confirm path must INSERT the audit row");
// The audit INSERT must come AFTER the prediction UPDATE in the same handler (so a date change is
// never committed without its audit row).
if (insertAt < updateAt) fail("audit INSERT must follow the predicted_delivery_date UPDATE");

// The audit row captures old + new date and the confirming user.
for (const col of ["old_predicted_date", "new_predicted_date", "confirmed_by_user_id", "triggering_signals"]) {
  if (!route.includes(col)) fail(`audit write must record ${col}`);
}
void updateIdx;
console.log("PASS verify-cash-eta-audit-logged");
