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
 * LST-F5163I: also requires a visible EntityPicker driver reverse filter (URL-only is not reverse).
 *
 * @matrix-built leafRe:safety\\.complaints\\.list
 */
import { readFileSync } from "node:fs";

const API = "apps/backend/src/routes/safety/complaints.ts";
const TAB = "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx";
const fail = [];
const SELFTEST = process.argv.includes("--selftest");

function assertComplaints(apiSrc, tabSrc) {
  const problems = [];
  if (!/complainant_driver_name/.test(apiSrc)) problems.push(`${API}: list query does not resolve complainant_driver_name`);
  if (!/respondent_driver_name/.test(apiSrc)) problems.push(`${API}: list query does not resolve respondent_driver_name`);

  const driverLinks = [...tabSrc.matchAll(/<EntityLink\b[\s\S]*?\/>/g)]
    .map((m) => m[0])
    .filter((link) => /kind="driver"/.test(link));
  if (driverLinks.length < 2)
    problems.push(`${TAB}: expected complainant + respondent driver EntityLinks, found ${driverLinks.length}`);
  for (const link of driverLinks) {
    if (!/label=/.test(link))
      problems.push(`${TAB}: a driver EntityLink has no label= — it will render the raw uuid`);
  }

  if (!/dataTestId="complaints-filter-driver"/.test(tabSrc) || !/allowCreate=\{false\}/.test(tabSrc)) {
    problems.push(`${TAB}: missing EntityPicker driver reverse filter (complaints-filter-driver, allowCreate=false)`);
  }
  if (!/setDriverFilter/.test(tabSrc) || !/searchParams\.get\("driver_id"\)/.test(tabSrc)) {
    problems.push(`${TAB}: ?driver_id= reverse deep-link must seed driverFilter`);
  }
  return problems;
}

const api = readFileSync(API, "utf8");
const tab = readFileSync(TAB, "utf8");

if (SELFTEST) {
  const live = assertComplaints(api, tab);
  if (live.length) {
    console.error("FAIL verify-complaints-driver-names SELFTEST (live dirty):", live.join(" | "));
    process.exit(1);
  }
  const planted = assertComplaints(api, tab.replace(/dataTestId="complaints-filter-driver"/g, 'dataTestId="x"'));
  if (!planted.some((p) => p.includes("complaints-filter-driver"))) {
    console.error("SELFTEST FAIL — filter removal stayed green");
    process.exit(1);
  }
  console.log("PASS verify-complaints-driver-names SELFTEST — filter + name ratchets hold");
  process.exit(0);
}

fail.push(...assertComplaints(api, tab));
if (fail.length) {
  console.error("FAIL verify-complaints-driver-names:");
  for (const f of fail) console.error("  - " + f);
  console.error("\n  A discipline record that cannot say who complained about whom is not a record.");
  process.exit(1);
}
console.log("PASS verify-complaints-driver-names — both columns resolve a driver name + reverse filter");
