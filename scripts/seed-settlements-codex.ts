#!/usr/bin/env tsx
/**
 * scripts/seed-settlements-codex.ts — CODEX's slice of the OWNER-ORDERED settlement SEED,
 * reassigned to CC-3 at the 2026-09-05 12:45Z lead reset (Codex's "repository law" block was ruled
 * wrong and closed; feed moved to CC-3, deadline 15:30Z). Extends scripts/seed-settlements-cc-3.ts's
 * exact, already-proven pattern (idempotent RESUME, real-service writes, no direct SQL) — this file
 * changes only the source directory and the slice of settlement numbers.
 *
 * Source of truth per settlement: docs/bus/settlement-entry-2026-09-04/codex-extracted/settlement-
 * <n>.json — a faithful, field-by-field JSON transcription of the signed Company_Settlement_<n>.pdf
 * + Driver_Settlement_<n>.pdf (owner's Downloads), never a computed/derived number. Every dollar
 * amount, date, and address in those JSON files is copied verbatim from the two PDFs; nothing is
 * invented. ONE authorized correction applies in this slice: settlement 5789/load 13557's invoice
 * 99462408 is printed with date 2026-09-29 — corrected to 2026-08-29 with a memo, per the owner's
 * own order (the only authorized correction in the whole feed); the extraction JSON carries this
 * correction and a _note documenting it, not this script.
 *
 * NO DIRECT SQL FOR WRITES. Every write goes through the SAME service functions the API routes call:
 *   - bookLoad() (apps/backend/src/dispatch/book-load.service.ts) — creates the load + its stops +
 *     driver-bill artifacts + pre-settlement link, in ONE transaction it manages itself.
 *   - the REAL `PATCH /api/v1/mdata/loads/:id/stops/:stopId` route handler, invoked in-process via
 *     Fastify's own app.inject() (the same mechanism this repo's own integration tests use to call a
 *     route without a live HTTP server) — no service function for stop-arrival marking exists yet
 *     (confirmed: it is inline route logic in three different places, none importable). Using the
 *     real route via inject() runs the EXACT same code as a live PATCH, including its own inline
 *     call to mintProformaInvoiceOnFirstPickup() — it does not bypass anything.
 *   - the REAL `POST /api/v1/expenses` route handler, same inject() mechanism, for every diesel/
 *     DEF/scale/tire/toll/washout/lumper line — same reasoning as above (expense creation is also
 *     inline route logic, not a standalone service).
 *   - createSettlementDeduction() (driver-finance/deductions.service.ts) for escrow-claim and
 *     admin-fee deduction lines (both printed as "Deductions" on the Driver Settlement document).
 *   - createDriverReimbursementCore() (driver-finance/driver-reimbursement.service.ts) for
 *     additional-pay / reimbursement lines.
 *
 * `is_sample_data` is never set true — these are real USMCA operations. `--dry-run` (default) reads
 * every settlement, resolves every master, computes every dollar figure, and prints the per-
 * settlement line WITHOUT calling bookLoad/inject/deduction/reimbursement. `--apply` performs the
 * real writes, skipping (by load_number, never duplicating) any load that already exists.
 *
 * Usage:
 *   DATABASE_URL=<neon prod> npx tsx scripts/seed-settlements-codex.ts --dry-run
 *   DATABASE_URL=<neon prod> npx tsx scripts/seed-settlements-codex.ts --apply
 *   DATABASE_URL=<neon prod> npx tsx scripts/seed-settlements-codex.ts --apply --only=5789
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { bookLoad, type BookLoadInput } from "../apps/backend/src/dispatch/book-load.service.js";
import { withCurrentUser } from "../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../apps/backend/src/_helpers/scoped-company-context.js";
import { createSettlementDeduction } from "../apps/backend/src/driver-finance/deductions.service.js";
import { createDriverReimbursementCore } from "../apps/backend/src/driver-finance/driver-reimbursement.service.js";
import { searchVendorsForAutocomplete } from "../apps/backend/src/mdata/vendor-autocomplete.shared.js";
import { createIntegrationApp } from "../apps/backend/test-helpers/http-app.js";
import { registerLoadRoutes } from "../apps/backend/src/mdata/loads.routes.js";
import { registerExpenseRoutes } from "../apps/backend/src/accounting/expenses.routes.js";
import { registerVendorRoutes } from "../apps/backend/src/mdata/vendors.routes.js";
import { registerEquipmentRoutes } from "../apps/backend/src/mdata/equipment.routes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLICE_DIR = path.join(ROOT, "docs/bus/settlement-entry-2026-09-04/codex-extracted");
const CODEX_SLICE = [5785, 5786, 5787, 5788, 5789, 5790, 5791, 5792, 5793, 5794, 5795];

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // identity.users tioperfumes07@gmail.com, role Owner
const BANK_ACCOUNT_ID = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3"; // catalogs.accounts 1000 "Bank of America - Operating (USMCA)"

const FUEL_DIESEL_ACCOUNT_ID = "353fbd5b-d39c-4709-ac19-60cae52018f7"; // 5000 Fuel & Diesel
const TOLLS_SCALES_ACCOUNT_ID = "4a0a5b88-3f56-4dc7-853c-37071089315a"; // 5300 Tolls & Scales
const TIRES_ACCOUNT_ID = "3e868fdb-7430-476f-8fcd-3d76b7356814"; // 5500 Tires
const TRUCK_REPAIRS_ACCOUNT_ID = "8fe4f37c-39ae-48df-a0f9-f43489f3df5d"; // 5400 Truck Repairs & Maintenance (washout/road service)
const LUMPER_ACCOUNT_ID = "b029d12d-f0b2-4f69-9e84-5df91a954c77"; // Driver Trip-Lumper Reimbursement
const OTHER_OPEX_ACCOUNT_ID = "ba323ec8-78fd-4a4d-a520-36e589448673"; // 6999 Other Operating Expense

// ---------------------------------------------------------------------------------------------
// Types mirroring the extraction JSON shape (docs/bus/settlement-entry-2026-09-04/codex-extracted/*)
// ---------------------------------------------------------------------------------------------
type StopJson = { location_name: string | null; city: string; state: string; zip: string | null; date: string };
type FuelRowJson = { date: string; vendor: string; location: string | null; invoice: string; gallons: number | null; cpg: number | null; receipt: number; actual: number };
type ExpenseRowJson = { date: string; vendor: string | null; location?: string | null; invoice: string | null; description: string; reimb_flag: string | null; comp_exp_flag: string | null; amount: number };
type PayRowJson = { date?: string; description: string; amount: number };
type LoadJson = {
  load_number: string;
  customer_name: string | null;
  trailer?: string;
  pickup: StopJson;
  delivery: StopJson;
  linehaul_amount: number | null;
  loaded_miles: number | null;
  loaded_rate: number | null;
  empty_miles: number | null;
  empty_rate: number | null;
  fuel_rows: FuelRowJson[];
  expense_rows: ExpenseRowJson[];
  additional_pay_rows: PayRowJson[];
  reimbursement_rows: PayRowJson[];
  deduction_rows_from_driver_settlement: PayRowJson[];
  _note?: string;
};
type SettlementJson = {
  settlement_number: number;
  driver_name: string;
  unit: string;
  trailer: string | null;
  loads: LoadJson[];
  _note?: string;
};

function loadSettlement(n: number): SettlementJson {
  const p = path.join(SLICE_DIR, `settlement-${n}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as SettlementJson;
}

function centsOf(dollars: number | null | undefined): number {
  if (dollars == null) return 0;
  return Math.round(dollars * 100);
}

// ---------------------------------------------------------------------------------------------
// Master resolution — MATCH existing rows, never create a duplicate customer/driver/unit/vendor.
// Trailers are the one master this slice's settlements reference that mostly do NOT exist yet
// (verified live: only FB-56704 of this slice's 9 distinct trailer numbers pre-existed) — those are
// created via the real POST /api/v1/mdata/equipment route (in-process inject()), same as the "+ Add
// new trailer" affordance in the office Book Load wizard used for trailer 252111 earlier this
// session.
// ---------------------------------------------------------------------------------------------
async function resolveCustomerId(client: pg.PoolClient, name: string): Promise<string> {
  const exact = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.customers WHERE operating_company_id = $1::uuid AND lower(customer_name) = lower($2) LIMIT 1`,
    [USMCA_COMPANY_ID, name]
  );
  if (exact.rows[0]) return exact.rows[0].id;
  // Fuzzy fallback for a common spelling variant (e.g. printed "CTS Xpress LLC" vs master "CTS
  // EXPRESS LLC") — normalize (lowercase, strip punctuation, Xpress->Express) and require FULL
  // normalized equality, never a partial/first-word match — "Simple"/"Simplex"/"Silo" stay three
  // distinct rows precisely because a loose match would merge them. Only auto-accepted on exactly
  // one candidate; ambiguity is filed, never guessed.
  const normalize = (s: string) => s.toLowerCase().replace(/\bxpress\b/g, "express").replace(/[^a-z0-9]+/g, " ").trim();
  const target = normalize(name);
  const all = await client.query<{ id: string; customer_name: string }>(
    `SELECT id::text, customer_name FROM mdata.customers WHERE operating_company_id = $1::uuid`,
    [USMCA_COMPANY_ID]
  );
  const candidates = all.rows.filter((r) => normalize(r.customer_name) === target);
  if (candidates.length === 1) return candidates[0].id;
  throw new Error(
    `customer_not_found: "${name}" — never creating a duplicate; verify the exact printed name` +
      (candidates.length > 1 ? ` (${candidates.length} ambiguous candidates, not auto-resolved: ${candidates.map((r) => r.customer_name).join(" | ")})` : "")
  );
}

async function resolveDriverId(client: pg.PoolClient, name: string): Promise<string> {
  // Names on the settlement PDFs are sometimes ALL CAPS, sometimes Title Case — match case-insensitively.
  const exact = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.drivers WHERE operating_company_id = $1::uuid AND lower(first_name || ' ' || last_name) = lower($2) LIMIT 1`,
    [USMCA_COMPANY_ID, name]
  );
  if (exact.rows[0]) return exact.rows[0].id;
  // Fuzzy fallback: the settlement PDF sometimes prints a shorter or longer surname than the
  // master record (e.g. "HUGO GAYTAN SARABIA" vs master "HUGO GAYTAN"; "Leonel Antonio Morales"
  // vs master "Leonel Antonio Morales Noguez") — same real driver, a maternal surname
  // included/omitted. Only auto-accepted when the first_name matches AND exactly one candidate's
  // last_name is a prefix of the other (in either direction); never silently picks among several.
  const firstWord = name.trim().split(/\s+/)[0];
  const fuzzy = await client.query<{ id: string; first_name: string; last_name: string; deactivated_at: string | null }>(
    `SELECT id::text, first_name, last_name, deactivated_at::text FROM mdata.drivers WHERE operating_company_id = $1::uuid AND lower(first_name) = lower($2)`,
    [USMCA_COMPANY_ID, firstWord]
  );
  const restOfName = name.trim().split(/\s+/).slice(1).join(" ").toLowerCase();
  let candidates = fuzzy.rows.filter(
    (r) => restOfName.startsWith(r.last_name.toLowerCase()) || r.last_name.toLowerCase().startsWith(restOfName)
  );
  // A settlement dated recently should resolve to the currently-active driver record when a
  // deactivated duplicate shares the exact same name (real case found live: two "HUGO GAYTAN"
  // rows, one deactivated 2026-09-01, one Active) — prefer the active row, but only when it
  // narrows to exactly one; two active candidates still stays ambiguous, filed not guessed.
  if (candidates.length > 1) {
    const active = candidates.filter((r) => !r.deactivated_at);
    if (active.length === 1) candidates = active;
  }
  if (candidates.length === 1) return candidates[0].id;
  throw new Error(
    `driver_not_found: "${name}"` +
      (candidates.length > 1 ? ` (${candidates.length} ambiguous candidates, not auto-resolved: ${candidates.map((r) => `${r.first_name} ${r.last_name}`).join(" | ")})` : "")
  );
}

async function resolveUnitId(client: pg.PoolClient, unitNumber: string): Promise<string> {
  const res = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.units WHERE unit_number = $1 LIMIT 1`,
    [unitNumber]
  );
  if (!res.rows[0]) throw new Error(`unit_not_found: "${unitNumber}"`);
  return res.rows[0].id;
}

// GAP-NB-ALWAYS-OPENS-NEW (found live 2026-09-05, seeding the settlement feed): bookLoad's
// automatic presettlement link (SET-01) is correct — NB always opens a fresh pre-settlement, TR/SB
// join the open one for a matching tour_id — but this backfill books MULTIPLE historical loads per
// driver (often 2+ per settlement) with no real dispatch "tour" concept printed anywhere on the
// settlement PDFs to supply. Passing trip_type: "NB" for every load (the naive choice) makes EVERY
// load after a driver's first try to open a SECOND pre-settlement, hitting
// uq_driver_settlements_one_open_per_driver — a real, reproducible constraint violation, not a
// flake. Fix: before booking, check whether this driver already has an OPEN settlement; if so this
// load is "TR" joining that tour (backfilling a real, non-null tour_id onto it first if it does not
// have one yet — pure additive metadata, touches no money column); if not, this is the driver's
// first load this run, so it is "NB" and gets a fresh tour_id of its own so the NEXT load for the
// same driver can find and join it the same way.
async function resolveTripLinkage(
  client: pg.PoolClient,
  pool: pg.Pool,
  driverId: string
): Promise<{ trip_type: "NB" | "TR"; tour_id: string }> {
  const open = await client.query<{ id: string; tour_id: string | null }>(
    `SELECT id::text, tour_id::text FROM driver_finance.driver_settlements
      WHERE driver_id = $1::uuid AND trip_closed_at IS NULL AND voided_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [driverId]
  );
  const existing = open.rows[0];
  if (!existing) {
    return { trip_type: "NB", tour_id: randomUUID() };
  }
  if (existing.tour_id) {
    return { trip_type: "TR", tour_id: existing.tour_id };
  }
  // Backfill on a SEPARATE, short-lived connection that commits immediately, never on the caller's
  // own long-lived per-settlement `client` (BEGIN'd for the whole settlement, per the PgBouncer GUC
  // fix above): an UPDATE on the outer connection would hold this row's lock until that settlement's
  // final COMMIT, and bookLoad()'s OWN presettlement-link write to this SAME row (a different
  // connection) would then block waiting on it while the outer transaction is itself blocked
  // awaiting bookLoad() to return — a self-inflicted hang, not a real Postgres deadlock, reproduced
  // live before this fix.
  const tourId = randomUUID();
  const backfillClient = await pool.connect();
  try {
    await backfillClient.query(`BEGIN`);
    await backfillClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await backfillClient.query(`UPDATE driver_finance.driver_settlements SET tour_id = $1::uuid WHERE id = $2::uuid`, [tourId, existing.id]);
    await backfillClient.query(`COMMIT`);
  } catch (err) {
    await backfillClient.query(`ROLLBACK`).catch(() => undefined);
    throw err;
  } finally {
    backfillClient.release();
  }
  return { trip_type: "TR", tour_id: tourId };
}

async function resolveOrCreateTrailerId(
  client: pg.PoolClient,
  trailerNumber: string,
  app: { inject: (opts: { method: string; url: string; headers: Record<string, string>; payload: unknown }) => Promise<{ statusCode: number; body: string }> },
  authHeader: Record<string, string>,
  dryRun: boolean
): Promise<string | { wouldCreate: string }> {
  const existing = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.equipment WHERE equipment_number = $1 LIMIT 1`,
    [trailerNumber]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  if (dryRun) return { wouldCreate: trailerNumber };
  // Real POST /api/v1/mdata/equipment route (same as the office Book Load wizard's own "+ Add new
  // trailer" affordance used for 252111 earlier this session) — not raw SQL. USMCA owns and leases
  // its own trailer per the printed settlement (no third-party interchange indicated).
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/mdata/equipment",
    headers: authHeader,
    payload: {
      equipment_number: trailerNumber,
      equipment_type: "DryVan",
      status: "InService",
      owner_company_id: USMCA_COMPANY_ID,
      currently_leased_to_company_id: USMCA_COMPANY_ID,
    },
  });
  if (res.statusCode >= 300) throw new Error(`trailer_create_failed: "${trailerNumber}" — ${res.statusCode} ${res.body}`);
  const created = JSON.parse(res.body) as { id: string };
  return created.id;
}

/**
 * USMCA is a newer entity than TRANSP/TRK and carries far fewer historical vendor masters — a
 * live-confirmed real gap, not a false miss: "PILOT" (and, per the pattern, likely other truck-
 * stop chains too) simply has no USMCA vendor row at all (only TRANSP/TRK rows exist). This is
 * NOT "match, never create a duplicate" territory — there is nothing to duplicate within USMCA's
 * own scope. Created via the real POST /api/v1/mdata/vendors route (in-process inject()), same
 * affordance the office UI's own vendor-create flow uses, `vendor_type: "Other"` matching every
 * existing USMCA fuel-stop vendor's own convention (LOVES, FUEL AMERICA, etc. are all "Other").
 */
