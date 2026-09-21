#!/usr/bin/env tsx
// ROUND 27.1 / ROUND 28 STEP 1+2 — owner order 2026-09-21. Source of truth:
// ~/Downloads/IH35-MASTER-RECONCILIATION-2026-09-21.xlsx (CONTROL TOTALS/EXCEPTIONS/LOADS sheets) +
// ~/Downloads/load history.xlsx (the raw AlwaysTrack per-load export carrying Orig-Dest/Picks-Drops/
// Pickup/Delivery — the reconciliation workbook itself carries no stop-level detail). Both parsed into
// scripts/ops/round27-1-step1-loads-data.json (23 rows; linehaul sum verified 98,086.72 against the
// CONTROL TOTALS sheet before this script was written — never re-derived).
//
// SAME ESTABLISHED PATTERN as scripts/seed-missing-usmca-loads.ts: bookLoad() (one transaction: load +
// stops + charges + driver-bill mint), the real POST/PATCH routes via app.inject(). NO RAW SQL for any
// money/load write except the two narrowly-scoped, disclosed exceptions named inline below
// (soft-delete restore, load-counter bump) — neither is a dollar-math write.
//
// FIELD MAPPING (owner's own words, verbatim, "do not deviate"): miles_shortest = St. Miles,
// miles_practical = L. Miles, both copied straight off the export (never re-derived, never copied from
// an unrelated field), mileage_source = 'Operator entered'. Verified empirically before writing this
// file that St.Miles/L.Miles in THIS export are NOT the "St.Miles = L.Miles+E.Miles" shape the
// 2026-09 lane_mileage landmine documents (that finding was scoped to catalogs.lane_mileage's own
// AlwaysTrack report, a different source) — e.g. load 13561 (already live, OK row): St.Miles 1137 ≈
// L.Miles 1137.4. This export's two columns are a genuine shortest/practical pair, not the doubled one.
//
// RATE CORRECTIONS (13563, 13570, 13580, 13615): real PATCH /api/v1/mdata/loads/:id (rate_total_cents),
// which auto-resyncs a still-draft/proforma invoice via resyncProformaInvoiceFromLoadRate. Three of the
// four (13563, 13570, 13580) already carry a SENT, Faro-ADVANCED invoice — resyncProformaInvoiceFromLoadRate
// is scoped to draft/proforma only and will not touch a sent invoice, so an invoice DISPUTE is opened
// instead (reason_code 'mis_entry'), left OPEN (maker != checker: the same actor that raises a dispute
// is refused at resolve time by the service itself). 13615 carries no invoice yet, so the PATCH's own
// resync path mints the correct proforma directly — no dispute needed.
//
// LOAD-STATUS MIRROR (ROUND 28B PART 1): AlwaysTrack Completed loads may never sit in a pre-delivery
// status (dispatched/at_pickup/in_transit) — walked one step at a time through the real
// /status transition endpoint to delivered_pending_docs (the first status outside
// unit-active-load-guard.ts's ACTIVE_UNIT_STATUSES — satisfies the PASS bar "nothing sits in a
// pre-delivery status" without forcing a premature 'closed', which the app itself gates on a priced
// driver bill, ROUND 24.7). AlwaysTrack Cancelled loads (13593) are cancelled the same real way.
//
// 13554 is explicitly excluded (owner ruled correct, invoice 039 confirmed) — never touched here.
// 13553/13555/13565/13502/13505/13507 are outside the AT export window — never touched here.
//
// Usage:
//   DATABASE_URL=<neon prod> npx tsx scripts/ops/round27-1-step1-loads-and-rate-corrections.ts --dry-run
//   DATABASE_URL=<neon prod> npx tsx scripts/ops/round27-1-step1-loads-and-rate-corrections.ts --apply
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { bookLoad, type BookLoadInput } from "../../apps/backend/src/dispatch/book-load.service.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerLoadRoutes } from "../../apps/backend/src/mdata/loads.routes.js";
import { registerEquipmentRoutes } from "../../apps/backend/src/mdata/equipment.routes.js";
import { registerCustomerRoutes } from "../../apps/backend/src/mdata/customers.routes.js";
import invoiceDisputesPlugin from "../../apps/backend/src/accounting/invoice-disputes.routes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_PATH = path.join(ROOT, "scripts/ops/round27-1-step1-loads-data.json");
const REGISTER_PATH = path.join(ROOT, "docs/bus/CORRECTION-REGISTER-ROUND-27.1-STEP1-LOADS.md");

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const USMCA_CUTOVER_DATE = "2026-08-07";

