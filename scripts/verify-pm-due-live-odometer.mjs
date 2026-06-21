// Guard (#37 PM countdown): the /maint/pm/due current-odometer must come from the LIVE Samsara stats-poll
// ingest (telematics.vehicle_latest_position.odometer_mi, #1289), not only the webhook raw_payload — we POLL,
// not webhook, so the payload odometer is empty and the countdown showed nothing. Lock the live source in.
import { readFileSync } from "node:fs";

const fail = (m) => { console.error(`FAIL verify-pm-due-live-odometer: ${m}`); process.exit(1); };
const src = readFileSync("apps/backend/src/maint/pm.routes.ts", "utf8");

if (!/telematics\.vehicle_latest_position/.test(src))
  fail("pm/due query must LEFT JOIN telematics.vehicle_latest_position for the live odometer");
if (!/odometer_mi[^\n]*AS live_odometer_mi/.test(src))
  fail("pm/due query must SELECT vehicle_latest_position.odometer_mi AS live_odometer_mi");
if (!/row\.live_odometer_mi/.test(src))
  fail("mapDueRow must prefer row.live_odometer_mi as the current odometer");
// The webhook payload must remain a fallback (units still on the webhook path), not be dropped.
if (!/extractSamsaraOdometerMi\(row\.samsara_raw_payload\)/.test(src))
  fail("mapDueRow must keep extractSamsaraOdometerMi(raw_payload) as the fallback");

console.log("OK verify-pm-due-live-odometer: pm/due reads live vehicle_latest_position.odometer_mi (webhook fallback kept).");