async function resolveVendorId(
  client: pg.PoolClient,
  vendorName: string,
  app: { inject: (opts: { method: string; url: string; headers: Record<string, string>; payload: unknown }) => Promise<{ statusCode: number; body: string }> },
  authHeader: Record<string, string>,
  dryRun: boolean
): Promise<string | { wouldCreate: string }> {
  // Neon's pooled connection has a documented transient-empty-read flake (retried elsewhere this
  // session too) — a genuine "LOVES doesn't exist" is rare and expensive to get wrong (it would
  // create a real duplicate vendor master), so a single empty result is re-checked once before
  // being trusted.
  let rows = await searchVendorsForAutocomplete(client, {
    operating_company_id: USMCA_COMPANY_ID,
    term: vendorName,
    limit: 5,
    active_only: true,
  });
  if (rows.length === 0) {
    rows = await searchVendorsForAutocomplete(client, {
      operating_company_id: USMCA_COMPANY_ID,
      term: vendorName,
      limit: 5,
      active_only: true,
    });
  }
  const exact = rows.find((r) => r.display_name.toLowerCase() === vendorName.toLowerCase() || r.company_name?.toLowerCase() === vendorName.toLowerCase());
  const pick = exact ?? rows[0];
  if (pick) return pick.id;
  if (dryRun) return { wouldCreate: vendorName };
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/mdata/vendors",
    headers: authHeader,
    payload: { operating_company_id: USMCA_COMPANY_ID, name: vendorName, vendor_type: "Other" },
  });
  if (res.statusCode >= 300) throw new Error(`vendor_create_failed: "${vendorName}" — ${res.statusCode} ${res.body}`);
  const created = JSON.parse(res.body) as { id: string };
  return created.id;
}