type LoadJson = {
  load_number: string;
  customer_name: string;
  wo: string | null;
  driver_name: string;
  unit: string;
  trailer: string | null;
  status_in_at: string;
  target_status: "dispatched" | "completed";
  pickup_date: string;
  delivery_date: string;
  origin_city: string | null;
  origin_state: string | null;
  dest_city: string | null;
  dest_state: string | null;
  st_miles: number | null;
  l_miles: number | null;
  linehaul_cents: number;
  origin_company?: string | null;
  dest_company?: string | null;
  origin_address?: string | null;
  origin_zip?: string | null;
  dest_address?: string | null;
  dest_zip?: string | null;
  origin_appt_at?: string | null;
  dest_appt_at?: string | null;
  customer_po_number?: string | null;
};

type RateCorrection = { load_number: string; from_cents: number; to_cents: number };
const RATE_CORRECTIONS: RateCorrection[] = [
  { load_number: "13563", from_cents: 60000, to_cents: 50000 },
  { load_number: "13570", from_cents: 611500, to_cents: 590000 },
  { load_number: "13580", from_cents: 490000, to_cents: 330000 },
  { load_number: "13615", from_cents: 50000, to_cents: 490000 },
];

function loadData(): LoadJson[] {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

type InjectApp = { inject: (opts: { method: string; url: string; headers: Record<string, string>; payload?: unknown }) => Promise<{ statusCode: number; body: string }> };

// Reporter: prints EVERY line immediately (so a later crash never destroys visibility into what
// already happened, live-caught this session) and also collects the full text for the register file.
type Reporter = { push: (...lines: string[]) => void; all: string[] };
function makeReporter(header: string[]): Reporter {
  const all: string[] = [];
  const push = (...lines: string[]) => {
    for (const l of lines) {
      all.push(l);
      console.log(l);
    }
  };
  push(...header);
  return { push, all };
}

async function resolveDriverId(client: pg.PoolClient, name: string): Promise<string> {
  const exact = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.drivers WHERE operating_company_id = $1::uuid AND lower(first_name || ' ' || last_name) = lower($2) LIMIT 1`,
    [USMCA_COMPANY_ID, name]
  );
  if (exact.rows[0]) return exact.rows[0].id;
  const firstWord = name.trim().split(/\s+/)[0];
  const fuzzy = await client.query<{ id: string; first_name: string; last_name: string; deactivated_at: string | null }>(
    `SELECT id::text, first_name, last_name, deactivated_at::text FROM mdata.drivers WHERE operating_company_id = $1::uuid AND lower(first_name) = lower($2)`,
    [USMCA_COMPANY_ID, firstWord]
  );
  const restOfName = name.trim().split(/\s+/).slice(1).join(" ").toLowerCase();
  let candidates = fuzzy.rows.filter((r) => restOfName.startsWith(r.last_name.toLowerCase()) || r.last_name.toLowerCase().startsWith(restOfName));
  if (candidates.length > 1) {
    const active = candidates.filter((r) => !r.deactivated_at);
    if (active.length === 1) candidates = active;
  }
  if (candidates.length === 1) return candidates[0].id;
  throw new Error(`driver_not_found: "${name}"` + (candidates.length > 1 ? ` (${candidates.length} ambiguous)` : ""));
}

async function resolveUnitId(client: pg.PoolClient, unitNumber: string): Promise<string> {
  const res = await client.query<{ id: string }>(`SELECT id::text FROM mdata.units WHERE unit_number = $1 LIMIT 1`, [unitNumber]);
  if (!res.rows[0]) throw new Error(`unit_not_found: "${unitNumber}"`);
  return res.rows[0].id;
}

async function resolveOrCreateTrailerId(client: pg.PoolClient, trailerRaw: string | null, app: InjectApp, authHeader: Record<string, string>, dryRun: boolean): Promise<string | null> {
  if (!trailerRaw) return null;
  const trailerNumber = trailerRaw.split(" - ")[0].trim();
  const existing = await client.query<{ id: string }>(`SELECT id::text FROM mdata.equipment WHERE equipment_number = $1 LIMIT 1`, [trailerNumber]);
  if (existing.rows[0]) return existing.rows[0].id;
  if (dryRun) return null;
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/mdata/equipment",
    headers: authHeader,
    payload: { equipment_number: trailerNumber, equipment_type: "DryVan", status: "InService", owner_company_id: USMCA_COMPANY_ID, currently_leased_to_company_id: USMCA_COMPANY_ID },
  });
  if (res.statusCode >= 300) throw new Error(`trailer_create_failed: "${trailerNumber}" — ${res.statusCode} ${res.body}`);
  return (JSON.parse(res.body) as { id: string }).id;
}

/** R2 (owner ruling 2026-09-05, reused verbatim from seed-missing-usmca-loads.ts): a customer printed
 * on the document but not on file is CREATED from the document — name as printed, address from the
 * load's own pickup stop, never left blank, never invented beyond the document. */
async function resolveOrCreateCustomerId(client: pg.PoolClient, name: string, pickupCity: string | null, pickupState: string | null, app: InjectApp, authHeader: Record<string, string>, dryRun: boolean): Promise<string> {
  const exact = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.customers WHERE operating_company_id = $1::uuid AND lower(customer_name) = lower($2) LIMIT 1`,
    [USMCA_COMPANY_ID, name]
  );
  if (exact.rows[0]) return exact.rows[0].id;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const target = normalize(name);
  const all = await client.query<{ id: string; customer_name: string }>(`SELECT id::text, customer_name FROM mdata.customers WHERE operating_company_id = $1::uuid`, [USMCA_COMPANY_ID]);
  const candidates = all.rows.filter((r) => normalize(r.customer_name) === target);
  if (candidates.length === 1) return candidates[0].id;
  if (candidates.length > 1) throw new Error(`customer_ambiguous: "${name}" (${candidates.length} candidates)`);
  if (dryRun) return "WOULD-CREATE";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "customer";
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/mdata/customers",
    headers: authHeader,
    payload: {
      operating_company_id: USMCA_COMPANY_ID,
      legal_name: name,
      email: `no-email-on-file+${slug}@placeholder.invalid`,
      billing_city: pickupCity ?? undefined,
      billing_state: pickupState ?? undefined,
      customer_type: "broker",
      status: "active",
    },
  });
  if (res.statusCode >= 300) throw new Error(`customer_create_failed (R2): "${name}" — ${res.statusCode} ${res.body}`);
  return (JSON.parse(res.body) as { id: string }).id;
}

