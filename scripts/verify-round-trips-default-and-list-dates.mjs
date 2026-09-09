#!/usr/bin/env node
/**
 * RT-FIX backend half + default view (lead, 2026-09-06). Companion to verify-round-trips-bar-dates (step 8062),
 * which pins roundTripsLegs.ts. This guard pins the two things that guard cannot see:
 *   1. /api/v1/dispatch/loads (loads.routes.ts) RETURNS pickup_scheduled_at and delivery_scheduled_at, each
 *      COALESCE(appointment_start_at, scheduled_arrival_at) from the sp/sd stop laterals, and both laterals select
 *      appointment_start_at. Without this the timeline reads fields the list never sends → every bar "no dates".
 *   2. RoundTrips.tsx readView() defaults to the LOAD BOARD (GO-RT-01 approved design); BRD-10's
 *      `deepLink ? "timeline" : "board"` flip is gone. The DispatchLoad type carries delivery_scheduled_at.
 * --selftest plants each regression and requires the guard to fail.
 */
import fs from "node:fs";
const ROUTES = "apps/backend/src/dispatch/loads.routes.ts";
const RT = "apps/frontend/src/pages/dispatch/RoundTrips.tsx";
const TYPES = "apps/frontend/src/api/dispatch.ts";
const DISPATCH = "apps/frontend/src/pages/Dispatch.tsx";
const read = (p) => fs.readFileSync(p, "utf8");
function audit({ routes, rt, types, dispatch }) {
  const p = [];
  if (!/COALESCE\(sp\.appointment_start_at, sp\.scheduled_arrival_at\) AS pickup_scheduled_at/.test(routes)) p.push("loads list does not return pickup_scheduled_at from the pickup lateral");
  if (!/COALESCE\(sd\.appointment_start_at, sd\.scheduled_arrival_at\) AS delivery_scheduled_at/.test(routes)) p.push("loads list does not return delivery_scheduled_at from the delivery lateral");
  const lat = routes.match(/SELECT city, state, scheduled_arrival_at, appointment_start_at\s+FROM mdata\.load_stops/g) ?? [];
  if (lat.length < 4) p.push(`stop laterals selecting appointment_start_at: ${lat.length} (need 4: sp+sd in both list queries)`);
  if (/return deepLink \? "timeline" : "board"/.test(rt)) p.push("readView still defaults deep links to the timeline (BRD-10 flip)");
  const fn = rt.slice(rt.indexOf("function readView"), rt.indexOf("function readView") + 800);
  if (!/return "board";/.test(fn)) p.push('readView does not default to "board"');
  if (!/delivery_scheduled_at\?: string \| null/.test(types)) p.push("DispatchLoad type lacks delivery_scheduled_at");

  // RT-BOOK-RETURN (owner 2026-09-09): "+ Book return" must carry the needy truck + its driver so the
  // booking prefills them (same as the Awaiting-assignment card's per-truck "+ Book load"), never a
  // blank booking. Pins the whole chain: the prop type, NeedsReturnCard forwarding the context, the
  // render site passing pair.unitId/pair.driverId, and Dispatch.tsx wiring both into the modal prefill.
  if (!/onBookReturn: \(ctx: \{ unitId: string; driverId: string \| null \}\) => void;/.test(rt))
    p.push("RoundTrips onBookReturn prop no longer carries { unitId, driverId } — the return booking can't prefill the truck");
  if (!/onBookReturn\(\{ unitId, driverId \}\)/.test(rt))
    p.push("NeedsReturnCard no longer forwards { unitId, driverId } to onBookReturn");
  if (!/<NeedsReturnCard unitId=\{pair\.unitId\} driverId=\{pair\.driverId\} onBookReturn=\{onBookReturn\} \/>/.test(rt))
    p.push("Round Trips render does not pass pair.unitId/pair.driverId into NeedsReturnCard");
  if (!/onBookReturn=\{\(\{ unitId, driverId \}\) => \{\s*setBookUnitId\(unitId\);\s*setBookDriverId\(driverId\);\s*openBookLoadModal\(\);\s*\}\}/.test(dispatch))
    p.push("Dispatch.tsx onBookReturn does not set both the unit and the driver prefill before opening the booking");
  if (!/prefillDriverId=\{bookDriverId\}/.test(dispatch))
    p.push("Dispatch.tsx does not pass prefillDriverId={bookDriverId} to the Book Load modal");
  return p;
}
const clean = { routes: read(ROUTES), rt: read(RT), types: read(TYPES), dispatch: read(DISPATCH) };
if (process.argv.includes("--selftest")) {
  const plants = [
    ["pickup field removed", { ...clean, routes: clean.routes.replace(/COALESCE\(sp\.appointment_start_at, sp\.scheduled_arrival_at\) AS pickup_scheduled_at,\n/, "") }],
    ["delivery field removed", { ...clean, routes: clean.routes.replace(/COALESCE\(sd\.appointment_start_at, sd\.scheduled_arrival_at\) AS delivery_scheduled_at,\n/, "") }],
    ["lateral loses appointment_start_at", { ...clean, routes: clean.routes.replace("SELECT city, state, scheduled_arrival_at, appointment_start_at", "SELECT city, state, scheduled_arrival_at") }],
    ["BRD-10 flip restored", { ...clean, rt: clean.rt.replace('return "board";', 'return deepLink ? "timeline" : "board";') }],
    ["type loses delivery_scheduled_at", { ...clean, types: clean.types.replace("delivery_scheduled_at?: string | null;", "") }],
    ["book-return prop drops driver context", { ...clean, rt: clean.rt.replaceAll("onBookReturn: (ctx: { unitId: string; driverId: string | null }) => void;", "onBookReturn: () => void;") }],
    ["NeedsReturnCard stops forwarding context", { ...clean, rt: clean.rt.replace("onBookReturn({ unitId, driverId })", "onBookReturn()") }],
    ["Dispatch onBookReturn stops prefilling driver", { ...clean, dispatch: clean.dispatch.replace("              setBookDriverId(driverId);\n", "") }],
    ["Dispatch drops prefillDriverId", { ...clean, dispatch: clean.dispatch.replace("        prefillDriverId={bookDriverId}\n", "") }],
  ];
  let escaped = 0;
  for (const [l, m] of plants) if (audit(m).length === 0) { console.error(`SELFTEST FAIL — not caught: ${l}`); escaped++; }
  const c = audit(clean); if (c.length) { console.error("SELFTEST FAIL — clean rejected:\n  " + c.join("\n  ")); process.exit(1); }
  if (escaped) process.exit(1);
  console.log(`PASS verify-round-trips-default-and-list-dates --selftest: ${plants.length}/${plants.length} planted regressions caught`);
} else {
  const p = audit(clean); if (p.length) { console.error("FAIL verify-round-trips-default-and-list-dates:\n  " + p.join("\n  ")); process.exit(1); }
  console.log("PASS verify-round-trips-default-and-list-dates: list returns pickup/delivery_scheduled_at · readView defaults to board");
}
