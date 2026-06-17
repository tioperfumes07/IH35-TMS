#!/usr/bin/env node
// AW → IH35-TMS load import (Phase 7). Tier-1: writes prod load data when committed.
//
// SAFETY MODEL (locked):
//   * DEFAULT = DRY RUN. Prints exactly what WOULD be created and writes NOTHING. No DB, no API.
//   * Writing requires the explicit flag `--commit` AND env IMPORT_BASE_URL + IMPORT_SESSION_TOKEN.
//     Without all three it refuses. Jorge authorizes + runs the commit; this agent never does
//     (§1.3 backend write, §1.5 prod access gated, §1.6 importing data).
//   * Mirrors the EXISTING create path — POST /api/v1/dispatch/loads -> bookLoad(...). It does NOT
//     open a parallel INSERT into mdata.loads. Rate maps to a single `linehaul` charge (the same
//     shape book-load-accessorial uses); bookLoad derives rate_total_cents from charges.
//
// Usage:
//   node scripts/aw-load-import/import-aw-loads.mjs                 # dry run (counts + per-load plan)
//   IMPORT_BASE_URL=... IMPORT_SESSION_TOKEN=... node ... --commit  # writes (Jorge-authorized only)
//   ... --include-pending   # also attempt the 77225 pending load (held out by default: blank AW id)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(readFileSync(join(here, "aw-open-loads-2026-06-17.json"), "utf8"));

const args = new Set(process.argv.slice(2));
const COMMIT = args.has("--commit");
const INCLUDE_PENDING = args.has("--include-pending");
const TRANSP = dataset.operating_company_id;

// AW appt times are bare local Laredo timestamps ("2026-06-12T09:00:00", no offset). The book-load
// schema requires an offset-bearing ISO datetime. Laredo is US Central (CDT = -05:00 in summer). Append
// the offset if missing; pass through anything already offset/Z-suffixed. (Forward-compatible: if AW ever
// emits offsets, this is a no-op.)
function toOffsetIso(dt) {
  if (!dt || typeof dt !== "string") return undefined;
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(dt)) return dt;
  return `${dt}-05:00`;
}

// AW load -> the EXACT body POST /api/v1/dispatch/loads expects (DispatchBookLoadPayload).
// customer_id / assigned_unit_id / assigned_primary_driver_id are UUIDs resolved at COMMIT time
// against TRANSP (find-or-create customer by broker name; match driver/unit by name/number). In a
// dry run we cannot read prod (§1.5), so those resolve to null and are reported as "[resolve@commit]".
function toBookLoadPayload(load) {
  const stops = [
    {
      stop_type: "pickup",
      sequence_number: 1,
      city: load.pickup_city,
      state: load.pickup_state,
      company_name: load.pickup_location_name ?? undefined,
      time_window_type: "appointment",
      appointment_start_at: toOffsetIso(load.scheduled_pickup_appt_at),
    },
    {
      stop_type: "delivery",
      sequence_number: 2,
      city: load.delivery_city,
      state: load.delivery_state,
      company_name: load.delivery_location_name ?? undefined,
      time_window_type: "appointment",
      appointment_start_at: toOffsetIso(load.scheduled_delivery_appt_at),
    },
  ];
  return {
    operating_company_id: TRANSP,
    customer_id: null, // [resolve@commit] find-or-create customer by broker_customer_name (TRANSP)
    customer_wo_number: load.wo_number ?? undefined,
    commodity: undefined,
    hazmat: false, // constitution: NO hazmat fields anywhere
    status: load.status === "pending" ? "draft" : "dispatched",
    save_mode: "book_dispatch",
    trailer_type: /flatbed/i.test(load.trailer_type) ? "flatbed" : "refrigerated_van",
    assigned_unit_id: null, // [resolve@commit] match mdata.units by truck_unit (TRANSP-leased)
    assigned_primary_driver_id: null, // [resolve@commit] match mdata.drivers by primary_driver_name
    charges: [{ code: "linehaul", amount_cents: load.rate_cents }],
    stops,
    _aw: {
      aw_load_number: load.aw_load_number,
      wo_number: load.wo_number,
      broker_customer_name: load.broker_customer_name,
      truck_unit: load.truck_unit,
      trailer_aw_ref: load.trailer_aw_ref,
      primary_driver_name: load.primary_driver_name,
      team_driver_name: load.team_driver_name,
      flags: load.flags,
    },
  };
}