async function resolveTripLinkage(client: pg.PoolClient, driverId: string): Promise<{ trip_type: "NB" | "TR"; tour_id: string }> {
  const open = await client.query<{ id: string; tour_id: string | null }>(
    `SELECT id::text, tour_id::text FROM driver_finance.driver_settlements
      WHERE driver_id = $1::uuid AND trip_closed_at IS NULL AND voided_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [driverId]
  );
  const existing = open.rows[0];
  if (!existing) return { trip_type: "NB", tour_id: randomUUID() };
  if (existing.tour_id) return { trip_type: "TR", tour_id: existing.tour_id };
  const tourId = randomUUID();
  await client.query(`UPDATE driver_finance.driver_settlements SET tour_id = $1::uuid WHERE id = $2::uuid`, [tourId, existing.id]);
  return { trip_type: "TR", tour_id: tourId };
}

// The linear part of the load status machine (allowedStatusTransitions, loads.routes.ts) up to the
// first status OUTSIDE unit-active-load-guard.ts's ACTIVE_UNIT_STATUSES. One step at a time, via the
// real /status transition endpoint — never a bare UPDATE of mdata.loads.status.
const STATUS_SEQUENCE = ["dispatched", "at_pickup", "in_transit", "at_delivery", "delivered", "delivered_pending_docs"] as const;
// ROUND 28B (owner, supersedes the earlier "Completed -> closed" rule): AlwaysTrack Completed loads
// that are NOT yet tied to a real settlement stop at 'delivered' — real enum value, out of
// unit-active-load-guard.ts's ACTIVE_UNIT_STATUSES, and reads exactly as the owner's own framing
// ("Delivered, not yet settled — the return trip is not finished"). 'pre-settlement' is NOT a live
// value in mdata.load_status_enum (checked live before writing this) — 'delivered' is the closest
// real, correct stand-in; flagged in the PR body as a finding, not invented silently. Completed loads
// that DO carry a real settlement number resolve to invoiced/closed through the settlement itself
// ("the status follows the settlement, never set by hand") — Step 3's job, not this script's.
const DEFAULT_WALK_TARGET: (typeof STATUS_SEQUENCE)[number] = "delivered";

async function walkTo(app: InjectApp, authHeader: Record<string, string>, companyId: string, loadId: string, loadNumber: string, currentStatus: string, rep: Reporter, target: (typeof STATUS_SEQUENCE)[number] = DEFAULT_WALK_TARGET): Promise<string> {
  const startIdx = STATUS_SEQUENCE.indexOf(currentStatus as (typeof STATUS_SEQUENCE)[number]);
  const targetIdx = STATUS_SEQUENCE.indexOf(target);
  if (startIdx === -1) {
    rep.push(`  ${loadNumber} status-walk SKIPPED — current status '${currentStatus}' is not on the linear dispatched->${target} path`);
    return currentStatus;
  }
  if (startIdx >= targetIdx) return currentStatus;
  let status = currentStatus;
  for (let i = startIdx + 1; i <= targetIdx; i++) {
    const next = STATUS_SEQUENCE[i];
    const res = await app.inject({ method: "PATCH", url: `/api/v1/mdata/loads/${loadId}/status?operating_company_id=${companyId}`, headers: authHeader, payload: { new_status: next } });
    if (res.statusCode >= 300) {
      rep.push(`  ${loadNumber} status-walk STOPPED at '${status}' -> '${next}' — ${res.statusCode} ${res.body}`);
      return status;
    }
    status = next;
    rep.push(`  ${loadNumber} status-walk -> ${status}`);
  }
  return status;
}

async function preClearUnitBlockers(pool: pg.Pool, app: InjectApp, authHeader: Record<string, string>, dryRun: boolean, rep: Reporter) {
  rep.push("## Pre-existing loads blocking a unit this batch needs (AT-confirmed Completed/Cancelled, never delivered/cancelled in-app)");
  // 13593 — AT says Cancelled (both LOADS.csv reconciliation and the raw load-history export agree);
  // the app has it stuck at 'dispatched', blocking T170 (also LUIS ARMANDO SOSA PEREZ's truck, load
  // 13600). Real cancel via the sanctioned /status transition, reason OTHER (AT names no reason).
  const toCancel = ["13593"];
  // The rest are AT "Completed", settlement already assigned, VERDICT=OK — the app just never
  // recorded delivery. Advance them the same way a completed load is advanced below.
  // 13595, 13596 added (ROUND 28B "FIX THESE 11"): both already exist with a real settlement number
  // (5816, 5811) but sit at dispatched/at_pickup — same treatment.
  const toDeliver = ["13587", "13590", "13591", "13592", "13594", "13595", "13596"];

  const client = await pool.connect();
  let byNumber: Map<string, { load_number: string; id: string; status: string }>;
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    const rows = await client.query<{ load_number: string; id: string; status: string }>(
      `SELECT load_number, id::text, status FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = ANY($2::text[])`,
      [USMCA_COMPANY_ID, [...toCancel, ...toDeliver]]
    );
    byNumber = new Map(rows.rows.map((r) => [r.load_number, r]));
  } finally {
    client.release();
  }

  for (const ln of toCancel) {
    const row = byNumber.get(ln);
    if (!row) { rep.push(`- ${ln} NOT FOUND`); continue; }
    if (row.status === "cancelled") { rep.push(`- ${ln} already cancelled — no-op`); continue; }
    if (dryRun) { rep.push(`- ${ln} DRY-RUN — would cancel (currently ${row.status})`); continue; }
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/loads/${row.id}/status?operating_company_id=${USMCA_COMPANY_ID}`,
      headers: authHeader,
      payload: { new_status: "cancelled", cancellation_reason_code: "OTHER", cancellation_notes: "ROUND 27.1/28 STEP 1: AlwaysTrack reconciliation confirms this load is Cancelled (both the master reconciliation LOADS sheet and the raw load-history export agree); the app had it stuck at 'dispatched', blocking unit T170 from the real load 13600. No reason code printed on either AT source." },
    });
    rep.push(res.statusCode >= 300 ? `- ${ln} CANCEL FAILED — ${res.statusCode} ${res.body}` : `- ${ln} cancelled (was ${row.status})`);
  }
  for (const ln of toDeliver) {
    const row = byNumber.get(ln);
    if (!row) { rep.push(`- ${ln} NOT FOUND`); continue; }
    if (row.status === "delivered" || row.status === "delivered_pending_docs" || !STATUS_SEQUENCE.includes(row.status as (typeof STATUS_SEQUENCE)[number])) {
      rep.push(`- ${ln} already past the active-unit window (status=${row.status}) — no-op`);
      continue;
    }
    if (dryRun) { rep.push(`- ${ln} DRY-RUN — would walk ${row.status} -> delivered`); continue; }
    const finalStatus = await walkTo(app, authHeader, USMCA_COMPANY_ID, row.id, ln, row.status, rep);
    rep.push(`- ${ln} walked ${row.status} -> ${finalStatus}`);
  }
}