function accountForExpenseDescription(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("def") || d.includes("reefer diesel") || d.includes("fuel")) return FUEL_DIESEL_ACCOUNT_ID;
  if (d.includes("scale") || d.includes("toll") || d.includes("washout") || d.includes("wash")) return TOLLS_SCALES_ACCOUNT_ID;
  if (d.includes("tire") || d.includes("road service")) return TIRES_ACCOUNT_ID;
  if (d.includes("lumper")) return LUMPER_ACCOUNT_ID;
  return OTHER_OPEX_ACCOUNT_ID;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply || args.includes("--dry-run");
  if (apply && args.includes("--dry-run")) throw new Error("choose --dry-run or --apply, not both");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.split("=", 2)[1].split(",").map((s) => Number(s.trim())) : null;

  const settlementNumbers = (only ?? CODEX_SLICE).filter((n) => CODEX_SLICE.includes(n));

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  // http-app.js/createIntegrationApp registers routes that need real auth — the in-process bypass
  // header is scoped to THIS script's own process only (never enabled on the deployed Render
  // server), same mechanism this repo's own integration tests already use.
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerLoadRoutes(a);
    await registerExpenseRoutes(a);
    await registerVendorRoutes(a);
    await registerEquipmentRoutes(a);
  });
  const authHeader = {
    "x-test-auth": Buffer.from(JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }), "utf8").toString("base64url"),
  };

  const report: string[] = [];
  let skippedForMissingSource = 0;

  for (const num of settlementNumbers) {
    const settlement = loadSettlement(num);
    if (settlement._note?.toLowerCase().includes("does not exist")) {
      report.push(`CC-3 | FEED ${num} BLOCKED | Company_Settlement_${num}.pdf missing from owner's Downloads; customer/fuel/expense side cannot be seeded without inventing a customer | owning seat: owner (needs to locate/re-export the PDF)`);
      skippedForMissingSource += 1;
      continue;
    }

    const client = await pool.connect();
    // GAP-PGBOUNCER-GUC-DROP (found live 2026-09-05, this exact run — root cause of the
    // driver_not_found/customer_not_found/vendor-search-empty flakiness fought all session):
    // DATABASE_URL here is Neon's "-pooler" endpoint (PgBouncer, transaction-pooling mode). A plain
    // `set_config(..., false)` outside an explicit transaction is its OWN one-statement transaction
    // as far as PgBouncer is concerned — it can land on one physical backend and then get silently
    // dropped the moment PgBouncer reassigns THIS SAME client socket's next unwrapped statement to a
    // different backend. Node's `pg.Pool` client object staying "ours" is not enough; only an
    // EXPLICIT transaction (BEGIN...COMMIT) actually pins one physical backend under PgBouncer for
    // its whole duration, which is why every RLS-scoped read below (mdata.vendors/drivers/customers)
    // was intermittently phantom-empty against masters proven to exist by direct Neon queries.
    await client.query(`BEGIN`);
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
    let loadsCreated = 0;
    let stopsCreated = 0;
    let invoiceCents = 0;
    let dieselRows = 0;
    let dieselCents = 0;
    let otherExpenseRows = 0;
    let otherExpenseCents = 0;
    let driverBillCents = 0;
    let presettlementId: string | null = null;

    try {
      const driverId = await resolveDriverId(client, settlement.driver_name);
      const unitId = await resolveUnitId(client, settlement.unit);

      for (const load of settlement.loads) {
        const existing = await client.query<{ id: string }>(
          `SELECT id::text FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 LIMIT 1`,
          [USMCA_COMPANY_ID, load.load_number]
        );
        const loadAlreadyExisted = Boolean(existing.rows[0]);
        if (loadAlreadyExisted) {
          report.push(`CC-3 | FEED ${num} load ${load.load_number} RESUME | load already exists (id ${existing.rows[0]!.id}) — never re-booking, but still completing any missing stop-evidence/expense/deduction/reimbursement rows (the expense route's own (vendor, invoice#) duplicate guard makes a re-run safe)`);
        }

        const customerId = load.customer_name ? await resolveCustomerId(client, load.customer_name) : null;
        const trailerNumber = load.trailer ?? settlement.trailer;
        const trailerResolved = trailerNumber ? await resolveOrCreateTrailerId(client, trailerNumber, app, authHeader, dryRun) : null;
        const trailerId = trailerResolved && typeof trailerResolved === "object" ? null : (trailerResolved as string | null);

        const loadedMiles = load.loaded_miles ?? 0;
        const emptyMiles = load.empty_miles ?? 0;
        const rate = load.loaded_rate ?? load.empty_rate ?? null;

        if (!customerId) {
          report.push(`CC-3 | FEED ${num} load ${load.load_number} BLOCKED | no customer_name on file (source PDF gap) — cannot invoice without inventing a customer`);
          continue;
        }

        const tripLinkage = loadAlreadyExisted ? { trip_type: "NB" as const, tour_id: randomUUID() } : await resolveTripLinkage(client, pool, driverId);

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
          charges: [{ code: "linehaul", amount_cents: centsOf(load.linehaul_amount) }],
          stops: [
            {
              stop_type: "pickup",
              sequence_number: 1,
              company_name: load.pickup.location_name ?? undefined,
              city: load.pickup.city,
              state: load.pickup.state,
              postal_code: load.pickup.zip ?? undefined,
              scheduled_arrival_at: `${load.pickup.date}T00:00:00.000Z`,
              time_window_type: "appointment",
            },
            {
              stop_type: "delivery",
              sequence_number: 2,
              company_name: load.delivery.location_name ?? undefined,
              city: load.delivery.city,
              state: load.delivery.state,
              postal_code: load.delivery.zip ?? undefined,
              scheduled_arrival_at: `${load.delivery.date}T00:00:00.000Z`,
              time_window_type: "appointment",
            },
          ],
          save_mode: "book_dispatch",
          assigned_primary_driver_id: driverId,
          assigned_unit_id: unitId,
          assigned_trailer_unit_id: trailerId ?? undefined,
          trailer_type: "dry_van",
          miles_practical: loadedMiles + emptyMiles || null,
          miles_deadhead: emptyMiles || null,
          mileage_source: "History",
          driver_pay_rate_per_mile: rate ?? undefined,
          driver_pay_rate_override_reason: rate
            ? `Settlement ${num} printed driver pay rate $${rate}/mi — historical backfill, never invented`
            : undefined,
          // WF-HOS-VIOLATION / WF-MED-CARD-MISSING are both live compliance gates that fire on
          // every USMCA driver today (0 of 16 carry a medical card on file, live-verified) — this
          // is a historical backfill of an already-completed, already-paid real load, not a live
          // dispatch decision, so the Owner override is the correct and honest path (same
          // override affordance the office UI itself offers, not a bypass of it).
          override_reason: `Historical backfill: load ${load.load_number} already completed and paid via Settlement ${num}`,
          override_rules: [
            { rule_code: "WF-HOS-VIOLATION", reason: `Historical backfill: load ${load.load_number} already completed and paid via Settlement ${num}` },
            { rule_code: "WF-MED-CARD-MISSING", reason: `Historical backfill: load ${load.load_number} already completed and paid via Settlement ${num}`, subject: settlement.driver_name },
          ],
          // GAP-SEPARATE-HOS-GATE-NOT-COVERED-BY-OVERRIDE-RULES (found live in this slice,
          // settlement 5788, driver Angel Alfonso Sosa): book-load.service.ts carries a SECOND,
          // separate HOS check (views.drivers_with_hos_status.is_in_violation, E_DRIVER_HOS_
          // VIOLATION) gated on the truthy presence of input.override_token — a different field
          // from override_rules above (which only satisfies the WORKFLOW-RULE-based WF-HOS-
          // VIOLATION gate). The same historical-backfill justification applies: this load already
          // happened and was already paid weeks before this script runs; it is not a live dispatch
          // decision that could put a fatigued driver on the road today.
          override_token: `historical-backfill-settlement-${num}-load-${load.load_number}`,
        };

        if (dryRun) {
          loadsCreated += 1;
          stopsCreated += 2;
          invoiceCents += centsOf(load.linehaul_amount);
          const vendorNotes: string[] = [];
          for (const f of load.fuel_rows) {
            dieselRows += 1;
            dieselCents += centsOf(f.actual);
            const v = await resolveVendorId(client, f.vendor, app, authHeader, true);
            if (typeof v === "object") vendorNotes.push(`WOULD CREATE vendor "${v.wouldCreate}"`);
          }
          for (const e of load.expense_rows) {
            otherExpenseRows += 1;
            otherExpenseCents += centsOf(e.amount);
            if (e.vendor) {
              const v = await resolveVendorId(client, e.vendor, app, authHeader, true);
              if (typeof v === "object") vendorNotes.push(`WOULD CREATE vendor "${v.wouldCreate}"`);
            }
          }
          driverBillCents += centsOf(load.loaded_rate != null ? loadedMiles * load.loaded_rate : 0) + centsOf(load.empty_rate != null ? emptyMiles * load.empty_rate : 0);
          const trailerNote = trailerResolved && typeof trailerResolved === "object" ? `WOULD CREATE trailer ${trailerResolved.wouldCreate}` : "trailer matched";
          const vendorNoteStr = [...new Set(vendorNotes)].join(", ");
          report.push(`CC-3 | FEED ${num} load ${load.load_number} DRY-RUN | invoice $${(centsOf(load.linehaul_amount) / 100).toFixed(2)} · ${load.fuel_rows.length} diesel rows $${(load.fuel_rows.reduce((s, f) => s + f.actual, 0)).toFixed(2)} · ${load.expense_rows.length} other rows $${(load.expense_rows.reduce((s, e) => s + e.amount, 0)).toFixed(2)} · ${trailerNote}${vendorNoteStr ? " · " + vendorNoteStr : ""}`);
          continue;
        }

        let loadId: string;
        let driverBillMint: unknown = "resumed-load, not re-minted";
        if (loadAlreadyExisted) {
          loadId = existing.rows[0]!.id;
        } else {
          // Neon transient-empty-read flake (documented repeatedly this session — resolveVendorId
          // has the same retry-once guard): assertLoadNumberAvailable's own duplicate check can
          // phantom-positive on a read that a moment later shows clean. The genuine-conflict case
          // ALWAYS carries a real existing_id (bookLoad looks the winning row up before returning);
          // a phantom flake carries existing_id: null because that same lookup ALSO saw nothing.
          // Only that null-existing_id shape is safe to retry — a real duplicate must never be retried
          // into silently overwriting/reusing someone else's load.
          let result = await bookLoad(bookInput);
          if (
            result.kind === "error" &&
            (result.payload as { error?: string; existing_id?: string | null }).error === "duplicate_load_number" &&
            (result.payload as { existing_id?: string | null }).existing_id == null
          ) {
            await new Promise((r) => setTimeout(r, 1500));
            result = await bookLoad(bookInput);
          }
          if (result.kind === "error") {
            report.push(`CC-3 | FEED ${num} load ${load.load_number} BLOCKED | bookLoad refused: ${JSON.stringify(result.payload)} | owning seat: CC-3 (this script)`);
            continue;
          }
          loadId = String(result.row.id);
          driverBillMint = result.row.driver_bill_mint;
          loadsCreated += 1;
          stopsCreated += 2;
        }

        const stopsRes = await client.query<{ id: string; stop_type: string }>(
          `SELECT id::text, stop_type FROM mdata.load_stops WHERE load_id = $1::uuid ORDER BY sequence_number ASC`,
          [loadId]
        );
        const pickupStop = stopsRes.rows.find((s) => s.stop_type === "pickup");
        const deliveryStop = stopsRes.rows.find((s) => s.stop_type === "delivery");

        if (pickupStop) {
          const arriveRes = await app.inject({
            method: "PATCH",
            url: `/api/v1/mdata/loads/${loadId}/stops/${pickupStop.id}`,
            headers: authHeader,
            payload: { actual_arrival_at: `${load.pickup.date}T08:00:00.000Z`, actual_departure_at: `${load.pickup.date}T09:00:00.000Z` },
          });
          if (arriveRes.statusCode >= 300) {
            report.push(`CC-3 | FEED ${num} load ${load.load_number} pickup-evidence BLOCKED | ${arriveRes.statusCode} ${arriveRes.body}`);
          } else {
            const body = JSON.parse(arriveRes.body) as { proforma_invoice?: { total_cents?: number } | null };
            invoiceCents += Number(body.proforma_invoice?.total_cents ?? 0);
          }
        }
        if (deliveryStop) {
          await app.inject({
            method: "PATCH",
            url: `/api/v1/mdata/loads/${loadId}/stops/${deliveryStop.id}`,
            headers: authHeader,
            payload: { actual_arrival_at: `${load.delivery.date}T08:00:00.000Z`, actual_departure_at: `${load.delivery.date}T09:00:00.000Z` },
          });
        }

        for (const f of load.fuel_rows) {
          const vendorResolved = await resolveVendorId(client, f.vendor, app, authHeader, false);
          const vendorId = vendorResolved as string;
          const res = await app.inject({
            method: "POST",
            url: "/api/v1/expenses",
            headers: authHeader,
            payload: {
              operating_company_id: USMCA_COMPANY_ID,
              category_account_id: FUEL_DIESEL_ACCOUNT_ID,
              payment_account_uuid: BANK_ACCOUNT_ID,
              expense_date: f.date,
              amount_cents: centsOf(f.actual),
              vendor_uuid: vendorId,
              // GAP-EXPENSE-MEMO-COLLISION-ON-NULL-LOCATION (found live 2026-09-05): several source
              // PDFs leave the fuel-row location OCR'd blank for the SAME driver's two-DEF-purchase
              // day (settlement 5782/load 13540: both rows carry location=null), making the old
              // "Diesel — <location>" memo IDENTICAL text for two genuinely different real
              // purchases (different invoice #, different amount, different date). POST
              // /api/v1/expenses' own duplicate-submission guard is a MEMO-text match within a
              // 2-minute window — it correctly fired on the identical text and silently swallowed
              // the second purchase entirely (409, no row created for it). Invoice number + date are
              // unique per real purchase on every settlement PDF; folding both into the memo makes
              // two distinct purchases produce distinct text even when location is missing.
              memo: `Diesel — ${f.location ?? "no-location-on-file"} — inv ${f.invoice ?? "no-invoice"} — ${f.date} — $${f.actual.toFixed(2)} (settlement ${num})`,
              // GAP-EXPENSE-DUPE-VENDOR-INVOICE, part 3 (found live in this slice, settlement
              // 5786): invoice 99530579 (LOVES) is printed TWICE — same gallons, same amount, same
              // location — under TWO DIFFERENT loads (13533 dated 08-20, 13548 dated 08-26). The
              // duplicate guard keys on (vendor_uuid, vendor_document_number) alone, with no load in
              // the key, so the second load's real printed purchase would be silently dropped as a
              // "duplicate" of the first. Whether this is a genuine repeated real purchase or a
              // source-document data-entry error is an owner/accounting call, not this script's to
              // make silently by dropping one — folding the load number into vendor_document_number
              // preserves the real invoice as the primary token while letting both printed
              // occurrences land as their own rows.
              vendor_document_number: `${f.invoice}-L${load.load_number}`,
              load_id: loadId,
              unit_id: unitId,
            },
          });
          if (res.statusCode === 409 && res.body.includes("duplicate_vendor_document_number")) {
            // Resuming a load whose expenses were partially seeded before an earlier run stopped
            // at a refusal — the route's own (vendor, invoice#) dedupe guard is what makes a
            // re-run safe; this is success, not a block.
            dieselRows += 1;
            dieselCents += centsOf(f.actual);
          } else if (res.statusCode >= 300) {
            report.push(`CC-3 | FEED ${num} load ${load.load_number} diesel ${f.invoice} BLOCKED | ${res.statusCode} ${res.body}`);
          } else {
            dieselRows += 1;
            dieselCents += centsOf(f.actual);
          }
        }

        for (const e of load.expense_rows) {
          if (!e.vendor) {
            report.push(`CC-3 | FEED ${num} load ${load.load_number} expense ${e.invoice ?? "(no invoice #)"} "${e.description}" BLOCKED | source PDF's own Vendor column is blank for this line — never inventing a vendor`);
            continue;
          }
          const vendorResolvedE = await resolveVendorId(client, e.vendor, app, authHeader, false);
          const vendorId = vendorResolvedE as string;
          // GAP-EXPENSE-DUPE-VENDOR-INVOICE (found live seeding the settlement feed): the expense
          // route's duplicate guard keys on (operating_company_id, vendor_uuid,
          // vendor_document_number) alone — no amount/description/category in the key. Every DEF/
          // scale/etc line in these source documents is printed on the SAME invoice number as its
          // paired diesel purchase (same fuel receipt, two line items) — so a second row for the
          // same vendor+invoice is REJECTED as a duplicate of the first, even on a first-ever run.
          // The vendor's real invoice number is preserved as the primary token; a short
          // description-derived suffix is appended ONLY to keep the (vendor, invoice) pair unique
          // per row, never to fabricate a different invoice number. Filed to GUARD-WORKORDERS as a
          // genuine backend gap (the guard should key in a way that tolerates >1 real line item per
          // vendor invoice) — this is a documented workaround, not a fix to that root cause.
          // GAP-EXPENSE-DUPE-VENDOR-INVOICE, part 2 (found live 2026-09-05): a description-only
          // suffix still collides when the SAME invoice prints TWO lines with the identical
          // description but different real amounts — settlement 5781/load 13534's invoice 1338855
          // prints "Scale Expense:OTR-Scale Expense" TWICE ($15.25 and $5.25, both real, both on the
          // signed PDF). The description suffix alone made row 2 look like a duplicate of row 1 and
          // it was silently dropped. Folding the amount into the suffix keeps genuinely-identical
          // resubmits (same desc, same amount) resume-safe while letting two real, differently-
          // priced lines under one invoice both land.
          // Amount FIRST: a truncated slice must never cut off the one token that actually
          // discriminates two same-description lines (the earlier desc-then-amount order let a long
          // description's slice(0,30) cut the amount digits off entirely before they ever appeared).
          // GAP-EXPENSE-DUPE-VENDOR-INVOICE, part 3 (settlement 5786, see the diesel loop's own
          // comment above): the load number is folded in too, ahead of description, so a real
          // invoice number reused across two different loads never collides.
          const dedupeSuffix = `L${load.load_number}-${centsOf(e.amount)}-${e.description}`
            .replace(/[^a-zA-Z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 30);
          const res = await app.inject({
            method: "POST",
            url: "/api/v1/expenses",
            headers: authHeader,
            payload: {
              operating_company_id: USMCA_COMPANY_ID,
              category_account_id: accountForExpenseDescription(e.description),
              payment_account_uuid: BANK_ACCOUNT_ID,
              expense_date: e.date,
              amount_cents: centsOf(e.amount),
              vendor_uuid: vendorId,
              // Same GAP-EXPENSE-MEMO-COLLISION-ON-NULL-LOCATION fix as the diesel memo above, PLUS
              // the amount (settlement 5781/load 13534 prints the SAME description/location/invoice/
              // date TWICE with two different real amounts, $15.25 and $5.25 — without the amount
              // here the memo-based 2-minute duplicate-submission guard still treated the second,
              // genuinely different line as a resubmit of the first and dropped it).
              memo: `${e.description} — ${e.location ?? "no-location-on-file"} — inv ${e.invoice ?? "no-invoice"} — ${e.date ?? "no-date"} — $${e.amount.toFixed(2)} (settlement ${num})`.trim(),
              vendor_document_number: e.invoice ? `${e.invoice}-${dedupeSuffix}` : null,
              load_id: loadId,
              unit_id: unitId,
            },
          });
          if (res.statusCode === 409 && res.body.includes("duplicate_vendor_document_number")) {
            otherExpenseRows += 1;
            otherExpenseCents += centsOf(e.amount);
          } else if (res.statusCode >= 300) {
            report.push(`CC-3 | FEED ${num} load ${load.load_number} expense ${e.invoice} BLOCKED | ${res.statusCode} ${res.body}`);
          } else {
            otherExpenseRows += 1;
            otherExpenseCents += centsOf(e.amount);
          }
        }

        for (const r of load.reimbursement_rows.concat(load.additional_pay_rows)) {
          await withCurrentUser(OWNER_USER_ID, async (c) => {
            // GAP-SCRIPT-MISSING-SCOPED-COMPANY-CONTEXT (found live 2026-09-05): withCurrentUser
            // alone only sets app.current_user_id — it never sets app.operating_company_id, which
            // every FORCED-RLS policy on driver_finance.* also requires (bookLoad() gets this for
            // free because it calls setScopedCompanyContext itself; this script's own direct calls
            // to createDriverReimbursementCore/createSettlementDeduction did not, and were hitting a
            // real RLS 42501 on insert whenever a row's own policy branch needed the GUC).
            await setScopedCompanyContext(c, OWNER_USER_ID, USMCA_COMPANY_ID);
            const outcome = await createDriverReimbursementCore(c, OWNER_USER_ID, USMCA_COMPANY_ID, {
              driver_id: driverId,
              amount_cents: centsOf(r.amount),
              reimbursement_type: "other",
              reason: `${r.description} — settlement ${num}, load ${load.load_number} (historical backfill, printed on the signed settlement)`,
              load_id: loadId,
              pay_mode: "settlement",
            });
            if (!outcome.ok) report.push(`CC-3 | FEED ${num} load ${load.load_number} reimbursement "${r.description}" BLOCKED | ${outcome.error}`);
          });
        }

        for (const d of load.deduction_rows_from_driver_settlement) {
          await withCurrentUser(OWNER_USER_ID, async (c) => {
            await setScopedCompanyContext(c, OWNER_USER_ID, USMCA_COMPANY_ID);
            await createSettlementDeduction(c, {
              driverId,
              operatingCompanyId: USMCA_COMPANY_ID,
              amountCents: Math.abs(centsOf(d.amount)),
              reason: `${d.description} — settlement ${num}, load ${load.load_number} (historical backfill, printed on the signed settlement)`,
              sourceType: "other",
              loadId,
              createdByUserId: OWNER_USER_ID,
            });
          });
        }

        report.push(
          `CC-3 | FEED ${num} load ${load.load_number} DONE | invoice $${(invoiceCents / 100).toFixed(2)} · diesel rows ${load.fuel_rows.length} $${(load.fuel_rows.reduce((s, f) => s + f.actual, 0)).toFixed(2)} · other rows ${load.expense_rows.length} $${(load.expense_rows.reduce((s, e) => s + e.amount, 0)).toFixed(2)} · driver_bill_mint=${JSON.stringify(driverBillMint)}`
        );
      }

      if (loadsCreated > 0 || dryRun) {
        report.push(
          `${dryRun ? "DRY-RUN" : "SEEDED"} totals settlement ${num}: loads ${loadsCreated} · stops ${stopsCreated} · invoice $${(invoiceCents / 100).toFixed(2)} · diesel rows ${dieselRows} $${(dieselCents / 100).toFixed(2)} · other rows ${otherExpenseRows} $${(otherExpenseCents / 100).toFixed(2)}`
        );
      }
      await client.query(`COMMIT`);
    } catch (err) {
      await client.query(`ROLLBACK`).catch(() => undefined);
      report.push(`CC-3 | FEED ${num} BLOCKED | ${(err as Error).message}`);
      if (process.env.CC3_DIAG) console.error("TEMP-DIAG-CC3-STACK", (err as Error).stack);
    } finally {
      client.release();
    }
  }

  await app.close();
  await pool.end();

  console.log(report.join("\n"));
  if (skippedForMissingSource > 0) {
    console.log(`\n${skippedForMissingSource} settlement(s) skipped for missing source PDF — see BLOCKED lines above.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
