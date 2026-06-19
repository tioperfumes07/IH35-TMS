#!/usr/bin/env node
// Guard — Compliance HOS Tracker tab shell (Block 02) + the canonical roster source. /compliance must be tabbed
// (Overview keeps every prior section — additive), the HOS Tracker tab must render, and the timeline (Block 03) +
// dense table (Block 04) must read ONE canonical endpoint (/hos/daily-roster) so they agree per driver.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-compliance-hos-tracker-shell: ${m}`); process.exit(1); };

// Canonical roster endpoint + service (single source for Blocks 03/04).
const routes = read("apps/backend/src/telematics/hos-tracker.routes.ts");
if (!/"\/api\/v1\/telematics\/hos\/daily-roster"/.test(routes))
  fail("must expose GET /api/v1/telematics/hos/daily-roster (canonical source for the timeline + table)");
const svc = read("apps/backend/src/telematics/hos-tracker.service.ts");
if (!/export async function getHosDailyRoster/.test(svc))
  fail("getHosDailyRoster must exist (loops active drivers through getHosDaily so cycle math is one source)");
if (!/getHosDaily\(client, operatingCompanyId, r\.driver_id/.test(svc))
  fail("the roster must derive each driver from getHosDaily (the SAME cycle math the timeline uses)");

// Tabbed Compliance page — additive (Overview keeps prior sections), HOS Tracker tab wired to the shell.
const page = read("apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx");
if (!/COMPLIANCE_TABS/.test(page) || !/"hos_tracker"/.test(page))
  fail("/compliance must be tabbed with an HOS Tracker tab");
if (!/HosTrackerSection/.test(page)) fail("the HOS Tracker tab must render HosTrackerSection");
if (!/FleetHosBoardSection/.test(page) || !/ComplianceTable/.test(page))
  fail("ADDITIVE: the Overview tab must still render the prior sections (Live Fleet HOS + Credentials table)");

// Shell: band + KPI row + 8-day day-strip wired to the roster.
const shell = read("apps/frontend/src/pages/compliance/HosTrackerSection.tsx");
if (!/getHosDailyRoster/.test(shell)) fail("HOS Tracker shell must read the canonical roster endpoint");
if (!/buildDayStrip/.test(shell)) fail("HOS Tracker shell must render the 8-day day-strip selector");
if (!/On Duty/.test(shell) || !/Unavailable/.test(shell))
  fail("HOS Tracker shell must render the KPI row (On Duty / Driving / Low / Violation / Unavailable)");

console.log("OK verify-compliance-hos-tracker-shell: tabbed Compliance + HOS Tracker shell on one canonical roster source.");
