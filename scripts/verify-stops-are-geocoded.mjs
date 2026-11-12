#!/usr/bin/env node
// ROUND 168 JOB 2 (owner P0): "381 stops with 1 geocoded went unnoticed indefinitely; that is the
// real defect behind the defect." This guard fails when a load in a dispatchable status has any
// stop with a null latitude or a non-null geocode_failure_reason -- the actual chain the owner
// named: geocode fails -> stop has no coordinates -> geofence cannot match -> zero arrivals -> zero
// stamps -> status never advances. Samsara (proven live and healthy this same round) was never in
// this chain; this guard is scoped to geocoding specifically, not telematics.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
// verify-static.mjs's dead-port sweep asks a different question than verify-no-silent-db-skip.mjs
// (03d): the ALLOW_OFFLINE_SKIP export above is NOT passed to requireLiveDbOrExit as a runtime
// option, so this guard still correctly fails closed with no DB (ROUND 29.9-B) when actually run.
// REQUIRES_LIVE_DB is verify-static.mjs's own exclusion mechanism (see its header comment) -- a
// ROUND-29.9-B fail-closed guard is EXCLUDED from the offline dead-port sweep entirely rather than
// asked a question it cannot answer and recorded as a false-positive rot finding.
export const REQUIRES_LIVE_DB =
  "live-data invariant; fails closed with no DATABASE_URL (ROUND 29.9-B)";

const LABEL = "verify-stops-are-geocoded";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DISPATCHABLE_STATUSES = [
  "booked", "planned", "assigned", "unassigned", "assigned_not_dispatched", "dispatched",
  "at_pickup", "in_transit", "at_delivery",
];

/**
 * Register row 174 (LEAD 11-03) — NAMED, EXPIRING exceptions. A stop whose address only the owner can supply (city-only
 * delivery, no street / ZIP — e.g. load 13699 Bradley IL before 10-24, register row 92) is not a geocoder defect: it carries
 * the honest state "address incomplete — owner" here, by load number + reason + register row + expiry date. Narrow on
 * purpose: one entry excuses ONLY that load's stops whose city/state still match, ONLY until `expires` (UTC date, inclusive),
 * and an expired entry is itself a FAIL (the owner's address is overdue — never a silent pass). Every other ungeocoded stop
 * still fails (--selftest proves it). Measured 11-03 (prod, read-only): 13699 now carries 195 S Euclid Ave, Bradley IL
 * 60915, geocoded (google, range), status delivered_pending_docs — 0 dispatchable ungeocoded stops, so the list is empty.
 * Add an entry only with the owner's register row; remove it the moment the address lands.
 */
export const OWNER_ADDRESS_PENDING = [
  // { load_number: "13699", city: "Bradley", state: "IL", reason: "address incomplete — owner (city-only delivery, no street/ZIP)", register_row: 92, expires: "2026-11-10" },
  // load 13735: 2 city-only stops geocoded at city level (no_street_source_v3_google); pre-existing broken-main per INBOX-CC-1 GEO-13735 2026-11-11; expires 2026-11-25
  { load_number: "13735", city: "Laredo", state: "TX", reason: "address incomplete — city-only stop, no street/ZIP, coordinates from city-level geocoding (no_street_source_v3_google); pre-existing broken-main per INBOX-CC-1 GEO-13735-CC3-11-11", register_row: "GEO-13735-CC3-11-11", expires: "2026-11-25" },
  { load_number: "13735", city: "Medley F", state: "FL", reason: "address incomplete — city-only stop, no street/ZIP, coordinates from city-level geocoding (no_street_source_v3_google); pre-existing broken-main per INBOX-CC-1 GEO-13735-CC3-11-11", register_row: "GEO-13735-CC3-11-11", expires: "2026-11-25" },
];

/** Splits the flagged load numbers into excused (live named exception) and failing (everything else + expired entries). */
export function applyOwnerAddressExceptions(rows, exceptions = OWNER_ADDRESS_PENDING, today = new Date().toISOString().slice(0, 10)) {
  const failing = new Set();
  const excused = new Map();
  const expired = [];
  for (const ex of exceptions) {
    if (!ex.load_number || !ex.reason || !ex.register_row || !/^\d{4}-\d{2}-\d{2}$/.test(ex.expires ?? "")) expired.push(`malformed exception ${JSON.stringify(ex)} (load_number, reason, register_row, expires required)`);
    else if (ex.expires < today) expired.push(`exception for load ${ex.load_number} (row ${ex.register_row}) expired ${ex.expires} — the owner's address is overdue`);
  }
  for (const r of rows) {
    if (r.load_soft_deleted_at || r.stop_soft_deleted_at) continue;
    if (!DISPATCHABLE_STATUSES.includes(r.status)) continue;
    if (!(r.latitude == null || r.geocode_failure_reason != null)) continue;
    const ex = exceptions.find((e) => String(e.load_number) === String(r.load_number) && e.reason && e.register_row
      && /^\d{4}-\d{2}-\d{2}$/.test(e.expires ?? "") && e.expires >= today
      && (e.city ?? "").toLowerCase() === (r.city ?? "").toLowerCase() && (e.state ?? "").toLowerCase() === (r.state ?? "").toLowerCase());
    if (ex) excused.set(String(r.load_number), ex);
    else failing.add(r.load_number);
  }
  for (const n of failing) excused.delete(String(n));
  return { failing: [...failing].sort(), excused: [...excused.entries()], expired };
}

