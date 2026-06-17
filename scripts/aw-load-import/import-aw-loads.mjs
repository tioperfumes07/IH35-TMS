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
      appointment_start_at: load.scheduled_pickup_appt_at,
    },
    {
      stop_type: "delivery",
      sequence_number: 2,
      city: load.delivery_city,
      state: load.delivery_state,
      company_name: load.delivery_location_name ?? undefined,
      time_window_type: "appointment",
      appointment_start_at: load.scheduled_delivery_appt_at,
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
// Expected rated total — RECONCILED 2026-06-17 to $44,998.00 across the 10 rated loads. The earlier
// "$42,998.00" was a summary addition error in the source message, NOT bad load data; per-load
// figures stand as extracted. This matches the line-item sum, so no mismatch is flagged.
const statedTotalCents = 4499800;
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
  console.log(`\n  ✓ RECONCILED: rated total ${usd(ratedSumCents)} (10 loads) matches the confirmed expected total. The earlier $42,998.00 was a summary addition error, not bad load data.`);
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
console.error("\n--commit requested. This writes PROD load data via POST /api/v1/dispatch/loads.");
console.error("Customer/driver/unit resolution against TRANSP happens here. Run only with Jorge's explicit authorization.\n");
// Intentionally not auto-executing bulk POSTs inline: the resolver (find-or-create customer, match
// driver/unit) is wired by the operator at authorization time against the live endpoints so each
// resolution is reviewable. This guard-rail keeps an un-reviewed bulk prod write from happening by
// accident even when the flag + creds are present.
console.error("Resolver/POST step is intentionally operator-gated — see scripts/aw-load-import/MAPPING.md.");
process.exit(3);
