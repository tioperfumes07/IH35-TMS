// Guard (#37 PM countdown): the /maint/pm/due current-odometer must come from the LIVE Samsara stats-poll
// ingest (telematics.vehicle_latest_position.odometer_mi, #1289), not only the webhook raw_payload — we POLL,
// not webhook, so the payload odometer is empty and the countdown showed nothing. Lock the live source in.
import { readFileSync } from "node:fs";

const fail = (m) => { console.error(`FAIL verify-pm-due-live-odometer: ${m}`); process.exit(1); };
const src = readFileSync("apps/backend/src/maint/pm.routes.ts", "utf8");

// E-15 (ORDERS 2026-10-01): every PM consumer reads the ONE shared loader (maintenance/pm-current-odometer.ts):
// telematics.unit_stop_events -> telematics.odometer_readings -> ABSENT (null + reason, never a confident zero).
// That loader replaced the per-route vehicle_latest_position JOIN + webhook raw_payload fallback.
const loaderSrc = readFileSync("apps/backend/src/maintenance/pm-current-odometer.ts", "utf8");
if (!/telematics\.unit_stop_events/.test(loaderSrc) || !/telematics\.odometer_readings/.test(loaderSrc))
  fail("shared pm odometer loader must read telematics.unit_stop_events then telematics.odometer_readings (live sources)");
if (!/import \{[^}]*\bloadPmOdometers\b[^}]*\} from "\.\.\/maintenance\/pm-current-odometer\.js"/.test(src))
  fail("pm/due route must import loadPmOdometers from the shared maintenance/pm-current-odometer loader");
if (!/await loadPmOdometers\(client,/.test(src))
  fail("pm/due route must call loadPmOdometers(client, ...) for the live current odometer");
if (!/function mapDueRow\(row: PmScheduleRow, odo: PmOdometer \| null/.test(src) || !/odo \? Math\.round\(odo\.odometer\) : null/.test(src))
  fail("mapDueRow must take the loader's odometer and stay null (never a confident zero) when absent");

// The PM AUTO-ENGINE (the other PM odometer consumer — maintenance.pm_schedules) must ALSO read the live
// odometer from the same loader; otherwise it skips every unit as "no odometer" and never evaluates schedules / creates alerts.
const engine = readFileSync("apps/backend/src/maintenance/pm-auto-engine.service.ts", "utf8");
if (!/from "\.\/pm-current-odometer\.js"/.test(engine) || !/await loadPmOdometers\(client,/.test(engine))
  fail("pm-auto-engine must read the live odometer via the shared loadPmOdometers loader");

console.log("OK verify-pm-due-live-odometer: pm/due + pm-auto-engine read the live odometer via the shared loadPmOdometers loader (stop events -> odometer_readings -> absent).");