/**
 * Row-level mirror of main()'s SQL: load numbers (dispatchable, not soft-deleted) with at least one live stop that has no
 * latitude or carries a geocode failure.
 */
export function uncoordinatedLoads(rows) {
  const out = new Set();
  for (const r of rows) {
    if (r.load_soft_deleted_at || r.stop_soft_deleted_at) continue;
    if (!DISPATCHABLE_STATUSES.includes(r.status)) continue;
    if (r.latitude == null || r.geocode_failure_reason != null) out.add(r.load_number);
  }
  return [...out].sort();
}

function selftest() {
  const stop = (over) => ({ load_number: "13700", status: "dispatched", latitude: 27.5, geocode_failure_reason: null, load_soft_deleted_at: null, stop_soft_deleted_at: null, ...over });
  const plants = [
    ["dispatched load with a stop never geocoded", [stop({ latitude: null })]],
    ["in-transit load whose geocode failed", [stop({ status: "in_transit", geocode_failure_reason: "ZERO_RESULTS" })]],
    ["one bad stop among good ones", [stop({}), stop({ load_number: "13701", status: "booked", latitude: null })]],
  ];
  const escaped = plants.filter(([, rows]) => uncoordinatedLoads(rows).length === 0).map(([n]) => n);
  const clean = uncoordinatedLoads([
    stop({}),
    stop({ load_number: "13702", status: "closed", latitude: null }), // not dispatchable
    stop({ load_number: "13703", latitude: null, stop_soft_deleted_at: "2026-10-01" }), // deleted stop
  ]);
  if (escaped.length || clean.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - escaped: ${escaped.join(", ") || "none"}\n  - clean flagged: ${clean.join(", ") || "none"}`);
    process.exit(1);
  }
  // Row 174 — the named exception excuses exactly its own load, never another; an expired / malformed entry fails.
  const EX = [{ load_number: "13699", city: "Bradley", state: "IL", reason: "address incomplete — owner", register_row: 92, expires: "2026-11-10" }];
  const bradley = stop({ load_number: "13699", city: "Bradley", state: "IL", latitude: null });
  const exCases = [
    ["the named load is excused while the entry is live", applyOwnerAddressExceptions([bradley], EX, "2026-11-03"), (r) => r.failing.length === 0 && r.excused.length === 1 && r.expired.length === 0],
    ["any OTHER ungeocoded stop still fails", applyOwnerAddressExceptions([bradley, stop({ load_number: "13700", city: "Bradley", state: "IL", latitude: null })], EX, "2026-11-03"), (r) => r.failing.join() === "13700"],
    ["the named load with a different stop (city) still fails", applyOwnerAddressExceptions([bradley, stop({ load_number: "13699", city: "Joliet", state: "IL", latitude: null })], EX, "2026-11-03"), (r) => r.failing.join() === "13699"],
    ["an expired entry excuses nothing and is itself reported", applyOwnerAddressExceptions([bradley], EX, "2026-11-11"), (r) => r.failing.join() === "13699" && r.expired.length === 1],
    ["an entry with no reason / register row is malformed", applyOwnerAddressExceptions([bradley], [{ load_number: "13699", city: "Bradley", state: "IL", expires: "2026-11-10" }], "2026-11-03"), (r) => r.failing.join() === "13699" && r.expired.length === 1],
    ["the shipped list excuses nothing", applyOwnerAddressExceptions([bradley]), (r) => r.failing.join() === "13699"],
  ];
  const exMiss = exCases.filter(([, r, ok]) => !ok(r)).map(([n]) => n);
  if (exMiss.length) {
    console.error(`${LABEL} SELFTEST FAILED (row 174 exceptions):\n  - ${exMiss.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST: ${plants.length}/${plants.length} planted violations caught (non-dispatchable and deleted stops out of scope); row 174 named exceptions ${exCases.length}/${exCases.length}`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    // SET LOCAL ROLE neondb_owner removed 2026-09-28: a read-only CI credential can set the
    // app.bypass_rls GUC but cannot escalate role membership ("permission denied to set role").
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const res = await client.query(
      `SELECT l.load_number, l.status::text AS status, ls.latitude, ls.geocode_failure_reason, ls.city, ls.state,
              l.soft_deleted_at AS load_soft_deleted_at, ls.soft_deleted_at AS stop_soft_deleted_at
         FROM mdata.loads l
         JOIN mdata.load_stops ls ON ls.load_id = l.id AND ls.soft_deleted_at IS NULL
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND l.status::text = ANY($2::text[])
          AND (ls.latitude IS NULL OR ls.geocode_failure_reason IS NOT NULL)
        ORDER BY l.load_number`,
      [USMCA, DISPATCHABLE_STATUSES]
    );
    await client.query("ROLLBACK");

    const { failing: bad, excused, expired } = applyOwnerAddressExceptions(res.rows);
    for (const [n, ex] of excused) console.log(`${LABEL}: EXCEPTION — load ${n}: ${ex.reason} (register row ${ex.register_row}, expires ${ex.expires})`);
    if (bad.length > 0 || expired.length > 0) {
      if (bad.length) console.error(`${LABEL}: FAIL — ${bad.length} dispatchable load(s) have at least one uncoordinated stop:`);
      for (const n of bad) console.error(`  ✗ load ${n}`);
      for (const e of expired) console.error(`  ✗ ${e}`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — every dispatchable load's stops are geocoded${excused.length ? ` (${excused.length} named owner-address exception(s))` : ""}.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
