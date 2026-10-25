/**
 * LEAD 10-24 — load 13699 corrected to the owner's AlwaysTrack Edit Load screen (owner 10-24 1:25 PM CT screenshot):
 *   customer  EGRO TRANSPORT LLC (was "Value Logistics Inc DBA A1 Value" — the 10-21 443.216 booking took the pickup
 *             facility "Value Truck" for the customer), W/O L28591
 *   charges   $3,100.00 (was $3,200.00)
 *   delivery  COPAMEX, 195 S Euclid Ave, Bradley, IL 60915 (was city only → city-center geocode, verify-stops-are-geocoded RED)
 * Customer + charge go through updateDispatchLoad (the Edit Load engine: locks, propagation, audit). The delivery stop gets
 * its street + postal code and its city-center coordinates cleared, so the production geofence-sync cron re-geocodes it
 * through geocodeStopsWithClient on its next tick (resweepUngeocodedActiveStops) — the same path as every stop.
 * No invoice exists for 13699 (measured). Dry run by default (ROLLBACK); --apply commits.
 */
import pg from "pg";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { updateDispatchLoad } from "../../apps/backend/src/dispatch/update-load.service.js";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD = "af6e4973-cfc8-40eb-9a96-29f190e4d144";
const DELIVERY_STOP = "83a71dec-a038-4acd-b65a-cebd69fecc97";
const EGRO = "146067cf-67fb-4b96-b076-950168c5d563";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
// AUTH-468 (owner 10-24 1:25 PM CT, AlwaysTrack 13699 screenshot: "get all those fixed now"). --apply refuses without it.
const REQUIRED_AUTH_ID = "AUTH-468";
if (APPLY) {
  const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  try { execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" }); } catch { process.exit(1); }
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const snap = async (tag: string) => {
  const l = (await c.query(`SELECT l.load_number, cu.customer_name, l.rate_total_cents, l.customer_wo_number FROM mdata.loads l JOIN mdata.customers cu ON cu.id=l.customer_id WHERE l.id=$1`, [LOAD])).rows[0];
  const ch = (await c.query(`SELECT charge_code, amount_cents FROM dispatch.load_charge_lines WHERE load_id=$1 ORDER BY created_at`, [LOAD])).rows;
  const s = (await c.query(`SELECT address_line1, city, state, postal_code, latitude, longitude, geocode_precision, geocode_failure_reason FROM mdata.load_stops WHERE id=$1`, [DELIVERY_STOP])).rows[0];
  console.log(tag, JSON.stringify({ load: l, charges: ch, delivery: s }));
};
try {
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query("SELECT set_config('app.operating_company_id',$1,true)", [CO]);
  await snap("BEFORE");
  const r = await updateDispatchLoad(c as never, {
    loadId: LOAD, operatingCompanyId: CO, requestingUserUuid: OWNER, requestingUserRole: "Owner",
    override_reason: "Owner 10-24 1:25 PM CT: correct 13699 to the AlwaysTrack load (customer EGRO TRANSPORT LLC, $3,100.00)",
    fields: { customer_id: EGRO, customer_wo_number: "L28591" } as never,
    charges: [{ code: "linehaul", amount_cents: 310000 }],
  } as never);
  console.log("ENGINE", JSON.stringify(r).slice(0, 300));
  const u = await c.query(
    `UPDATE mdata.load_stops SET address_line1='195 S Euclid Ave', postal_code='60915', latitude=NULL, longitude=NULL,
            geocode_precision=NULL, geocode_failure_reason=NULL, geocode_source=NULL, geocode_confidence=NULL, updated_at=now()
      WHERE id=$1 AND load_id=$2 AND operating_company_id=$3 AND address_line1 IS NULL RETURNING id`, [DELIVERY_STOP, LOAD, CO]);
  if (u.rowCount !== 1) throw new Error(`stop update touched ${u.rowCount} rows (expected 1)`);
  await snap("AFTER");
  await c.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(APPLY ? "COMMITTED" : "DRY RUN — rolled back");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error("FAIL", e);
  process.exitCode = 1;
} finally {
  await c.end();
}
