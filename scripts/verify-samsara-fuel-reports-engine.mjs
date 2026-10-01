#!/usr/bin/env node
/**
 * ROUND 313 E-23: Samsara fuel/energy is kept per UTC day (Samsara's own bucket -- a window spanning two days
 * doubles the numbers), linked to unit / driver, with purchased gallons NULL until fuel imports reach the day.
 */
import { readFileSync } from "node:fs";
const svc = readFileSync("apps/backend/src/telematics/samsara-fuel-reports.service.ts", "utf8");
const cron = readFileSync("apps/backend/src/cron/samsara-fuel-reports.cron.ts", "utf8");
const link = readFileSync("apps/backend/src/telematics/telematics-linkage.service.ts", "utf8");
const drv = readFileSync("apps/backend/src/driver-profile/driver-profile-tabs.service.ts", "utf8");
const idx = readFileSync("apps/backend/src/index.ts", "utf8");
const checks = [
  [/startIso: `\$\{day\}T00:00:00Z`, endIso: `\$\{day\}T23:59:59Z`/.test(svc), "one report_date = one UTC day, asked strictly inside it"],
  [/imported \? r2\(p\?\.gal \?\? 0\) : null/.test(svc), "purchased gallons NULL until fuel imports reach the day"],
  [/loadUnitIdBySamsaraVehicleId/.test(svc) && /loadDriverIdBySamsaraId/.test(svc), "vehicle -> unit, driver -> driver via the canonical maps"],
  [/fuelPurchaseIneligibleReason/.test(svc), "purchases pass the same eligibility gate as the T-50 signal"],
  [/initializeSamsaraFuelReportsCron\(app\)/.test(idx) && /cron\.schedule\("20 5 \* \* \*"/.test(cron), "daily cron registered"],
  [/samsara_fuel_reports/.test(link) && /samsara_fuel_reports/.test(drv), "unit + driver reverse links read the reports"],
];
const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) { console.error("verify-samsara-fuel-reports-engine: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-samsara-fuel-reports-engine: OK (${checks.length})`);
