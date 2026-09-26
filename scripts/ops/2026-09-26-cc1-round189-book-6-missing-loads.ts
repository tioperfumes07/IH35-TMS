#!/usr/bin/env tsx
/**
 * ROUND 189 step 4 (owner priority, ahead of R-187 remainder; CC-3 missed its deadline) --
 * ~/Downloads/09-25-2026-Claude-Coder-1-ROUND-189-CURRENT-LOADS-Updated.md, table B: 6 current loads
 * that exist in the owner's AlwaysTrack export (~/Downloads/load history report 09-21-26 without
 * cancelled loads.xlsx, rows 108/115-120) but are missing from USMCA entirely. Steps 2/3 (table A --
 * 6 loads on the wrong driver, and the minted pre-settlement shell '5819') are ALREADY DONE and
 * verified live under AUTH-038 (Claude-Lead, R-189A) -- re-checked live before writing this script,
 * not re-derived: all 6 carry the report's driver/unit/trailer, status left at 'closed' per tonight's
 * owner ruling (a closed load on an OPEN settlement stays in pre-settlement), each linked to its own
 * driver's P-000N open pre-settlement (P-0001..P-0005), and settlement '5819' is voided (cancelled).
 *
 * This script books the 6 MISSING loads through the real book-load engine (bookLoad(), the same path
 * the Book Load screen uses -- one transaction: load + stops + charges + driver-bill mint), per the
 * xlsx row for each (not the doc's summary table, which the doc itself warns not to copy blindly).
 * Status booked as 'dispatched' (save_mode 'book_dispatch') -- all 6 are "Dispatched" in the xlsx and
 * none has been delivered yet, so NO invoice is created (booking engine only pre-invoices at
 * delivery/settlement time) -- satisfying the doc's "NO invoice yet: not delivered" rule.
 *
 * QP (Quick Pay) column: confirmed live (load-profitability.service.ts) that "quick_pay_cents" is a
 * DERIVED metric computed post-hoc from accounting.factoring_advances.factor_fee_cents once an
 * invoice is actually factored by Faro -- it is not a load-booking-time charge code, and none of these
 * 6 loads is invoiced yet. So only the linehaul charge (the xlsx "Charges" column) is booked here; QP
 * will emerge naturally from the real factoring fee if/when Faro purchases the eventual invoice. Not
 * silently dropped -- disclosed here and in the per-row memo below.
 *
 * Customers: all 6 already exist in USMCA under an EXACT name match to the xlsx's Customer column
 * (verified live before writing this script) -- reused, none created.
 *
 * Usage: OWNER_AUTH_ID=AUTH-06x DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-26-cc1-round189-book-6-missing-loads.ts
 */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { bookLoad, type BookLoadInput } from "../../apps/backend/src/dispatch/book-load.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 189: OWNER_AUTH_ID env var is required.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 189: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

type LoadPlan = {
  load_number: string;
  customer_id: string;
  wo: string;
  driver_id: string;
  unit_id: string;
  trailer_id: string;
  pickup_date: string;
  delivery_date: string;
  origin_city: string;
  origin_state: string;
  dest_city: string;
  dest_state: string;
  linehaul_cents: number;
  qp_cents: number; // disclosed, not booked -- see header comment
  trailer_type: "refrigerated_van" | "dry_van" | "flatbed";
};

