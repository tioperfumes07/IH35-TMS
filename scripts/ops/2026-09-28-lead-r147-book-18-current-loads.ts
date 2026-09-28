#!/usr/bin/env tsx
/**
 * R-147 (Lead, AUTH-077) — book the 18 current USMCA loads 13622–13639 through the REAL book-load
 * engine (bookLoad(), the same path the Book Load screen and CC-1's ROUND 189 script use).
 *
 * SOURCE: the owner's own AlwaysTrack boards, read 2026-09-28 (screenshots in the session) — Open
 * Loads (13624–13639 Dispatched), Delivered/Completed (13613–13623 Completed) and Unsettled Loads.
 * Rates from feed-input/workbook-customer-charges.json (the owner's CUSTOMER CHARGES export) and,
 * for 13630/13635/13639, from the signed rate confirmations in ~/Downloads.
 *
 * OWNER RULING 2026-09-28: these loads are COMPLETED AND FACTORED but NOT SETTLED because the tour
 * is still open. So NO settlement number is invented for any of them — they book and stay unsettled
 * on their driver's open pre-settlement, exactly like ROUND 189.
 *
 * 13634 and 13637 carry linehaul 0: neither is in the CUSTOMER CHARGES export (both start 09-28,
 * past the export window) and neither rate confirmation exposes a parseable amount. They are booked
 * so they RENDER on the board, with the rate left at 0 for the owner to state. Never guessed.
 *
 * Every id is resolved LIVE BY NAME/NUMBER inside the transaction — no hand-copied UUIDs.
 * Usage: OWNER_AUTH_ID=AUTH-077 npx tsx scripts/ops/2026-09-28-lead-r147-book-18-current-loads.ts
 */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { bookLoad, type BookLoadInput } from "../../apps/backend/src/dispatch/book-load.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const AUTH = process.env.OWNER_AUTH_ID;
if (!AUTH) { console.error("OWNER_AUTH_ID required"); process.exit(1); }
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH], { stdio: "inherit" });

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";

type Row = {
  ln: string; wo: string; customer: string; driver: string; truck: string; trailer: string;
  start: string; end: string; oc: string; os: string; dc: string; ds: string;
  cents: number; tt: "refrigerated_van" | "dry_van" | "flatbed";
};