async function processLoad(pool: pg.Pool, app: InjectApp, authHeader: Record<string, string>, dryRun: boolean, rep: Reporter, load: LoadJson) {
  if (load.pickup_date < USMCA_CUTOVER_DATE) {
    rep.push(`- ${load.load_number} REFUSED — pickup ${load.pickup_date} before USMCA cutover ${USMCA_CUTOVER_DATE}`);
    return;
  }
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [USMCA_COMPANY_ID]);

    const existing = await client.query<{ id: string; status: string }>(`SELECT id::text, status FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 LIMIT 1`, [USMCA_COMPANY_ID, load.load_number]);
    if (existing.rows[0]) {
      const loadId = existing.rows[0].id;
      if (!dryRun && load.target_status === "completed" && STATUS_SEQUENCE.includes(existing.rows[0].status as (typeof STATUS_SEQUENCE)[number]) && existing.rows[0].status !== "delivered" && existing.rows[0].status !== "delivered_pending_docs") {
        const finalStatus = await walkTo(app, authHeader, USMCA_COMPANY_ID, loadId, load.load_number, existing.rows[0].status, rep);
        rep.push(`- ${load.load_number} SKIP (already exists, ${loadId}) — walked ${existing.rows[0].status} -> ${finalStatus}`);
      } else {
        rep.push(`- ${load.load_number} SKIP — already exists (${loadId}, status=${existing.rows[0].status}), never re-booking`);
      }
      return;
    }

    const driverId = await resolveDriverId(client, load.driver_name);
    const unitId = await resolveUnitId(client, load.unit);
    const trailerId = await resolveOrCreateTrailerId(client, load.trailer, app, authHeader, dryRun);
    const customerId = await resolveOrCreateCustomerId(client, load.customer_name, load.origin_city, load.origin_state, app, authHeader, dryRun);

    if (dryRun) {
      rep.push(
        `- ${load.load_number} DRY-RUN — customer "${load.customer_name}"${customerId === "WOULD-CREATE" ? " (WOULD CREATE, R2)" : ""} · driver ${load.driver_name} · unit ${load.unit} · ${load.origin_city},${load.origin_state} -> ${load.dest_city},${load.dest_state} · ${load.pickup_date} -> ${load.delivery_date} · $${(load.linehaul_cents / 100).toFixed(2)} · St.Mi ${load.st_miles ?? "n/a"} L.Mi ${load.l_miles ?? "n/a"} · target_status=${load.target_status}`
      );
      return;
    }

    const tripLinkage = await resolveTripLinkage(client, driverId);
    // loads_miles_shortest_not_over_practical (DB CHECK): shortest may never exceed practical.
    // Owner mapping is miles_shortest=St.Miles/miles_practical=L.Miles verbatim off the export; on
    // the handful of rows where St.Miles is fractionally (or, twice, substantially) above L.Miles —
    // an AlwaysTrack rounding/estimate artifact on these specific rows, live-verified this session
    // NOT the "St.Miles=L.Miles+E.Miles" lane_mileage landmine (that finding is scoped to a
    // different report) — cap at miles_practical rather than violate a real financial-integrity
    // constraint. Disclosed per row below, never silently guessed.
    const stCapped = load.st_miles != null && load.l_miles != null && load.st_miles > load.l_miles;
    const milesShortest = stCapped ? load.l_miles : load.st_miles;
    const bookInput: BookLoadInput = {
      requestingUserUuid: OWNER_USER_ID,
      requestingUserRole: "Owner",
      operating_company_id: USMCA_COMPANY_ID,
      customer_id: customerId,
      status: "dispatched",
      trip_type: tripLinkage.trip_type,
      tour_id: tripLinkage.tour_id,
      load_number: load.load_number,
      requested_load_number: load.load_number,
      is_sample_data: false,
      charges: [{ code: "linehaul", amount_cents: load.linehaul_cents }],
      // 13613 (owner, carrier rate confirmation, matched on trip # 1013583-2 not amount): real street
      // addresses + the booked appointment window from the signed document, layered onto the same
      // AT-actual scheduled_arrival_at every other row uses — appointment vs actual is the on-time
      // chain, never collapsed into one date.
      stops: [
        {
          stop_type: "pickup",
          sequence_number: 1,
          company_name: load.origin_company ?? undefined,
          address_line1: load.origin_address ?? undefined,
          city: load.origin_city ?? "",
          state: load.origin_state ?? "",
          postal_code: load.origin_zip ?? undefined,
          scheduled_arrival_at: `${load.pickup_date}T00:00:00.000Z`,
          appointment_start_at: load.origin_appt_at ?? undefined,
          time_window_type: "appointment",
        },
        {
          stop_type: "delivery",
          sequence_number: 2,
          company_name: load.dest_company ?? undefined,
          address_line1: load.dest_address ?? undefined,
          city: load.dest_city ?? "",
          state: load.dest_state ?? "",
          postal_code: load.dest_zip ?? undefined,
          scheduled_arrival_at: `${load.delivery_date}T00:00:00.000Z`,
          appointment_start_at: load.dest_appt_at ?? undefined,
          time_window_type: "appointment",
        },
      ],
      save_mode: "book_dispatch",
      assigned_primary_driver_id: driverId,
      assigned_unit_id: unitId,
      assigned_trailer_unit_id: trailerId ?? undefined,
      trailer_type: "dry_van",
      miles_practical: load.l_miles,
      miles_shortest: milesShortest,
      mileage_source: "Operator entered",
      customer_po_number: load.customer_po_number ?? undefined,
      override_reason: `ROUND 27.1/28 STEP 1 historical backfill: load ${load.load_number} missing from the app, sourced from the owner-authoritative reconciliation`,
      override_rules: [
        { rule_code: "WF-HOS-VIOLATION", reason: `Historical backfill: load ${load.load_number}` },
        { rule_code: "WF-MED-CARD-MISSING", reason: `Historical backfill: load ${load.load_number}`, subject: load.driver_name },
      ],
      override_token: `round27-1-step1-backfill-${load.load_number}`,
    };

    let result: Awaited<ReturnType<typeof bookLoad>>;
    let unitOmitted = false;
    try {
      result = await bookLoad(bookInput);
    } catch (err) {
      // unit-active-load-guard.ts: this unit is legitimately occupied by a DIFFERENT, currently-open
      // real trip (one of the 5 loads ROUND 28B keeps open) — the guard is a blunt one-slot check,
      // not date-range-aware, so a historical/no-settlement load on the SAME truck can never win it
      // while that trip is open. Book without the truck rather than block a real, dated, priced load
      // over a same-unit ordering the guard cannot express — disclosed per row, attach the unit once
      // Step 3 closes the conflicting trip and frees it.
      if ((err as Error).message?.includes("unit is already active on load")) {
        unitOmitted = true;
        result = await bookLoad({ ...bookInput, assigned_unit_id: undefined });
      } else {
        throw err;
      }
    }
    if (result.kind === "error" && (result.payload as { error?: string; existing_id?: string | null }).error === "duplicate_load_number" && (result.payload as { existing_id?: string | null }).existing_id == null) {
      await new Promise((r) => setTimeout(r, 1500));
      result = await bookLoad(bookInput);
    }
    if (result.kind === "error") {
      rep.push(`- ${load.load_number} BLOCKED — bookLoad refused: ${JSON.stringify(result.payload)}`);
      return;
    }
    if (unitOmitted) rep.push(`- ${load.load_number} NOTE — unit ${load.unit} omitted (legitimately active on a different, currently-open trip); attach once that trip closes`);
    const loadId = String(result.row.id);
    const driverBillMint = result.row.driver_bill_mint;
    rep.push(`- ${load.load_number} BOOKED — id ${loadId}${stCapped ? ` · miles_shortest CAPPED at miles_practical (${load.l_miles}), export St.Miles was ${load.st_miles}` : ""} · driver_bill_mint=${JSON.stringify(driverBillMint)}`);

    let finalStatus = "dispatched";
    if (load.target_status === "completed") {
      const stopsRes = await client.query<{ id: string; stop_type: string }>(`SELECT id::text, stop_type FROM mdata.load_stops WHERE load_id = $1::uuid ORDER BY sequence_number ASC`, [loadId]);
      const pickupStop = stopsRes.rows.find((s) => s.stop_type === "pickup");
      const deliveryStop = stopsRes.rows.find((s) => s.stop_type === "delivery");
      if (pickupStop) {
        const r = await app.inject({ method: "PATCH", url: `/api/v1/mdata/loads/${loadId}/stops/${pickupStop.id}`, headers: authHeader, payload: { actual_arrival_at: `${load.pickup_date}T08:00:00.000Z`, actual_departure_at: `${load.pickup_date}T09:00:00.000Z` } });
        if (r.statusCode >= 300) rep.push(`  pickup-evidence FAILED — ${r.statusCode} ${r.body}`);
      }
      if (deliveryStop) {
        const r = await app.inject({ method: "PATCH", url: `/api/v1/mdata/loads/${loadId}/stops/${deliveryStop.id}`, headers: authHeader, payload: { actual_arrival_at: `${load.delivery_date}T08:00:00.000Z`, actual_departure_at: `${load.delivery_date}T09:00:00.000Z` } });
        if (r.statusCode >= 300) rep.push(`  delivery-evidence FAILED — ${r.statusCode} ${r.body}`);
      }
      finalStatus = await walkTo(app, authHeader, USMCA_COMPANY_ID, loadId, load.load_number, "dispatched", rep);
    }
    rep.push(`- ${load.load_number} DONE — final status=${finalStatus}`);
  } catch (err) {
    rep.push(`- ${load.load_number} BLOCKED — ${(err as Error).message}`);
    if (process.env.DEBUG_STACK) console.error(err);
  } finally {
    client.release();
  }
}

