#!/usr/bin/env node
/**
 * FAIL-CP1 ratchet — the complaints grid must name the driver, both directions.
 *
 * Why: `EntityLink` falls back to `label ?? id`, so a call site that omits `label` prints a raw
 * uuid. On safety.complaints the same driver can be COMPLAINANT on one row and RESPONDENT on
 * another — both columns showed `49427973-e93e-4ea7-a2eb-eb9eefa7f331`. This is a privacy-gated
 * discipline record: "who complained about whom" is the entire content of the row.
 *
 * Asserts the list query resolves both names and both call sites pass a label.
 */
import { readFileSync } from "node:fs";

const API = "apps/backend/src/routes/safety/complaints.ts";
const TAB = "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx";
const fail = [];

const api = readFileSync(API, "utf8");
if (!/complainant_driver_name/.test(api)) fail.push(`${API}: list query does not resolve complainant_driver_name`);
if (!/respondent_driver_name/.test(api)) fail.push(`${API}: list query does not resolve respondent_driver_name`);

const tab = readFileSync(TAB, "utf8");
// Every driver EntityLink in this grid must carry a label — that is the whole defect.
const driverLinks = tab.match(/<EntityLink[\s\S]{0,240}?kind="driver"[\s\S]{0,240}?\/>/g) ?? [];
if (driverLinks.length < 2)
  fail.push(`${TAB}: expected complainant + respondent driver EntityLinks, found ${driverLinks.length}`);
for (const link of driverLinks) {
  if (!/label=/.test(link))
    fail.push(`${TAB}: a driver EntityLink has no label= — it will render the raw uuid`);
}

if (fail.length) {
  console.error("FAIL verify-complaints-driver-names:");
  for (const f of fail) console.error("  - " + f);
  console.error("\n  A discipline record that cannot say who complained about whom is not a record.");
  process.exit(1);
}
console.log("PASS verify-complaints-driver-names — both columns resolve a driver name");