// ---- partition + counts (computed purely from the dataset — no prod read) ----
const all = dataset.loads;
const heldOut = all.filter((l) => !l.aw_load_number && !INCLUDE_PENDING);
const toImport = all.filter((l) => l.aw_load_number || INCLUDE_PENDING);

const distinct = (arr) => Array.from(new Set(arr.filter(Boolean)));
const customers = distinct(all.map((l) => l.broker_customer_name));
const trucks = distinct(all.map((l) => l.truck_unit));
const trailers = distinct(all.map((l) => l.trailer_aw_ref));
const drivers = distinct([...all.map((l) => l.primary_driver_name), ...all.map((l) => l.team_driver_name)]);
const ratedLoads = all.filter((l) => l.rate_cents > 0);
const ratedSumCents = ratedLoads.reduce((s, l) => s + l.rate_cents, 0);
// Expected rated total — RECONCILED 2026-06-17 to $48,998.00 across all 11 rated loads (Jorge-confirmed).
// = the prior $44,998.00 (10 loads) + $4,000.00 for load 13378 (rate was blank in the AW source, now keyed)
// + load 13380 (WO 77225, aw_load_number was blank, now keyed at its $6,300.00 — already counted once
// 13380 is keyed). Earlier "$42,998.00" was a summary addition error, not bad load data.
const statedTotalCents = 4899800;
const zeroRate = all.filter((l) => l.rate_cents === 0);
const usd = (c) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

console.log(`\nAW → IH35-TMS load import  ·  ${COMMIT ? "COMMIT" : "DRY RUN (writes nothing)"}`);
console.log(`Entity: TRANSP ${TRANSP}`);
console.log(`Source captured: ${dataset.captured_at}\n`);
console.log("COUNTS (from dataset, not prod):");
console.log(`  loads total .................. ${all.length}  (importing ${toImport.length}, held out ${heldOut.length})`);
console.log(`  distinct customers (brokers) . ${customers.length}  — new-vs-existing resolved @commit (prod read gated)`);
console.log(`  distinct drivers ............. ${drivers.length}  (incl. ${all.filter((l) => l.team_driver_name).length} team)`);
console.log(`  distinct trucks .............. ${trucks.length}`);
console.log(`  distinct trailers ............ ${trailers.length}`);
console.log(`  stops (1 pickup + 1 delivery)  ${toImport.length * 2}`);
console.log(`  rated loads .................. ${ratedLoads.length}   line-item sum ${usd(ratedSumCents)}`);
console.log(`  zero-rate loads (flagged) .... ${zeroRate.length}  [${zeroRate.map((l) => l.aw_load_number).join(", ")}]`);

if (ratedSumCents === statedTotalCents) {
  console.log(`\n  ✓ RECONCILED: rated total ${usd(ratedSumCents)} (11 loads) matches the Jorge-confirmed expected total ($48,998.00 = prior $44,998.00 + $4,000.00 for 13378's filled rate).`);
} else {
  console.log(`\n  ⚠ RECONCILE MISMATCH: line-item rated sum ${usd(ratedSumCents)} ≠ expected ${usd(statedTotalCents)} (Δ ${usd(ratedSumCents - statedTotalCents)}). Surfaced for Jorge — NOT auto-resolved.`);
}
if (heldOut.length) {
  console.log(`\n  ⏸ HELD OUT of commit (blank AW load #): ${heldOut.map((l) => `WO ${l.wo_number} (${l.broker_customer_name})`).join("; ")}. Pass --include-pending only after the AW load id is confirmed.`);
}

console.log("\nPER-LOAD PLAN (mapped to POST /api/v1/dispatch/loads → bookLoad):");
for (const l of toImport) {
  const p = toBookLoadPayload(l);
  console.log(
    `  ${l.aw_load_number ?? `WO ${l.wo_number}`} · ${l.broker_customer_name} · ${l.truck_unit}/${l.primary_driver_name} · ` +
      `${l.pickup_city},${l.pickup_state} → ${l.delivery_city},${l.delivery_state} · ${usd(l.rate_cents)} · ${p.status}` +
      `${l.flags.length ? `  [${l.flags.join(",")}]` : ""}`
  );
}

if (!COMMIT) {
  console.log(`\nDRY RUN complete. Nothing written. To commit (Jorge-authorized): set IMPORT_BASE_URL + IMPORT_SESSION_TOKEN and re-run with --commit.\n`);
  process.exit(0);
}