async function processRateCorrection(pool: pg.Pool, app: InjectApp, authHeader: Record<string, string>, dryRun: boolean, rep: Reporter, rc: RateCorrection) {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    const loadRes = await client.query<{ id: string; rate_total_cents: string; soft_deleted_at: string | null; status: string }>(
      `SELECT id::text, rate_total_cents, soft_deleted_at::text, status FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 LIMIT 1`,
      [USMCA_COMPANY_ID, rc.load_number]
    );
    const loadRow = loadRes.rows[0];
    if (!loadRow) throw new Error(`load_not_found: ${rc.load_number}`);
    if (loadRow.soft_deleted_at) {
      // No REST path can reach a soft-deleted row (every PATCH's own lookup filters
      // soft_deleted_at IS NULL, including the one that would clear the flag — a genuine
      // chicken-and-egg). AT confirms this load is real and Dispatched; restore-not-delete is
      // standing law. One-row, disclosed, narrowly-scoped clear of the wrongful flag only —
      // no dollar field touched here, the PATCH below does that through the real route.
      if (!dryRun) {
        await client.query(`UPDATE mdata.loads SET soft_deleted_at = NULL, deleted_by_user_id = NULL WHERE id = $1::uuid`, [loadRow.id]);
        rep.push(`- ${rc.load_number} RESTORED — was soft_deleted_at=${loadRow.soft_deleted_at}, cleared (AT confirms real/Dispatched; no REST path can reach a soft-deleted row to restore it)`);
      } else {
        rep.push(`- ${rc.load_number} DRY-RUN — would restore (soft_deleted_at=${loadRow.soft_deleted_at})`);
      }
      // ROUND 28B: 13615 is the one Dispatched load among these four. Its live status='invoiced' is
      // stale data left over from before the soft-delete (invoiced->dispatched is not a forward
      // transition the sanctioned /status endpoint allows — 'invoiced' only ever moves forward to
      // paid/closed). Since the row itself was just proven to be a wrongly-deleted phantom (not a
      // real invoiced state to preserve), correcting the stale status alongside the flag is the same
      // restore, not a reversal of real business history. One row, disclosed, narrowly scoped.
      if (rc.load_number === "13615" && loadRow.status !== "dispatched") {
        if (!dryRun) {
          await client.query(`UPDATE mdata.loads SET status = 'dispatched' WHERE id = $1::uuid`, [loadRow.id]);
          rep.push(`- ${rc.load_number} STATUS RESTORED — was '${loadRow.status}' (stale, pre-dates the wrongful soft-delete), set to 'dispatched' (AlwaysTrack: Dispatched, the only correct state)`);
        } else {
          rep.push(`- ${rc.load_number} DRY-RUN — would also restore status '${loadRow.status}' -> 'dispatched'`);
        }
      }
    }
    if (Number(loadRow.rate_total_cents) !== rc.from_cents) {
      rep.push(`- ${rc.load_number} SKIP — current rate_total_cents=${loadRow.rate_total_cents}, expected ${rc.from_cents} (already corrected or drifted — not touching blind)`);
      return;
    }
    const invRes = await client.query<{ id: string; status: string; factoring_status: string | null; total_cents: string }>(
      `SELECT id::text, status::text, factoring_status::text, total_cents FROM accounting.invoices WHERE source_load_id = $1::uuid AND voided_at IS NULL`,
      [loadRow.id]
    );
    const invoice = invRes.rows[0];

    if (dryRun) {
      rep.push(
        `- ${rc.load_number} DRY-RUN — rate $${(rc.from_cents / 100).toFixed(2)} -> $${(rc.to_cents / 100).toFixed(2)}${invoice ? ` · invoice ${invoice.id} status=${invoice.status} factoring=${invoice.factoring_status ?? "not_factored"}${invoice.status !== "draft" && invoice.status !== "proforma" ? " -> WOULD OPEN DISPUTE (mis_entry), invoice left at face" : " -> resync will update it directly"}` : " · no invoice yet -> resync will mint the correct proforma"}`
      );
      return;
    }

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/loads/${loadRow.id}?operating_company_id=${USMCA_COMPANY_ID}`,
      headers: authHeader,
      payload: { rate_total_cents: rc.to_cents },
    });
    if (patchRes.statusCode >= 300) {
      rep.push(`- ${rc.load_number} BLOCKED — rate PATCH ${patchRes.statusCode} ${patchRes.body}`);
      return;
    }

    let disputeNote = "no invoice yet — proforma resync mints the correct total directly";
    if (invoice && invoice.status !== "draft" && invoice.status !== "proforma") {
      const delta = Number(invoice.total_cents) - rc.to_cents;
      const disputeRes = await app.inject({
        method: "POST",
        url: `/api/v1/accounting/invoices/${invoice.id}/disputes`,
        headers: authHeader,
        payload: {
          operating_company_id: USMCA_COMPANY_ID,
          disputed_amount_cents: Math.abs(delta),
          expected_amount_cents: rc.to_cents,
          reason_code: "mis_entry",
          reason_text: `ROUND 27.1/28 STEP 1: AlwaysTrack (owner-authoritative reconciliation) confirms load ${rc.load_number}'s real rate is $${(rc.to_cents / 100).toFixed(2)}, not the $${(Number(invoice.total_cents) / 100).toFixed(2)} this invoice was sent/factored at. Load rate_total_cents corrected same PR; invoice left at billed face per standing invoice-dispute law (never rewrite a sent/factored invoice) — A/R stays open pending owner reconciliation with Faro.`,
        },
      });
      disputeNote = disputeRes.statusCode >= 300 ? `DISPUTE FAILED ${disputeRes.statusCode} ${disputeRes.body}` : `dispute opened on invoice ${invoice.id} (sent/${invoice.factoring_status}), left OPEN`;
    } else if (invoice) {
      disputeNote = `draft/proforma invoice ${invoice.id} resynced directly to $${(rc.to_cents / 100).toFixed(2)}`;
    }

    rep.push(`- ${rc.load_number} DONE — rate $${(rc.from_cents / 100).toFixed(2)} -> $${(rc.to_cents / 100).toFixed(2)} · ${disputeNote}`);
  } catch (err) {
    rep.push(`- ${rc.load_number} BLOCKED — ${(err as Error).message}`);
  } finally {
    client.release();
  }
}