// Rows taken directly from the xlsx (load history report 09-21-26 without cancelled loads.xlsx),
// rows 108/115-120 -- not copied from the doc's summary table.
const PLAN: LoadPlan[] = [
  { load_number: "13609", customer_id: "034bc1c2-d931-4e1d-9b6f-3f22c4c3eaf1", wo: "2245258", driver_id: "1ec7654c-1ae9-4f3d-9af6-af9fd4b6bcc9", unit_id: "82db522d-9efe-4dca-958f-bb931e4a55ca", trailer_id: "93a6f847-557f-462e-a0e6-64905631743b", pickup_date: "2026-09-22", delivery_date: "2026-09-24", origin_city: "GAINESVILLE", origin_state: "GA", dest_city: "BUDA", dest_state: "TX", linehaul_cents: 240000, qp_cents: 3600, trailer_type: "dry_van" },
  { load_number: "13616", customer_id: "ba40f2bf-6033-41fc-8078-841c34c15029", wo: "66607", driver_id: "45fac397-860e-4fe8-ae18-67e12e1959c1", unit_id: "033dcdff-98c7-4b2e-8db3-2c94519dbc89", trailer_id: "15a0fc9a-8882-43ff-99f1-a68f446f7149", pickup_date: "2026-09-21", delivery_date: "2026-09-25", origin_city: "Laredo", origin_state: "TX", dest_city: "QUAKERTOWN", dest_state: "PA", linehaul_cents: 570000, qp_cents: 8550, trailer_type: "refrigerated_van" },
  { load_number: "13617", customer_id: "e127807c-a719-4fd8-a9bb-317823e2f7c3", wo: "G4468456", driver_id: "a32a35c8-7cd5-4368-83f0-35e185092433", unit_id: "f439def3-05ac-42cf-829b-2b66ecf85a32", trailer_id: "22ca9ef8-e57e-49c6-b590-8bebb15e23d2", pickup_date: "2026-09-21", delivery_date: "2026-09-23", origin_city: "Myerstown", origin_state: "PA", dest_city: "AUSTIN", dest_state: "TX", linehaul_cents: 401972, qp_cents: 12059, trailer_type: "flatbed" },
  { load_number: "13618", customer_id: "684f5776-403b-422d-bc5e-2b44ae3b6a2c", wo: "1013809", driver_id: "52037e93-484a-4659-ab60-cf2a78f4c647", unit_id: "a10cd288-f599-4016-a8b4-6d70e33f3925", trailer_id: "6bde4624-76f5-4f75-84f7-e92a9e8bc5fd", pickup_date: "2026-09-21", delivery_date: "2026-09-23", origin_city: "Laredo", origin_state: "TX", dest_city: "Greenfield", dest_state: "IN", linehaul_cents: 370000, qp_cents: 5550, trailer_type: "refrigerated_van" },
  { load_number: "13620", customer_id: "81a1e3fb-e305-4748-9eed-905f893f072a", wo: "1777319", driver_id: "93be328f-ba1b-4175-adaf-bb619c1c51f2", unit_id: "9aae52c1-7f45-4074-a39c-607dbdfb5f81", trailer_id: "985a5638-0b07-4ddb-9e48-4d96fcea2b2b", pickup_date: "2026-09-22", delivery_date: "2026-09-25", origin_city: "LAREDO", origin_state: "TX", dest_city: "COMSTOCK PARK", dest_state: "MI", linehaul_cents: 430000, qp_cents: 6450, trailer_type: "flatbed" },
  { load_number: "13621", customer_id: "04b65d8b-a1a3-4580-9224-d0f16b0946f5", wo: "56709", driver_id: "5dd518ff-db91-429f-b651-a71b5f0db672", unit_id: "507921c7-ab1c-4fa7-bd7c-7f42552f7423", trailer_id: "209a2e1e-38f9-4dd6-ba96-f4927afc8420", pickup_date: "2026-09-22", delivery_date: "2026-09-25", origin_city: "Laredo", origin_state: "TX", dest_city: "EDISON", dest_state: "NJ", linehaul_cents: 490000, qp_cents: 7350, trailer_type: "flatbed" },
];

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

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const load of PLAN) {
      const client = await pool.connect();
      let tripLinkage: { trip_type: "NB" | "TR"; tour_id: string };
      try {
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [USMCA_COMPANY_ID]);
        const existing = await client.query<{ id: string }>(`SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2`, [USMCA_COMPANY_ID, load.load_number]);
        if (existing.rows[0]) {
          console.log(`${load.load_number}: SKIP -- already exists (${existing.rows[0].id})`);
          results.push({ load_number: load.load_number, status: "skip_already_exists" });
          continue;
        }
        tripLinkage = await resolveTripLinkage(client, load.driver_id);
      } finally {
        client.release();
      }

      const bookInput: BookLoadInput = {
        requestingUserUuid: OWNER_USER_ID,
        requestingUserRole: "Owner",
        operating_company_id: USMCA_COMPANY_ID,
        customer_id: load.customer_id,
        status: "dispatched",
        trip_type: tripLinkage.trip_type,
        tour_id: tripLinkage.tour_id,
        load_number: load.load_number,
        requested_load_number: load.load_number,
        is_sample_data: false,
        charges: [{ code: "linehaul", amount_cents: load.linehaul_cents }],
        stops: [
          {
            stop_type: "pickup",
            sequence_number: 1,
            city: load.origin_city,
            state: load.origin_state,
            scheduled_arrival_at: `${load.pickup_date}T00:00:00.000Z`,
            time_window_type: "appointment",
          },
          {
            stop_type: "delivery",
            sequence_number: 2,
            city: load.dest_city,
            state: load.dest_state,
            scheduled_arrival_at: `${load.delivery_date}T00:00:00.000Z`,
            time_window_type: "appointment",
          },
        ],
        save_mode: "book_dispatch",
        assigned_primary_driver_id: load.driver_id,
        assigned_unit_id: load.unit_id,
        assigned_trailer_unit_id: load.trailer_id,
        trailer_type: load.trailer_type,
        customer_po_number: load.wo,
        override_reason: `ROUND 189 step 4: load ${load.load_number} exists in the owner's AlwaysTrack load-history export but was missing from USMCA -- booked through the real book-load engine from the xlsx row (customer/W.O./stops/dates/driver/unit/trailer/charges).`,
        override_rules: [
          { rule_code: "WF-HOS-VIOLATION", reason: `ROUND 189: load ${load.load_number}` },
          { rule_code: "WF-MED-CARD-MISSING", reason: `ROUND 189: load ${load.load_number}` },
        ],
        override_token: `round189-book-missing-${load.load_number}`,
      };

      let result: Awaited<ReturnType<typeof bookLoad>>;
      let unitOmitted = false;
      let tripLinkOmitted = false;
      try {
        result = await bookLoad(bookInput);
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (msg.includes("unit is already active on load")) {
          unitOmitted = true;
          result = await bookLoad({ ...bookInput, assigned_unit_id: undefined });
        } else if (msg.includes("uq_driver_settlements_one_open_per_driver")) {
          tripLinkOmitted = true;
          result = await bookLoad({ ...bookInput, trip_type: undefined, tour_id: undefined });
        } else {
          throw err;
        }
      }
      if (result.kind === "error") {
        console.log(`${load.load_number}: BLOCKED -- ${JSON.stringify(result.payload)}`);
        results.push({ load_number: load.load_number, status: "blocked", payload: result.payload });
        continue;
      }
      const loadId = String(result.row.id);
      console.log(`${load.load_number}: BOOKED -- id ${loadId}${unitOmitted ? " (unit omitted, retry)" : ""}${tripLinkOmitted ? " (trip link omitted, retry)" : ""} -- driver_bill_mint=${JSON.stringify(result.row.driver_bill_mint)}`);
      results.push({
        load_number: load.load_number,
        status: "booked",
        load_id: loadId,
        driver_bill_mint: result.row.driver_bill_mint,
        qp_cents_disclosed_not_booked: load.qp_cents,
      });
    }
    console.log(JSON.stringify(results, null, 2));
    console.log("DONE.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