// ---- COMMIT path (Jorge-authorized only) ----
const baseUrl = process.env.IMPORT_BASE_URL;
const token = process.env.IMPORT_SESSION_TOKEN;
if (!baseUrl || !token) {
  console.error("\nREFUSING --commit: IMPORT_BASE_URL and IMPORT_SESSION_TOKEN must both be set. No write performed.\n");
  process.exit(2);
}
console.error("\n--commit requested. Writing PROD load data via POST /api/v1/dispatch/loads (TRANSP only).");
console.error(`Loads to write: ${toImport.length}. STOP-ON-ERROR: the first failure aborts the rest.\n`);

// Authed JSON fetch over the Lucia session cookie. The token is NEVER logged (only used in the header).
const apiBase = baseUrl.replace(/\/$/, "");
async function api(method, path, body) {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `ih35_session=${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { json = raw; }
  if (!res.ok) {
    const detail = typeof json === "string" ? json : JSON.stringify(json);
    throw new Error(`${method} ${path} → HTTP ${res.status} ${detail}`);
  }
  return json;
}

const norm = (s) => String(s ?? "").trim().toLowerCase();

// Find-or-create the broker as a TRANSP customer (per-entity; never commingle TRK/USMCA).
async function resolveCustomerId(brokerName) {
  const q = new URLSearchParams({ operating_company_id: TRANSP, search: brokerName, active_only: "false" });
  const found = await api("GET", `/api/v1/mdata/customers?${q.toString()}`);
  const list = found?.customers ?? [];
  const exact = list.find((c) => norm(c.name) === norm(brokerName));
  if (exact) return { id: exact.id, created: false };
  const created = await api("POST", "/api/v1/mdata/customers", { name: brokerName, operating_company_id: TRANSP });
  const id = created?.id ?? created?.customer?.id;
  if (!id) throw new Error(`customer create returned no id for "${brokerName}"`);
  return { id, created: true };
}
// Match an existing TRANSP unit by number (never create equipment from an import).
async function resolveUnitId(truckNumber) {
  if (!truckNumber) return undefined;
  const q = new URLSearchParams({ operating_company_id: TRANSP, search: truckNumber });
  const found = await api("GET", `/api/v1/mdata/units?${q.toString()}`);
  const m = (found?.units ?? []).find((u) => norm(u.unit_number) === norm(truckNumber));
  if (!m) throw new Error(`unit not found for truck "${truckNumber}" — create the unit first, then re-run`);
  return m.id;
}
// Match an existing TRANSP driver by full name (never create drivers from an import).
async function resolveDriverId(driverName) {
  if (!driverName) return undefined;
  const q = new URLSearchParams({ operating_company_id: TRANSP, search: driverName });
  const found = await api("GET", `/api/v1/mdata/drivers?${q.toString()}`);
  const list = found?.drivers ?? [];
  const m = list.find((d) => norm(`${d.first_name} ${d.last_name}`) === norm(driverName));
  if (!m) throw new Error(`driver not found for "${driverName}" — create the driver first, then re-run`);
  return m.id;
}

let written = 0;
for (const l of toImport) {
  const label = l.aw_load_number ?? `WO ${l.wo_number}`;
  try {
    const { id: customerId, created } = await resolveCustomerId(l.broker_customer_name);
    const payload = toBookLoadPayload(l);
    delete payload._aw; // provenance block — not part of the create schema
    payload.customer_id = customerId;
    payload.assigned_unit_id = await resolveUnitId(l.truck_unit);
    payload.assigned_primary_driver_id = await resolveDriverId(l.primary_driver_name);
    if (l.team_driver_name) payload.assigned_secondary_driver_id = await resolveDriverId(l.team_driver_name);
    const load = await api("POST", "/api/v1/dispatch/loads", payload);
    const loadId = load?.id ?? load?.load?.id ?? "(created)";
    written += 1;
    console.log(`  ✓ ${label} → load ${loadId} · customer ${created ? "CREATED" : "matched"} · ${l.truck_unit}/${l.primary_driver_name} · ${usd(l.rate_cents)}`);
  } catch (e) {
    console.error(`\n  ✗ ${label} FAILED: ${e.message}`);
    console.error(`  STOP-ON-ERROR — ${written}/${toImport.length} loads written before this. Fix the cause and re-run; created customers/loads from this run already exist, so re-running re-creates them (no idempotency key on loads) — prefer trimming the dataset to the remaining loads.`);
    process.exit(4);
  }
}
console.log(`\n✓ COMMIT complete: ${written}/${toImport.length} loads written to TRANSP (${TRANSP}). Rated total ${usd(ratedSumCents)}.`);
process.exit(0);