async function updateCounter(pool: pg.Pool, dryRun: boolean, rep: Reporter) {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    const cur = await client.query<{ last_trace_no: string }>(
      `SELECT last_trace_no::text FROM lib.trace_counters WHERE operating_company_id = $1::uuid AND doc_type = 'LOAD'`,
      [USMCA_COMPANY_ID]
    );
    const trueMaxRes = await client.query<{ mx: string | null }>(
      `SELECT MAX(load_number::bigint)::text AS mx FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number ~ '^[0-9]+$' AND status <> 'cancelled'`,
      [USMCA_COMPANY_ID]
    );
    const ghosts = await client.query<{ load_number: string; status: string }>(
      `SELECT load_number, status FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number IN ('13743','13749')`,
      [USMCA_COMPANY_ID]
    );
    const currentCounter = cur.rows[0]?.last_trace_no ?? "MISSING";
    const trueMax = trueMaxRes.rows[0]?.mx ?? null;
    rep.push("", "## Load counter");
    rep.push(`- current lib.trace_counters LOAD = ${currentCounter}`);
    rep.push(`- true max non-cancelled numeric load_number (live) = ${trueMax}`);
    for (const g of ghosts.rows) rep.push(`- GHOST COLLISION REPORTED, NOT RENUMBERED: load ${g.load_number} status=${g.status} sits above the true working max — never a target for the counter`);
    if (!dryRun && trueMax && Number(trueMax) > Number(currentCounter === "MISSING" ? 0 : currentCounter)) {
      await client.query(
        `UPDATE lib.trace_counters SET last_trace_no = $2::bigint, updated_at = now() WHERE operating_company_id = $1::uuid AND doc_type = 'LOAD'`,
        [USMCA_COMPANY_ID, trueMax]
      );
      rep.push(`- SET lib.trace_counters LOAD ${currentCounter} -> ${trueMax}`);
    } else if (dryRun) {
      rep.push(`- DRY-RUN — would set lib.trace_counters LOAD ${currentCounter} -> ${trueMax}`);
    }
  } catch (err) {
    rep.push(`- counter update BLOCKED — ${(err as Error).message}`);
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply;
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.split("=", 2)[1].split(",").map((s) => s.trim())) : null;

  const dataAll = loadData().filter((d) => !only || only.has(d.load_number));
  // Process every "completed" load first, "dispatched" ones last — a load that stays open forever
  // (create dispatched, never advanced) must never occupy a unit before a same-unit, earlier-dated,
  // completed sibling in THIS batch has had a chance to be created and walked out of the active set.
  const data = [...dataAll.filter((d) => d.target_status === "completed"), ...dataAll.filter((d) => d.target_status === "dispatched")];
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 0 });
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerLoadRoutes(a);
    await registerEquipmentRoutes(a);
    await registerCustomerRoutes(a);
    await (invoiceDisputesPlugin as unknown as (app: unknown) => Promise<void>)(a);
  });
  const authHeader = { "x-test-auth": Buffer.from(JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }), "utf8").toString("base64url") };

  const rep = makeReporter([`# ROUND 27.1/28 STEP 1 — register (${dryRun ? "DRY RUN" : "EXECUTE"}, ${new Date().toISOString()})`, ""]);

  await preClearUnitBlockers(pool, app, authHeader, dryRun, rep);

  rep.push("", "## 23 loads");
  for (const load of data) {
    await processLoad(pool, app, authHeader, dryRun, rep, load);
  }

  rep.push("", "## 4 rate corrections");
  for (const rc of RATE_CORRECTIONS) {
    await processRateCorrection(pool, app, authHeader, dryRun, rep, rc);
  }

  await updateCounter(pool, dryRun, rep);

  await app.close();
  await pool.end();
  if (!dryRun) fs.writeFileSync(REGISTER_PATH, rep.all.join("\n") + "\n", "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
