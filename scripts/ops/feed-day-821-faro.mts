#!/usr/bin/env tsx
/**
 * E22 — Faro 8/21/26.
 * inv 23 S E Mares PO SEM66495 load 13535 $4900/adv 4753
 * inv 20 DEL-CAN PO 38484 load 13532 $1000/adv 970
 * inv 24 Prodigee PO 29852 load 13536 $4000/adv 3870
 * inv 22 DEL-CAN PO 38463 load 13534 $3100/adv 3007
 * STOP: inv 18 DARDINI PO 154067 — W.O. normalize → 0 matches.
 * Carry: inv15 DARDINI 154100 STOPPED; inv16 MPH MPHC261334 STOPPED.
 */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { bookLoad, type BookLoadInput } from "../../apps/backend/src/dispatch/book-load.service.js";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createHistoricalDriverBill } from "../../apps/backend/src/driver-finance/historical-driver-bill-backfill.service.js";
import { convertProformaToOfficial } from "../../apps/backend/src/accounting/proforma-convert.service.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerLoadRoutes } from "../../apps/backend/src/mdata/loads.routes.js";
import { registerExpenseRoutes } from "../../apps/backend/src/accounting/expenses.routes.js";
import { registerVendorRoutes } from "../../apps/backend/src/mdata/vendors.routes.js";
import invoicesPlugin from "../../apps/backend/src/accounting/invoices.routes.js";
import factoringAdvancesPlugin from "../../apps/backend/src/accounting/factoring-advances.routes.js";
import { registerFuelTransactionsRoutes } from "../../apps/backend/src/fuel/fuel-transactions.routes.js";
import { searchVendorsForAutocomplete } from "../../apps/backend/src/mdata/vendor-autocomplete.shared.js";
import { postLoadRevenueLatch } from "../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.js";
import { postReserveMovement } from "../../apps/backend/src/factoring/reserve.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const FARO_VENDOR = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4";
const BANK = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3";
const FUEL_ACCT = "353fbd5b-d39c-4709-ac19-60cae52018f7";
// E22: fuel payment account = Dreamline Diesel Card Payable (2510), never 1090 / never Bank 1000.
const DREAMLINE_PAY = "be1f70f8-fec4-463b-893d-dfc0acfe264d";
const RELAY_PAY = "5585dc64-dd7c-4314-b279-c9dd29c705fc";
const AMEX_PAY = "20b43ecc-6142-450e-8ea4-78d5b361df1e";
const APPLY = process.argv.includes("--apply");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function normalizeWo(raw: string): string {
  let s = String(raw ?? "").trim();
  if (s.startsWith("#")) s = s.slice(1).trim();
  s = s.replace(/^0+/, "") || "0";
  return s.toUpperCase();
}

type LoadSpec = {
  load_number: string;
  settlement_no: string;
  faro_inv: string;
  wo: string;
  at_wo: string;
  customer_id: string;
  driver_id: string;
  unit_id: string;
  trailer_id: string;
  driver_name: string;
  linehaul: number;
  driver_gross: number;
  loaded_miles: number;
  empty_miles: number;
  rate: number;
  pickup: { date: string; city: string; state: string; zip: string };
  delivery: { date: string; city: string; state: string; zip: string };
  fuel: Array<{ date: string; vendor: string; location: string; invoice: string; gallons: number; actual: number }>;
  expenses: Array<{ date: string; vendor: string; description: string; invoice: string; amount: number }>;
  reserve_pct: number;
  factor_fee_pct: number;
  expected_advance_cents: number;
  /** Optional one-way Internal Transfer OUT (cents) — Magna 180000 */
  reserve_out_cents?: number;
  notes?: string;
};

