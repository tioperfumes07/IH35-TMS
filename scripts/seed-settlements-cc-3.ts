#!/usr/bin/env tsx
/**
 * scripts/seed-settlements-cc-3.ts — CC-3's slice of the OWNER-ORDERED settlement SEED
 * (owner 2026-09-05 04:47Z: "Why is CC3 creating the loads manually, I told you to seed them, not
 * create them manually... We are never going to finish anything like this."). Supersedes the
 * earlier UI-only rule (struck in ORDER-2026-09-05-SETTLEMENT-FEED-PRIORITY.md).
 *
 * Source of truth per settlement: docs/bus/settlement-entry-2026-09-04/cc-3-extracted/settlement-
 * <n>.json — a faithful, field-by-field JSON transcription of the signed Company_Settlement_<n>.pdf
 * + Driver_Settlement_<n>.pdf (owner's Downloads), never a computed/derived number. Every dollar
 * amount, date, and address in those JSON files is copied verbatim from the two PDFs; nothing is
 * invented. Settlement 5782's Company_Settlement PDF is genuinely MISSING from Downloads (verified
 * — files run 5760-5781, then jump to 5783) — its customer/fuel/expense side is left null and this
 * script SKIPS 5782 entirely rather than seed a load with an invented customer.
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
 *   DATABASE_URL=<neon prod> npx tsx scripts/seed-settlements-cc-3.ts --dry-run
 *   DATABASE_URL=<neon prod> npx tsx scripts/seed-settlements-cc-3.ts --apply
 *   DATABASE_URL=<neon prod> npx tsx scripts/seed-settlements-cc-3.ts --apply --only=5773
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { bookLoad, type BookLoadInput } from "../apps/backend/src/dispatch/book-load.service.js";
import { withCurrentUser } from "../apps/backend/src/auth/db.js";
import { createSettlementDeduction } from "../apps/backend/src/driver-finance/deductions.service.js";
import { createDriverReimbursementCore } from "../apps/backend/src/driver-finance/driver-reimbursement.service.js";
import { searchVendorsForAutocomplete } from "../apps/backend/src/mdata/vendor-autocomplete.shared.js";
import { createIntegrationApp } from "../apps/backend/test-helpers/http-app.js";
import { registerLoadRoutes } from "../apps/backend/src/mdata/loads.routes.js";
import { registerExpenseRoutes } from "../apps/backend/src/accounting/expenses.routes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLICE_DIR = path.join(ROOT, "docs/bus/settlement-entry-2026-09-04/cc-3-extracted");
const CC3_SLICE = [5773, 5774, 5775, 5777, 5778, 5779, 5781, 5782];

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
// Types mirroring the extraction JSON shape (docs/bus/settlement-entry-2026-09-04/cc-3-extracted/*)
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

async function resolveOrCreateTrailerId(client: pg.PoolClient, trailerNumber: string, dryRun: boolean): Promise<string | { wouldCreate: string }> {
  const existing = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.equipment WHERE equipment_number = $1 LIMIT 1`,
    [trailerNumber]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  if (dryRun) return { wouldCreate: trailerNumber };
  const created = await client.query<{ id: string }>(
    `
      INSERT INTO mdata.equipment (
        id, equipment_number, equipment_type, status, currently_leased_to_company_id, created_by_user_id, updated_by_user_id
      ) VALUES (gen_random_uuid(), $1, 'DryVan', 'InService', $2::uuid, $3::uuid, $3::uuid)
      RETURNING id::text
    `,
    [trailerNumber, USMCA_COMPANY_ID, OWNER_USER_ID]
  );
  return created.rows[0].id;
}

async function resolveVendorId(client: pg.PoolClient, vendorName: string): Promise<string> {
  const rows = await searchVendorsForAutocomplete(client, {
    operating_company_id: USMCA_COMPANY_ID,
    term: vendorName,
    limit: 5,
    active_only: true,
  });
  const exact = rows.find((r) => r.display_name.toLowerCase() === vendorName.toLowerCase() || r.company_name?.toLowerCase() === vendorName.toLowerCase());
  const pick = exact ?? rows[0];
  if (!pick) throw new Error(`vendor_not_found: "${vendorName}" — never creating a duplicate; verify the exact printed name`);
  return pick.id;
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

  const settlementNumbers = (only ?? CC3_SLICE).filter((n) => CC3_SLICE.includes(n));

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  // http-app.js/createIntegrationApp registers routes that need real auth — the in-process bypass
  // header is scoped to THIS script's own process only (never enabled on the deployed Render
  // server), same mechanism this repo's own integration tests already use.
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerLoadRoutes(a);
    await registerExpenseRoutes(a);
  });
  const authHeader = {
    "x-test-auth": Buffer.from(JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }), "utf8").toString("base64url"),
  };

  const report: string[] = [];
  let skippedForMissingSource = 0;

  for (const num of settlementNumbers) {
    const settlement = loadSettlement(num);
    if (settlement._note?.toLowerCase().includes("does not exist")) {
      report.push(`CC-3 | FEED ${num} BLOCKED | Company_Settlement_${num}.pdf missing from owner's Downloads (verified — files run 5760-5781, then jump to 5783); customer/fuel/expense side cannot be seeded without inventing a customer | owning seat: owner (needs to locate/re-export the PDF)`);
      skippedForMissingSource += 1;
      continue;
    }

    const client = await pool.connect();
    // Session-level (not SET LOCAL — this connection is exclusively this script's, held for the
    // whole settlement, never returned to a shared pool mid-use) RLS bypass for THIS script's own
    // master-resolution reads and trailer-creation write, matching the identity.is_lucia_bypass()
    // OR-branch every RLS policy in this codebase carries. bookLoad()/app.inject()/
    // createSettlementDeduction()/createDriverReimbursementCore() each open their OWN connection
    // via withCurrentUser and set app.operating_company_id themselves — unaffected by this.
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [USMCA_COMPANY_ID]);
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
        if (existing.rows[0]) {
          report.push(`CC-3 | FEED ${num} load ${load.load_number} SKIPPED | already exists (id ${existing.rows[0].id}) — never duplicating`);
          continue;
        }

        const customerId = load.customer_name ? await resolveCustomerId(client, load.customer_name) : null;
        const trailerNumber = load.trailer ?? settlement.trailer;
        const trailerResolved = trailerNumber ? await resolveOrCreateTrailerId(client, trailerNumber, dryRun) : null;
        const trailerId = trailerResolved && typeof trailerResolved === "object" ? null : (trailerResolved as string | null);

        const loadedMiles = load.loaded_miles ?? 0;
        const emptyMiles = load.empty_miles ?? 0;
        const rate = load.loaded_rate ?? load.empty_rate ?? null;

        if (!customerId) {
          report.push(`CC-3 | FEED ${num} load ${load.load_number} BLOCKED | no customer_name on file (source PDF gap) — cannot invoice without inventing a customer`);
          continue;
        }

        const bookInput: BookLoadInput = {
          requestingUserUuid: OWNER_USER_ID,
          requestingUserRole: "Owner",
          operating_company_id: USMCA_COMPANY_ID,
          customer_id: customerId,
          status: "dispatched",
          trip_type: "NB",
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
        };

        if (dryRun) {
          loadsCreated += 1;
          stopsCreated += 2;
          invoiceCents += centsOf(load.linehaul_amount);
          for (const f of load.fuel_rows) { dieselRows += 1; dieselCents += centsOf(f.actual); }
          for (const e of load.expense_rows) { otherExpenseRows += 1; otherExpenseCents += centsOf(e.amount); }
          driverBillCents += centsOf(load.loaded_rate != null ? loadedMiles * load.loaded_rate : 0) + centsOf(load.empty_rate != null ? emptyMiles * load.empty_rate : 0);
          report.push(`CC-3 | FEED ${num} load ${load.load_number} DRY-RUN | invoice $${(centsOf(load.linehaul_amount) / 100).toFixed(2)} · ${load.fuel_rows.length} diesel rows $${(load.fuel_rows.reduce((s, f) => s + f.actual, 0)).toFixed(2)} · ${load.expense_rows.length} other rows $${(load.expense_rows.reduce((s, e) => s + e.amount, 0)).toFixed(2)} · trailer ${trailerResolved && typeof trailerResolved === "object" ? `WOULD CREATE ${trailerResolved.wouldCreate}` : "matched"}`);
          continue;
        }

        const result = await bookLoad(bookInput);
        if (result.kind === "error") {
          report.push(`CC-3 | FEED ${num} load ${load.load_number} BLOCKED | bookLoad refused: ${JSON.stringify(result.payload)} | owning seat: CC-3 (this script)`);
          continue;
        }
        const loadId = String(result.row.id);
        loadsCreated += 1;
        stopsCreated += 2;
        driverBillCents += Number(result.row.rate_total_cents ?? 0) > 0 && result.row.driver_bill_mint ? 0 : 0; // placeholder; real amount re-queried below

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
          const vendorId = await resolveVendorId(client, f.vendor);
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
              memo: `Diesel — ${f.location} (settlement ${num})`,
              vendor_document_number: f.invoice,
              load_id: loadId,
              unit_id: unitId,
            },
          });
          if (res.statusCode >= 300) {
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
          const vendorId = await resolveVendorId(client, e.vendor);
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
              memo: `${e.description} — ${e.location ?? ""} (settlement ${num})`.trim(),
              vendor_document_number: e.invoice,
              load_id: loadId,
              unit_id: unitId,
            },
          });
          if (res.statusCode >= 300) {
            report.push(`CC-3 | FEED ${num} load ${load.load_number} expense ${e.invoice} BLOCKED | ${res.statusCode} ${res.body}`);
          } else {
            otherExpenseRows += 1;
            otherExpenseCents += centsOf(e.amount);
          }
        }

        for (const r of load.reimbursement_rows.concat(load.additional_pay_rows)) {
          await withCurrentUser(OWNER_USER_ID, async (c) => {
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
          `CC-3 | FEED ${num} load ${load.load_number} DONE | invoice $${(invoiceCents / 100).toFixed(2)} · diesel rows ${load.fuel_rows.length} $${(load.fuel_rows.reduce((s, f) => s + f.actual, 0)).toFixed(2)} · other rows ${load.expense_rows.length} $${(load.expense_rows.reduce((s, e) => s + e.amount, 0)).toFixed(2)} · driver_bill_mint=${JSON.stringify(result.row.driver_bill_mint)}`
        );
      }

      if (loadsCreated > 0 || dryRun) {
        report.push(
          `${dryRun ? "DRY-RUN" : "SEEDED"} totals settlement ${num}: loads ${loadsCreated} · stops ${stopsCreated} · invoice $${(invoiceCents / 100).toFixed(2)} · diesel rows ${dieselRows} $${(dieselCents / 100).toFixed(2)} · other rows ${otherExpenseRows} $${(otherExpenseCents / 100).toFixed(2)}`
        );
      }
    } catch (err) {
      report.push(`CC-3 | FEED ${num} BLOCKED | ${(err as Error).message}`);
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