const PLAN: Row[] = [
  { ln: "13622", wo: "16471804", customer: "TTS LLC", driver: "CARLOS MAURICIO PENA CARVALLO", truck: "T164", trailer: "10380", start: "2026-09-23", end: "2026-09-24", oc: "BALTIMORE", os: "MD", dc: "CONCORD", ds: "NC", cents: 220000, tt: "refrigerated_van" },
  { ln: "13623", wo: "568871", customer: "Value Logistics Inc DBA A1 Value", driver: "EDUARDO AZAEL FLORES ORTIZ", truck: "T174", trailer: "568871", start: "2026-09-23", end: "2026-09-25", oc: "LAREDO", os: "TX", dc: "VILLA PARK", ds: "IL", cents: 320000, tt: "dry_van" },
  { ln: "13624", wo: "2648812", customer: "Westgate Global Logistics", driver: "Jorge Luis Infante Corona", truck: "T177", trailer: "FB-56709", start: "2026-09-24", end: "2026-09-28", oc: "WILKES BARRE", os: "PA", dc: "ROMA", ds: "TX", cents: 520000, tt: "flatbed" },
  { ln: "13625", wo: "LGMX142", customer: "LOGIMAX TRANSPORT INC", driver: "HUGO GAYTAN SARABIA", truck: "T148", trailer: "10222", start: "2026-09-24", end: "2026-09-28", oc: "LAREDO", os: "TX", dc: "BREINIGSVILLE", ds: "PA", cents: 625000, tt: "refrigerated_van" },
  { ln: "13626", wo: "005804613", customer: "FLS Transportation Services Limited", driver: "Angel Alfonso Sosa Perez", truck: "T156", trailer: "10224", start: "2026-09-24", end: "2026-09-25", oc: "Lebanon", os: "IN", dc: "MEBANE", ds: "NC", cents: 340000, tt: "refrigerated_van" },
  { ln: "13627", wo: "21868", customer: "EGRO TRANSPORT LLC", driver: "LUIS ARMANDO SOSA PEREZ", truck: "T170", trailer: "21868", start: "2026-09-23", end: "2026-09-25", oc: "LAREDO", os: "TX", dc: "COAL CITY", ds: "IL", cents: 320000, tt: "dry_van" },
  { ln: "13628", wo: "4690712-1", customer: "Armstrong Transport GR", driver: "JOSE ANTONIO VICENTE MARTINEZ", truck: "T171", trailer: "10218", start: "2026-09-25", end: "2026-09-28", oc: "SECAUCUS", os: "NJ", dc: "HOUSTON", ds: "TX", cents: 487500, tt: "refrigerated_van" },
  { ln: "13629", wo: "SHP7437063", customer: "GLT LOGISTICS", driver: "Angel Alfonso Sosa Perez", truck: "T156", trailer: "10224", start: "2026-09-25", end: "2026-09-28", oc: "CLINTON", os: "NC", dc: "Laredo", ds: "TX", cents: 320000, tt: "refrigerated_van" },
  { ln: "13630", wo: "1013949", customer: "Refrigerx Transportation LLC", driver: "CARLOS MAURICIO PENA CARVALLO", truck: "T164", trailer: "10380", start: "2026-09-28", end: "2026-09-30", oc: "TAR HEEL", os: "NC", dc: "Laredo", ds: "TX", cents: 320000, tt: "refrigerated_van" },
  { ln: "13631", wo: "1332528", customer: "Central Freight Management, LLC", driver: "EDUARDO AZAEL FLORES ORTIZ", truck: "T174", trailer: "568871", start: "2026-09-25", end: "2026-09-28", oc: "CALUMET CITY", os: "IL", dc: "LAREDO", ds: "TX", cents: 320000, tt: "dry_van" },
  { ln: "13632", wo: "3-94954-0", customer: "RITE WAY LOGISTICS, INC", driver: "Fernando Mecor Hernandez", truck: "T168", trailer: "FB-56704", start: "2026-09-25", end: "2026-09-28", oc: "ELKHART", os: "IN", dc: "INGLESIDE", ds: "TX", cents: 400000, tt: "flatbed" },
  { ln: "13633", wo: "1776502", customer: "ACE DORAN", driver: "Genaro Guerrero Chavez", truck: "T152", trailer: "FB-56707", start: "2026-09-25", end: "2026-09-28", oc: "LAREDO", os: "TX", dc: "COMSTOCK PARK", ds: "MI", cents: 430000, tt: "flatbed" },
  // RULING 155.2a: 460000 is OWNER-DECLARED, not rate-con-derived — the signed rate con
  // (loads_5661902.pdf) states "Total Load Value: UNDECLARED", but that field is the CARGO
  // insurance/customs value on the steel tube, not the linehaul rate; the document never states
  // a freight rate at all, so it does not disagree with 460000, it is simply silent on it.
  { ln: "13634", wo: "3-95379-0", customer: "RITE WAY LOGISTICS, INC", driver: "Genaro Guerrero Chavez", truck: "T152", trailer: "FB-56707", start: "2026-09-28", end: "2026-09-30", oc: "ELKHART", os: "IN", dc: "INGLESIDE", ds: "TX", cents: 460000, tt: "flatbed" },
  { ln: "13635", wo: "2035346", customer: "C and A TRANSPORTATION & LOGISTICS INC", driver: "HUGO GAYTAN SARABIA", truck: "T148", trailer: "10222", start: "2026-09-28", end: "2026-10-01", oc: "BRIDGETON", os: "NJ", dc: "San Antonio", ds: "TX", cents: 460000, tt: "refrigerated_van" },
  { ln: "13636", wo: "2648846", customer: "Westgate Global Logistics", driver: "Leonel Antonio Morales", truck: "T175", trailer: "FB-56709", start: "2026-09-25", end: "2026-09-28", oc: "WILKES BARRE", os: "PA", dc: "ROMA", ds: "TX", cents: 520000, tt: "flatbed" },
  { ln: "13637", wo: "2648813", customer: "Westgate Global Logistics", driver: "Neftali Coronado Urbano", truck: "T176", trailer: "FB-56713", start: "2026-09-28", end: "2026-10-01", oc: "WILKES BARRE", os: "PA", dc: "ROMA", ds: "TX", cents: 0, tt: "flatbed" },
  { ln: "13638", wo: "56713", customer: "Semares Forwarding Services", driver: "Neftali Coronado Urbano", truck: "T176", trailer: "FB-56713", start: "2026-09-25", end: "2026-09-28", oc: "Laredo", os: "TX", dc: "EDISON", ds: "NJ", cents: 490000, tt: "flatbed" },
  { ln: "13639", wo: "1013880-2", customer: "Refrigerx Transportation LLC", driver: "Ruben Pedro Perez Garcia", truck: "T173", trailer: "10380", start: "2026-09-25", end: "2026-09-28", oc: "Laredo", os: "TX", dc: "QUAKERTOWN", ds: "PA", cents: 570000, tt: "refrigerated_van" },
];