const LOADS: LoadSpec[] = [
  {
    load_number: "13535",
    settlement_no: "5783",
    faro_inv: "23",
    wo: "SEM66495",
    at_wo: "SEM66495",
    customer_id: "f406cfbc-bd3f-402b-b671-1fd39b6226c7", // S E Mares Forwarding Service LLC
    driver_id: "3e138476-06db-4b08-9ebe-527a5d8c591d", // Jorge Luis Infante Corona
    unit_id: "e15c43f8-3c61-4d1c-be67-05a489c3e622", // T177
    trailer_id: "985a5638-0b07-4ddb-9e48-4d96fcea2b2b", // FB-56704
    driver_name: "Jorge Luis Infante Corona",
    linehaul: 4900,
    driver_gross: 945.1, // miles only; tarp $50 stays on settlement
    loaded_miles: 1890.2,
    empty_miles: 0,
    rate: 0.5,
    pickup: { date: "2026-08-18", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-08-21", city: "Edison", state: "NJ", zip: "08817" },
    fuel: [
      { date: "2026-08-12", vendor: "LOVES", location: "21548FM471S NATALIA,TX", invoice: "99525008", gallons: 146.818, actual: 800.01 },
      { date: "2026-08-13", vendor: "LOVES", location: "10465LONESMOE PINE TRAIL M,TN", invoice: "99454237", gallons: 182.564, actual: 1075.12 },
    ],
    expenses: [
      { date: "2026-08-13", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99448116", amount: 41.35 },
      { date: "2026-08-19", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99525008-DEF", amount: 40.1 },
    ],
    reserve_pct: 1.5,
    factor_fee_pct: 1.5,
    expected_advance_cents: 475300,
  },
  {
    load_number: "13532",
    settlement_no: "5780",
    faro_inv: "20",
    wo: "38484",
    at_wo: "38484",
    customer_id: "a6693cb9-d41a-4d57-a3a8-188c9e5b29e6", // Del-Can Logistics LLC
    driver_id: "c864a4bb-a7ff-4373-a5e1-c1590eefe3b7", // Rafael Rogelio Rivero Reynoso (active)
    unit_id: "ea1b0fe4-1731-49ca-a50a-3363dfc76ae4", // T148
    trailer_id: "35456816-270b-4d45-8d4b-a0a846e0da6f", // 10376
    driver_name: "Rafael Rogelio Rivero Reynoso",
    linehaul: 1000,
    driver_gross: 150, // *Flat Rate on company settlement 5780
    loaded_miles: 150,
    empty_miles: 0,
    rate: 1.0,
    pickup: { date: "2026-08-20", city: "Palestine", state: "TX", zip: "75801" },
    delivery: { date: "2026-08-21", city: "Laredo", state: "TX", zip: "78045" },
    fuel: [],
    expenses: [
      { date: "2026-08-19", vendor: "TEN STAR TRUCKWASH", description: "Reefer Trailer-Washout Expense", invoice: "397322164", amount: 52 },
      { date: "2026-08-21", vendor: "SR FORWARDING,INC", description: "Warehouse-Lumper Fee Expense", invoice: "13532-LUMPER", amount: 120 },
    ],
    reserve_pct: 1.5,
    factor_fee_pct: 1.5,
    expected_advance_cents: 97000,
  },
  {
    load_number: "13536",
    settlement_no: "5784",
    faro_inv: "24",
    wo: "29852",
    at_wo: "29852",
    customer_id: "3ce1ab0c-61fc-4e24-bdca-61c80e40677d", // PRODIGEE LOGISTICS LLC
    driver_id: "45fac397-860e-4fe8-ae18-67e12e1959c1", // JOSE ANTONIO VICENTE MARTINEZ
    unit_id: "033dcdff-98c7-4b2e-8db3-2c94519dbc89", // T171
    trailer_id: "93a6f847-557f-462e-a0e6-64905631743b", // 10870
    driver_name: "JOSE ANTONIO VICENTE MARTINEZ",
    linehaul: 4000,
    driver_gross: 810.38, // 691.40 + 118.98
    loaded_miles: 1607.9,
    empty_miles: 276.7,
    rate: 0.43,
    pickup: { date: "2026-08-20", city: "Jonestown", state: "PA", zip: "17038" },
    delivery: { date: "2026-08-21", city: "Cuero", state: "TX", zip: "77954" },
    fuel: [
      { date: "2026-08-21", vendor: "LOVES", location: "STEELE STATION RD STEELE,AL", invoice: "99356279", gallons: 137.175, actual: 777.65 },
      { date: "2026-08-23", vendor: "LOVES", location: "P.OBOX 1201 LULING,TX", invoice: "99090868", gallons: 174.439, actual: 1002.85 },
    ],
    expenses: [
      { date: "2026-08-21", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99356279-DEF", amount: 28.26 },
      { date: "2026-08-23", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99090868-DEF", amount: 32.77 },
      { date: "2026-08-20", vendor: "BLUE BEACON", description: "Reefer Trailer-Washout Expense", invoice: "042328496", amount: 49.5 },
      { date: "2026-08-20", vendor: "BLUE BEACON", description: "Reefer Trailer-Washout Expense", invoice: "042172057", amount: 44.63 },
      { date: "2026-08-20", vendor: "LOVES", description: "OTR-Scale Expense", invoice: "1344032", amount: 15.25 },
    ],
    reserve_pct: 1.5,
    factor_fee_pct: ((60 + 10) / 4000) * 100,
    expected_advance_cents: 387000,
  },
  {
    load_number: "13534",
    settlement_no: "5781",
    faro_inv: "22",
    wo: "38463",
    at_wo: "38463",
    customer_id: "a6693cb9-d41a-4d57-a3a8-188c9e5b29e6", // Del-Can Logistics LLC
    driver_id: "5dd518ff-db91-429f-b651-a71b5f0db672", // Leonel Antonio Morales
    unit_id: "507921c7-ab1c-4fa7-bd7c-7f42552f7423", // T175
    trailer_id: "3c804758-1f9c-402a-b1e9-5eb6e2061001", // 10219
    driver_name: "Leonel Antonio Morales",
    linehaul: 3100,
    driver_gross: 652.42, // 626.27 + 26.15
    loaded_miles: 1391.7,
    empty_miles: 58.1,
    rate: 0.45,
    pickup: { date: "2026-08-19", city: "Marshville", state: "NC", zip: "28103" },
    delivery: { date: "2026-08-21", city: "Laredo", state: "TX", zip: "78045" },
    fuel: [
      { date: "2026-08-20", vendor: "LOVES", location: "66595WADSWORTH PKWY MANDEVILLE,LA", invoice: "99133290", gallons: 130.041, actual: 726.8 },
      { date: "2026-08-23", vendor: "LOVES", location: "2609NORTH BELTLINE HWY P,AL", invoice: "99913592", gallons: 50.006, actual: 292.49 },
    ],
    expenses: [
      { date: "2026-08-20", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99133290-DEF", amount: 24.59 },
      { date: "2026-08-20", vendor: "LOVES", description: "Fuel-Reefer Diesel", invoice: "99133290-REEFER", amount: 246.04 },
      { date: "2026-08-19", vendor: "LOVES", description: "Scale Expense:OTR-Scale Expense", invoice: "1338855-A", amount: 15.25 },
      { date: "2026-08-19", vendor: "LOVES", description: "Scale Expense:OTR-Scale Expense", invoice: "1338855-B", amount: 5.25 },
      { date: "2026-08-21", vendor: "PALOS GARZA", description: "Warehouse-Lumper Fee Expense", invoice: "13534-LUMPER", amount: 124.8 },
    ],
    reserve_pct: 1.5,
    factor_fee_pct: 1.5,
    expected_advance_cents: 300700,
  },
];

const auth = {
  "x-test-auth": Buffer.from(
    JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }),
    "utf8"
  ).toString("base64url"),
  "content-type": "application/json",
};

function cents(n: number) {
  return Math.round(n * 100);
}

async function resolveVendor(client: pg.PoolClient, name: string): Promise<string> {
  const rows = await searchVendorsForAutocomplete(client, {
    operating_company_id: USMCA,
    term: name,
    limit: 5,
    active_only: true,
  });
  const exact = rows.find((r) => r.display_name.toUpperCase() === name.toUpperCase());
  if (exact) return exact.id;
  if (rows[0]) return rows[0].id;
  throw new Error(`vendor_not_found ${name}`);
}

async function feedOne(
  LOAD: LoadSpec,
  app: Awaited<ReturnType<typeof createIntegrationApp>>,
  report: string[]
) {
  if (normalizeWo(LOAD.wo) !== normalizeWo(LOAD.at_wo)) {
    throw new Error(`WO_NORMALIZE_MISMATCH Faro ${LOAD.wo} vs AT ${LOAD.at_wo}`);
  }

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ n: number; wos: string }>(
      `SELECT count(*)::int AS n,
              coalesce(string_agg(load_number || ':' || customer_wo_number, ','), '') AS wos
         FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND soft_deleted_at IS NULL
          AND (
            customer_wo_number = $2
            OR regexp_replace(upper(trim(both from regexp_replace(coalesce(customer_wo_number,''), '^#', ''))), '^0+', '')
               = $3
          )`,
      [USMCA, LOAD.at_wo, normalizeWo(LOAD.wo)]
    );
    if (r.rows[0].n > 1) throw new Error(`WO_COLLISION >1: ${r.rows[0].wos}`);
    if (r.rows[0].n === 1 && !r.rows[0].wos.startsWith(LOAD.load_number + ":")) {
      throw new Error(`WO_COLLISION other load owns WO: ${r.rows[0].wos}`);
    }
    report.push(`WO_RESOLVE Faro ${LOAD.wo} ≡ AT ${LOAD.at_wo} → load ${LOAD.load_number} (n=${r.rows[0].n})`);
  });

  let loadId = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string }>(
      `SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2 AND soft_deleted_at IS NULL LIMIT 1`,
      [USMCA, LOAD.load_number]
    );
    return r.rows[0]?.id ?? null;
  });

  if (!loadId) {
    const bookInput: BookLoadInput = {
      requestingUserUuid: OWNER,
      requestingUserRole: "Owner",
      operating_company_id: USMCA,
      customer_id: LOAD.customer_id,
      status: "dispatched",
      trip_type: "NB",
      tour_id: randomUUID(),
      load_number: LOAD.load_number,
      requested_load_number: LOAD.load_number,
      customer_wo_number: LOAD.at_wo,
      is_sample_data: false,
      notes:
        LOAD.notes ??
        `AlwaysTrack seed — settlement ${LOAD.settlement_no} / Faro inv ${LOAD.faro_inv} / WO ${LOAD.at_wo}`,
      charges: [{ code: "linehaul", amount_cents: cents(LOAD.linehaul) }],
      stops: [
        {
          stop_type: "pickup",
          sequence_number: 1,
          city: LOAD.pickup.city,
          state: LOAD.pickup.state,
          postal_code: LOAD.pickup.zip,
          scheduled_arrival_at: `${LOAD.pickup.date}T12:00:00.000Z`,
          time_window_type: "appointment",
        },
        {
          stop_type: "delivery",
          sequence_number: 2,
          city: LOAD.delivery.city,
          state: LOAD.delivery.state,
          postal_code: LOAD.delivery.zip,
          scheduled_arrival_at: `${LOAD.delivery.date}T12:00:00.000Z`,
          time_window_type: "appointment",
        },
      ],
      save_mode: "book_dispatch",
      assigned_unit_id: LOAD.unit_id,
      assigned_trailer_unit_id: LOAD.trailer_id,
      // ROUND 145.2 — Faro vendor on load at creation.
      factoring_company_vendor_id: FARO_VENDOR,
      trailer_type: "dry_van",
      miles_practical: LOAD.loaded_miles + LOAD.empty_miles,
      miles_deadhead: LOAD.empty_miles,
      mileage_source: "History",
      override_reason: `Historical Faro 8/21 feed: load ${LOAD.load_number} (settlement ${LOAD.settlement_no})`,
      override_rules: [
        { rule_code: "WF-HOS-VIOLATION", reason: `Historical backfill load ${LOAD.load_number}` },
        { rule_code: "WF-MED-CARD-MISSING", reason: `Historical backfill load ${LOAD.load_number}`, subject: LOAD.driver_name },
      ],
    };
    let result = await bookLoad(bookInput);
    if (
      result.kind === "error" &&
      (result.payload as { error?: string; existing_id?: string | null }).error === "duplicate_load_number" &&
      (result.payload as { existing_id?: string | null }).existing_id == null
    ) {
      await new Promise((r) => setTimeout(r, 1500));
      result = await bookLoad(bookInput);
    }
    if (result.kind === "error") throw new Error(`bookLoad ${LOAD.load_number}: ${JSON.stringify(result.payload)}`);
    loadId = String(result.row.id);
    report.push(`LOAD created ${LOAD.load_number} id=${loadId}`);
  } else {
    report.push(`LOAD exists ${LOAD.load_number} id=${loadId}`);
  }

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(
      `UPDATE mdata.loads
          SET assigned_primary_driver_id=$1::uuid,
              customer_wo_number=$2,
              factoring_company_vendor_id = COALESCE(factoring_company_vendor_id, $3::uuid),
              updated_at=now()
        WHERE id=$4::uuid`,
      [LOAD.driver_id, LOAD.at_wo, FARO_VENDOR, loadId]
    );
  });

  const stops = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string; stop_type: string; actual_arrival_at: string | null }>(
      `SELECT id::text, stop_type, actual_arrival_at::text FROM mdata.load_stops WHERE load_id=$1::uuid ORDER BY sequence_number`,
      [loadId]
    );
    return r.rows;
  });
  for (const s of stops) {
    if (s.actual_arrival_at) continue;
    const spec = s.stop_type === "pickup" ? LOAD.pickup : LOAD.delivery;
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/loads/${loadId}/stops/${s.id}`,
      headers: auth,
      payload: {
        actual_arrival_at: `${spec.date}T08:00:00.000Z`,
        actual_departure_at: `${spec.date}T09:00:00.000Z`,
      },
    });
    report.push(`STOP ${LOAD.load_number} ${s.stop_type}: ${patch.statusCode}`);
    if (patch.statusCode >= 300) throw new Error(`stop: ${patch.body.slice(0, 300)}`);
  }

  let invoiceId = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(`UPDATE mdata.loads SET status='completed_docs_received', updated_at=now() WHERE id=$1::uuid`, [loadId]);
    const conv = await convertProformaToOfficial(c as never, {
      operatingCompanyId: USMCA,
      loadId,
      userId: OWNER,
    });
    report.push(`CONVERT ${LOAD.load_number} ${JSON.stringify(conv)}`);
    const r = await c.query<{ id: string; status: string }>(
      `SELECT id::text, status::text FROM accounting.invoices
        WHERE operating_company_id=$1::uuid AND source_load_id=$2::uuid AND voided_at IS NULL AND status<>'void' LIMIT 1`,
      [USMCA, loadId]
    );
    return r.rows[0] ?? null;
  });

  if (!invoiceId) {
    const fl = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/from-load?operating_company_id=${USMCA}`,
      headers: auth,
      payload: { load_id: loadId },
    });
    if (fl.statusCode >= 300) throw new Error(`from-load: ${fl.statusCode} ${fl.body.slice(0, 300)}`);
    invoiceId = { id: (JSON.parse(fl.body) as { id: string }).id, status: "draft" };
    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      await convertProformaToOfficial(c as never, { operatingCompanyId: USMCA, loadId, userId: OWNER });
    });
  }

  if (invoiceId.status !== "sent") {
    const sendRes = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/${invoiceId.id}/send?operating_company_id=${USMCA}`,
      headers: auth,
      payload: {},
    });
    report.push(`SEND ${LOAD.load_number} ${sendRes.statusCode}`);
    if (sendRes.statusCode >= 300) throw new Error(`send: ${sendRes.body.slice(0, 400)}`);
  }

  await postLoadRevenueLatch({
    operating_company_id: USMCA,
    load_id: loadId,
    target_status: "delivered_pending_docs",
    entry_date_iso: "2026-08-21",
    actor_user_id: OWNER,
  }).catch((e) => report.push(`WARN revrec1: ${(e as Error).message}`));
  await postLoadRevenueLatch({
    operating_company_id: USMCA,
    load_id: loadId,
    target_status: "completed_docs_received",
    entry_date_iso: "2026-08-21",
    actor_user_id: OWNER,
  }).catch((e) => report.push(`WARN revrec2: ${(e as Error).message}`));

  if (LOAD.driver_gross > 0 && LOAD.settlement_no !== "OPEN") {
    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const existing = await c.query<{ id: string }>(
        `SELECT id::text FROM driver_finance.driver_bills WHERE operating_company_id=$1::uuid AND load_id=$2::uuid LIMIT 1`,
        [USMCA, loadId]
      );
      if (existing.rows[0]) {
        report.push(`DRIVER_BILL exists ${existing.rows[0].id}`);
        return;
      }
      const bill = await createHistoricalDriverBill(c as never, {
        operating_company_id: USMCA,
        load_id: loadId,
        load_number: LOAD.load_number,
        driver_id: LOAD.driver_id,
        team_driver_id: null,
        gross_amount_cents: cents(LOAD.driver_gross),
        loaded_pay_cents: cents(LOAD.loaded_miles * LOAD.rate),
        deadhead_pay_cents: cents(LOAD.empty_miles * LOAD.rate),
        miles_basis: LOAD.loaded_miles,
        miles_basis_type: "practical",
        rate_per_mile_cents: cents(LOAD.rate),
        miles_deadhead: LOAD.empty_miles,
        rate_empty_per_mile_cents: cents(LOAD.rate),
        source_document_ref: LOAD.settlement_no,
        requesting_user_uuid: OWNER,
      });
      report.push(`DRIVER_BILL ${JSON.stringify(bill)}`);
      if (bill.outcome === "refused") throw new Error(bill.reason);
    });
  } else {
    report.push(`DRIVER_BILL skipped for ${LOAD.load_number} (outage / no signed pay)`);
  }

  const unitNumber = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ unit_number: string }>(
      `SELECT unit_number FROM mdata.units WHERE id = $1::uuid LIMIT 1`,
      [LOAD.unit_id]
    );
    return r.rows[0]?.unit_number ?? "UNIT";
  });

  // E22: every cost is an EXPENSE via the canonical writer — payment account = card rail.
  // AlwaysTrack merchant (LOVES/PILOT/FLYING) = Dreamline 2510. Never Bank 1000, never 1090, never a hand JE.
  for (const e of LOAD.expenses) {
    const vendorId = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      return resolveVendor(c as unknown as pg.PoolClient, e.vendor);
    });
    const dedupe = `${cents(e.amount)}-${e.invoice}`.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
    const payAcct = /reimbursement/i.test(e.description) ? DREAMLINE_PAY : DREAMLINE_PAY;
    const exp = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: auth,
      payload: {
        operating_company_id: USMCA,
        category_account_id: FUEL_ACCT,
        payment_account_uuid: payAcct,
        expense_date: e.date,
        amount_cents: cents(e.amount),
        vendor_uuid: vendorId,
        driver_id: LOAD.driver_id,
        memo: `${e.description} · load ${LOAD.load_number} · ${LOAD.driver_name} · ${unitNumber} · inv ${e.invoice} · $${e.amount.toFixed(2)} · Dreamline`,
        vendor_document_number: `${e.invoice}-${dedupe}`,
        load_id: loadId,
        unit_id: LOAD.unit_id,
        trailer_id: LOAD.trailer_id,
        expense_category_code: /def/i.test(e.description) ? "def" : "fuel",
      },
    });
    report.push(`EXPENSE ${e.invoice}: ${exp.statusCode}`);
    if (exp.statusCode >= 300 && !exp.body.includes("duplicate_vendor_document_number")) {
      throw new Error(`expense: ${exp.body.slice(0, 300)}`);
    }
  }

  for (const f of LOAD.fuel) {
    // Keep fuel.fuel_transactions for IFTA/linkage — but GL comes ONLY from the expense writer (E22).
    const { fuelId, vendorId } = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const vendorId = await resolveVendor(c as unknown as pg.PoolClient, f.vendor);
      const dreamline = await c.query<{ id: string }>(
        `SELECT id::text FROM catalogs.fuel_card_types
          WHERE operating_company_id = $1::uuid AND code = 'DREAMLINE' AND is_active IS TRUE
          LIMIT 1`,
        [USMCA]
      );
      const fuelCardId = dreamline.rows[0]?.id;
      if (!fuelCardId) throw new Error("catalogs.fuel_card_types DREAMLINE missing for USMCA — STOP (E22 unknown provider)");
      const rowHash = `alwaystrack:${USMCA}:${loadId}:${f.date}:${f.vendor}:${f.invoice}`;
      const ins = await c.query<{ id: string }>(
        `INSERT INTO fuel.fuel_transactions (
           operating_company_id, transaction_at, purchased_at, load_id, vendor_id, fuel_type,
           gallons, total_cost, location_city, transaction_reference, source, source_row_hash,
           fuel_card_id, unit_id, driver_id, trailer_id, created_by_user_id, updated_by_user_id
         ) VALUES ($1::uuid, $2::date, $2::date, $3::uuid, $4::uuid, 'diesel', $5, $6, $7, $8, 'import', $9,
                   $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $14::uuid)
         ON CONFLICT (operating_company_id, source_row_hash) DO UPDATE
           SET fuel_card_id = COALESCE(fuel.fuel_transactions.fuel_card_id, EXCLUDED.fuel_card_id),
               updated_at = now()
         RETURNING id::text`,
        [
          USMCA,
          f.date,
          loadId,
          vendorId,
          f.gallons,
          f.actual,
          f.location,
          f.invoice,
          rowHash,
          fuelCardId,
          LOAD.unit_id,
          LOAD.driver_id,
          LOAD.trailer_id,
          OWNER,
        ]
      );
      let id = ins.rows[0]?.id;
      if (!id) {
        const ex = await c.query<{ id: string }>(
          `SELECT id::text FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND source_row_hash=$2 LIMIT 1`,
          [USMCA, rowHash]
        );
        id = ex.rows[0]?.id;
        if (id) {
          await c.query(
            `UPDATE fuel.fuel_transactions SET fuel_card_id = COALESCE(fuel_card_id, $2::uuid), updated_at = now()
              WHERE id = $1::uuid`,
            [id, fuelCardId]
          );
        }
      }
      if (!id) throw new Error(`fuel insert failed ${f.invoice}`);
      return { fuelId: id, vendorId };
    });

    const memo = `Fuel · load ${LOAD.load_number} · ${LOAD.driver_name} · ${unitNumber} · ${f.gallons} gal · ${f.vendor} · Dreamline`;
    const dedupe = `fuel-${f.invoice}-${cents(f.actual)}`.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
    const exp = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: auth,
      payload: {
        operating_company_id: USMCA,
        category_account_id: FUEL_ACCT,
        payment_account_uuid: DREAMLINE_PAY,
        expense_date: f.date,
        amount_cents: cents(f.actual),
        vendor_uuid: vendorId,
        driver_id: LOAD.driver_id,
        memo,
        vendor_document_number: dedupe,
        load_id: loadId,
        unit_id: LOAD.unit_id,
        trailer_id: LOAD.trailer_id,
        source_fuel_transaction_id: fuelId,
        expense_category_code: "diesel",
      },
    });
    if (exp.statusCode >= 300 && !exp.body.includes("duplicate_vendor_document_number")) {
      throw new Error(`fuel expense ${f.invoice}: ${exp.statusCode} ${exp.body.slice(0, 300)}`);
    }
    const body = (() => {
      try {
        return JSON.parse(exp.body) as { expense_id?: string; posting_status?: string; posting_hold_reason?: string };
      } catch {
        return {};
      }
    })();
    report.push(
      `FUEL-EXPENSE ${f.invoice}: txn=${fuelId} exp=${body.expense_id ?? "?"} $${f.actual} ` +
        `post=${body.posting_status ?? "?"} hold=${body.posting_hold_reason ?? "none"}`
    );
  }

  report.push(`SETTLEMENT HOLD ${LOAD.settlement_no}: load ${LOAD.load_number} fed — NOT posting incomplete tour`);

  const alreadyAdv = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ display_id: string; advance_amount_cents: number }>(
      `SELECT fa.display_id, fa.advance_amount_cents::int
         FROM accounting.invoices inv
         JOIN accounting.factoring_advances fa ON fa.id = inv.factoring_advance_id
        WHERE inv.operating_company_id = $1::uuid
          AND inv.id = $2::uuid
          AND fa.status <> 'voided'
        LIMIT 1`,
      [USMCA, invoiceId.id]
    );
    return r.rows[0] ?? null;
  });
  if (alreadyAdv) {
    report.push(`ADVANCE exists ${alreadyAdv.display_id} $${(alreadyAdv.advance_amount_cents / 100).toFixed(2)}`);
  } else {
    const createRes = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/factoring-advances?operating_company_id=${USMCA}`,
      headers: auth,
      payload: {
        factoring_company_vendor_id: FARO_VENDOR,
        submission_batch_ref: `FARO-821-INV-${LOAD.faro_inv}`,
        invoice_ids: [invoiceId.id],
        reserve_pct: LOAD.reserve_pct,
        factor_fee_pct: LOAD.factor_fee_pct,
        notes: `Faro inv ${LOAD.faro_inv} WO ${LOAD.at_wo} — 08/21/2026`,
      },
    });
    if (createRes.statusCode >= 300) throw new Error(`factor create: ${createRes.statusCode} ${createRes.body.slice(0, 400)}`);
    const created = JSON.parse(createRes.body) as {
      id: string;
      display_id: string;
      advance_amount_cents: number;
      reserve_amount_cents: number;
      factor_fee_cents: number;
      invoice_total_cents: number;
    };
    const advRes = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/factoring-advances/${created.id}/advance?operating_company_id=${USMCA}`,
      headers: auth,
      payload: { advanced_at: "2026-08-21T18:00:00.000Z", notes: `Wire / Faro 08/21/26 inv ${LOAD.faro_inv}` },
    });
    report.push(
      `ADVANCE inv ${LOAD.faro_inv} load ${LOAD.load_number} → ${created.display_id} purchase $${(created.invoice_total_cents / 100).toFixed(2)} adv $${(created.advance_amount_cents / 100).toFixed(2)} (want ${(LOAD.expected_advance_cents / 100).toFixed(2)}) rsv $${(created.reserve_amount_cents / 100).toFixed(2)} fee $${(created.factor_fee_cents / 100).toFixed(2)} HTTP=${advRes.statusCode}`
    );
    if (advRes.statusCode >= 300) throw new Error(`advance: ${advRes.body.slice(0, 400)}`);
    if (created.advance_amount_cents !== LOAD.expected_advance_cents) {
      throw new Error(`advance cents mismatch got ${created.advance_amount_cents} want ${LOAD.expected_advance_cents}`);
    }
  }

  if (LOAD.reserve_out_cents && LOAD.reserve_out_cents > 0) {
    const reason = `E17.1 Faro Internal Transfer OUT to IH35 Reserves 08/17/26 inv ${LOAD.faro_inv} WO ${LOAD.at_wo} $${(LOAD.reserve_out_cents / 100).toFixed(2)}`;
    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const exists = await c.query<{ id: string }>(
        `SELECT id::text FROM factoring.reserve_movement WHERE operating_company_id=$1::uuid AND reason=$2 LIMIT 1`,
        [USMCA, reason]
      );
      if (exists.rows[0]) {
        report.push(`RESERVE_OUT already ${exists.rows[0].id}`);
        return;
      }
      const mv = await postReserveMovement(null, USMCA, "debit", LOAD.reserve_out_cents!, reason, {
        client: c as never,
        factorId: FARO_VENDOR,
      });
      report.push(`RESERVE_OUT ${mv.id} $${(LOAD.reserve_out_cents! / 100).toFixed(2)} (wire companion — not netted into advance)`);
    });
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (!APPLY) {
    for (const L of LOADS) {
      console.log(
        `DRY inv ${L.faro_inv} WO ${L.at_wo} load ${L.load_number} settl ${L.settlement_no} $${L.linehaul} → adv $${(L.expected_advance_cents / 100).toFixed(2)}${L.reserve_out_cents ? ` + reserve OUT $${(L.reserve_out_cents / 100).toFixed(2)}` : ""}`
      );
    }
    console.log("Control want: cum purchases $49675 · 18 inv fed (DARDINI15+MPH16+DARDINI18 STOPPED) · banking 1133");
    return;
  }

  const authId = process.env.E11_AUTH_ID ?? "";
  if (authId) {
    const authCheck = spawnSync("node", ["scripts/verify-owner-authorization.mjs", authId], {
      stdio: "inherit",
      cwd: ROOT,
    });
    if (authCheck.status !== 0) throw new Error(`verify-owner-authorization ${authId} failed`);
  } else if (process.env.E11_LEAD_AUTH !== "1") {
    throw new Error("set E11_AUTH_ID=AUTH-NNN or E11_LEAD_AUTH=1");
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerLoadRoutes(a);
    await registerExpenseRoutes(a);
    await registerVendorRoutes(a);
    await registerFuelTransactionsRoutes(a);
    await (invoicesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
    await (factoringAdvancesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
  });

  const report: string[] = [];
  report.push("EXCEPTION: inv18 DARDINI 154067 STOPPED (W.O. 0 matches). Carry inv15 DARDINI 154100 + inv16 MPH MPHC261334. Feeding 8/21 four feedable.");
  try {
    for (const L of LOADS) {
      report.push(`---- Faro inv ${L.faro_inv} ----`);
      await feedOne(L, app, report);
    }
  } finally {
    await app.close();
    await pool.end();
  }
  console.log(report.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