async function one<T>(c: pg.PoolClient, sql: string, v: unknown[], what: string): Promise<string> {
  const r = await c.query<{ id: string }>(sql, v);
  if (r.rowCount !== 1) throw new Error(`${what}: expected 1 match, got ${r.rowCount} — refusing to guess`);
  return r.rows[0]!.id;
}

async function resolveTrip(c: pg.PoolClient, driverId: string) {
  const open = await c.query<{ id: string; tour_id: string | null }>(
    `SELECT id::text, tour_id::text FROM driver_finance.driver_settlements
      WHERE driver_id=$1::uuid AND trip_closed_at IS NULL AND voided_at IS NULL
      ORDER BY created_at DESC LIMIT 1`, [driverId]);
  const e = open.rows[0];
  if (!e) return { trip_type: "NB" as const, tour_id: randomUUID() };
  if (e.tour_id) return { trip_type: "TR" as const, tour_id: e.tour_id };
  const t = randomUUID();
  await c.query(`UPDATE driver_finance.driver_settlements SET tour_id=$1::uuid WHERE id=$2::uuid`, [t, e.id]);
  return { trip_type: "TR" as const, tour_id: t };
}

// ROUND 155.2 "How to run it": pre-flight must report EVERY unresolved reference at once and
// refuse the WHOLE run — never book 11 of 18 and leave 7 half-dead. This checks every row's
// customer/driver/unit/trailer with the SAME corrected queries the main loop uses, on one
// connection, before any bookLoad() call is made.
async function preflightResolveAll(pool: pg.Pool): Promise<string[]> {
  const problems: string[] = [];
  const c = await pool.connect();
  try {
    // Wrapped in one explicit transaction with SET LOCAL, not bare session-level set_config —
    // live-verified 2026-09-28: on Neon's pooled connection string, a bare (non-LOCAL) set_config
    // followed by separate un-transacted queries on the "same" client is NOT reliably guaranteed
    // to land on the same physical backend, silently losing the RLS bypass / entity scope between
    // statements (a second run of this exact preflight, unchanged, went from 8 failures to 49,
    // including customers created minutes earlier — pure connection-pooling flakiness, not a real
    // data problem). One transaction makes every statement in it land on the same backend.
    await c.query("BEGIN");
    await c.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    await c.query(`SET LOCAL app.operating_company_id = '${USMCA}'`);
    for (const r of PLAN) {
      const exists = await c.query(`SELECT id FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2`, [USMCA, r.ln]);
      if (exists.rowCount) continue; // will be skipped in the main loop too — not a blocker
      const checks: Array<[string, string, unknown[]]> = [
        [`customer '${r.customer}'`, `SELECT id FROM mdata.customers WHERE operating_company_id=$1::uuid AND lower(btrim(customer_name))=lower(btrim($2)) AND deactivated_at IS NULL`, [USMCA, r.customer]],
        // merged_into_driver_id IS NULL: a merged-away duplicate profile is never renamed (only
        // the survivor is), so without this exclusion it still name-matches forever after a merge.
        [`driver '${r.driver}'`, `SELECT id FROM mdata.drivers WHERE operating_company_id=$1::uuid AND lower(btrim(first_name||' '||last_name))=lower(btrim($2)) AND merged_into_driver_id IS NULL`, [USMCA, r.driver]],
        [`unit '${r.truck}'`, `SELECT id FROM mdata.units WHERE currently_leased_to_company_id=$1::uuid AND upper(btrim(unit_number))=upper(btrim($2))`, [USMCA, r.truck]],
        [`trailer '${r.trailer}'`, `SELECT id FROM mdata.equipment WHERE COALESCE(currently_leased_to_company_id, owner_company_id)=$1::uuid AND upper(btrim(equipment_number))=upper(btrim($2))`, [USMCA, r.trailer]],
      ];
      for (const [what, sql, params] of checks) {
        const res = await c.query(sql, params);
        if (res.rowCount !== 1) problems.push(`${r.ln}: ${what} — expected 1 match, got ${res.rowCount}`);
      }
    }
    await c.query("ROLLBACK"); // read-only pass, nothing to keep
  } finally {
    c.release();
  }
  return problems;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const preflightProblems = await preflightResolveAll(pool);
if (preflightProblems.length > 0) {
  console.log("PRE-FLIGHT REFUSED THE WHOLE RUN — unresolved references:");
  for (const p of preflightProblems) console.log(`  ${p}`);
  console.log(`${preflightProblems.length} unresolved reference(s) across the 18-row plan. Nothing booked.`);
  await pool.end();
  process.exit(1);
}
console.log("PRE-FLIGHT PASS — every customer/driver/unit/trailer reference resolves to exactly 1 row.");

const out: Array<Record<string, unknown>> = [];
try {
  for (const r of PLAN) {
    const c = await pool.connect();
    let ids: { customer: string; driver: string; unit: string; trailer: string };
    let trip: { trip_type: "NB" | "TR"; tour_id: string };
    try {
      // Wrapped in one explicit transaction with SET LOCAL — live-verified 2026-09-28: a bare
      // (non-LOCAL) set_config followed by separate un-transacted queries on Neon's pooled
      // connection string is not reliably guaranteed to land on the same physical backend,
      // silently losing the RLS bypass / entity scope mid-resolution (see preflightResolveAll's
      // comment for the exact repro: the same read went from 8 failures to 49 between two runs).
      await c.query("BEGIN");
      await c.query(`SET LOCAL app.bypass_rls = 'lucia'`);
      await c.query(`SET LOCAL app.operating_company_id = '${USMCA}'`);
      const exists = await c.query(`SELECT id FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2`, [USMCA, r.ln]);
      if (exists.rowCount) { await c.query("COMMIT"); console.log(`${r.ln}: SKIP exists`); out.push({ ln: r.ln, status: "skip_exists" }); continue; }
      ids = {
        // 155.2.b fix: mdata.customers has no `name`/`is_active` columns live — the real columns
        // are `customer_name` and `deactivated_at` (verified via information_schema.columns,
        // 2026-09-28). The original query would 42703 on every row before ever reaching a
        // missing-customer failure.
        customer: await one(c, `SELECT id::text FROM mdata.customers WHERE operating_company_id=$1::uuid AND lower(btrim(customer_name))=lower(btrim($2)) AND deactivated_at IS NULL`, [USMCA, r.customer], `customer '${r.customer}'`),
        // merged_into_driver_id IS NULL: a merged-away duplicate profile is never renamed (only
        // the survivor is), so without this exclusion it still name-matches forever after a merge.
        driver: await one(c, `SELECT id::text FROM mdata.drivers WHERE operating_company_id=$1::uuid AND lower(btrim(first_name||' '||last_name))=lower(btrim($2)) AND merged_into_driver_id IS NULL`, [USMCA, r.driver], `driver '${r.driver}'`),
        // 155.2.a fix: mdata.units has no `operating_company_id` column — units carry
        // `owner_company_id` (who owns the tractor) and `currently_leased_to_company_id` (who is
        // currently operating it). The dispatch-relevant scope is the latter, matching
        // book-load.service.ts's own resolution pattern for the trailer id below.
        unit: await one(c, `SELECT id::text FROM mdata.units WHERE currently_leased_to_company_id=$1::uuid AND upper(btrim(unit_number))=upper(btrim($2))`, [USMCA, r.truck], `unit '${r.truck}'`),
        // Trailers are NOT in mdata.units at all — every row in that table is vehicle_type
        // 'Tractor' or NULL (live-verified 2026-09-28: 0 rows of type 'Trailer'). The real
        // physical trailer table is mdata.equipment, keyed by equipment_number, exactly as
        // book-load.service.ts's own trailer resolution query expects
        // (`id = $1 AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2`).
        trailer: await one(c, `SELECT id::text FROM mdata.equipment WHERE COALESCE(currently_leased_to_company_id, owner_company_id)=$1::uuid AND upper(btrim(equipment_number))=upper(btrim($2))`, [USMCA, r.trailer], `trailer '${r.trailer}'`),
      };
      trip = await resolveTrip(c, ids.driver);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      console.log(`${r.ln}: RESOLVE FAILED — ${(e as Error).message}`);
      out.push({ ln: r.ln, status: "resolve_failed", error: (e as Error).message });
      continue;
    } finally { c.release(); }

    const input: BookLoadInput = {
      requestingUserUuid: OWNER, requestingUserRole: "Owner", operating_company_id: USMCA,
      customer_id: ids.customer, status: "dispatched", trip_type: trip.trip_type, tour_id: trip.tour_id,
      load_number: r.ln, requested_load_number: r.ln, is_sample_data: false,
      charges: r.cents > 0 ? [{ code: "linehaul", amount_cents: r.cents }] : [],
      stops: [
        { stop_type: "pickup", sequence_number: 1, city: r.oc, state: r.os, scheduled_arrival_at: `${r.start}T00:00:00.000Z`, time_window_type: "appointment" },
        { stop_type: "delivery", sequence_number: 2, city: r.dc, state: r.ds, scheduled_arrival_at: `${r.end}T00:00:00.000Z`, time_window_type: "appointment" },
      ],
      save_mode: "book_dispatch",
      assigned_primary_driver_id: ids.driver, assigned_unit_id: ids.unit, assigned_trailer_unit_id: ids.trailer,
      trailer_type: r.tt, customer_po_number: r.wo,
      override_reason: `R-147 (AUTH-077): load ${r.ln} is live on the owner's AlwaysTrack board and missing from USMCA — booked through the real book-load engine from that board row. Completed/factored but unsettled (open tour) per the owner's 2026-09-28 ruling; no settlement number assigned.${
        r.ln === "13634"
          ? " RULING 155.2a: rate 460000 cents is OWNER-DECLARED, NOT rate-con-derived — loads_5661902.pdf states no freight rate at all (its \"Total Load Value: UNDECLARED\" field is the cargo/customs value, not the linehaul); do not cite that PDF as the source for this number."
          : ""
      }`,
      override_rules: [
        { rule_code: "WF-HOS-VIOLATION", reason: `R-147 ${r.ln}` },
        { rule_code: "WF-MED-CARD-MISSING", reason: `R-147 ${r.ln}` },
      ],
      override_token: `r147-book-current-${r.ln}`,
    };

    let res: Awaited<ReturnType<typeof bookLoad>>;
    const notes: string[] = [];
    try {
      res = await bookLoad(input);
    } catch (err) {
      const m = (err as Error).message ?? "";
      if (m.includes("unit is already active on load")) { notes.push("unit omitted"); res = await bookLoad({ ...input, assigned_unit_id: undefined }); }
      else if (m.includes("uq_driver_settlements_one_open_per_driver")) { notes.push("trip link omitted"); res = await bookLoad({ ...input, trip_type: undefined, tour_id: undefined }); }
      else { console.log(`${r.ln}: THREW — ${m}`); out.push({ ln: r.ln, status: "threw", error: m }); continue; }
    }
    if (res.kind === "error") {
      console.log(`${r.ln}: BLOCKED — ${JSON.stringify(res.payload)}`);
      out.push({ ln: r.ln, status: "blocked", payload: res.payload }); continue;
    }
    console.log(`${r.ln}: BOOKED ${res.row.id} ${notes.join(",")} bill=${JSON.stringify(res.row.driver_bill_mint)}`);
    out.push({ ln: r.ln, status: "booked", id: String(res.row.id), rate_cents: r.cents, notes });
  }
  const booked = out.filter((o) => o.status === "booked").length;
  console.log(JSON.stringify({ booked, of: PLAN.length, detail: out }, null, 1));
} finally { await pool.end(); }
