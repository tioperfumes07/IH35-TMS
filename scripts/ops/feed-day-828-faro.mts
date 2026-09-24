#!/usr/bin/env tsx
/**
 * E22 — Faro 8/28/26 — 8 invoices / $26,900.
 * inv33 MPH 1000052→13548 · inv36 Hummingbird 488→13565 · inv35 Mares SMX14603→13550
 * inv31 Jerue 20348564→13546 · inv34 R2X 314828→13549 · inv29 Simple 196203→13542
 * inv32 Jerue 20348480→13545 · inv30 Jerue 20348212→13547
 * Carry STOPPED: DARDINI15/18 + MPH16.
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
const PURCHASE_DAY = "2026-08-28";
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
    load_number: "13548", settlement_no: "5786", faro_inv: "33", wo: "1000052", at_wo: "1000052",
    customer_id: "a760ee40-ad82-4bb5-9120-4d0766b46297",
    driver_id: "424a3bb9-60c2-4f16-8d9c-afa6be475ad7",
    unit_id: "181b5c93-8bcf-4155-8a2e-ebc86f2a34e1",
    trailer_id: "fc534b3d-9807-4d8a-ad1e-57498fbace3a",
    driver_name: "Concepcion Cordova Dominguez",
    linehaul: 2300, driver_gross: 538.83, loaded_miles: 1043.4, empty_miles: 154, rate: 0.45,
    pickup: { date: "2026-08-25", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-08-28", city: "Dallas", state: "TX", zip: "75201" },
    fuel: [
      { date: "2026-08-25", vendor: "LOVES", location: "7561MESOPOTAMIA", invoice: "99906385", gallons: 113.21, actual: 644.05 },
      { date: "2026-08-26", vendor: "LOVES", location: "21548FM471S NATALIA,TX", invoice: "99530579", gallons: 92.018, actual: 510.61 },
    ],
    expenses: [],
    reserve_pct: 1.5, factor_fee_pct: (44.5/2300)*100, expected_advance_cents: 222100,
  },
  {
    load_number: "13565", settlement_no: "5793", faro_inv: "36", wo: "488", at_wo: "488",
    customer_id: "b5166208-3415-4284-baca-8eb5dcae1777",
    driver_id: "a32a35c8-7cd5-4368-83f0-35e185092433",
    unit_id: "f439def3-05ac-42cf-829b-2b66ecf85a32",
    trailer_id: "2667bc9e-0f9f-4f6e-a689-0990299ab062",
    driver_name: "Neftali Coronado Urbano",
    linehaul: 4000, driver_gross: 742.6, loaded_miles: 1485.2, empty_miles: 0, rate: 0.5,
    pickup: { date: "2026-08-25", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-08-28", city: "Atlanta", state: "GA", zip: "30301" },
    fuel: [
      { date: "2026-08-25", vendor: "LOVES", location: "101 PINNACLE ROAD", invoice: "1922974", gallons: 50, actual: 279.45 },
      { date: "2026-08-26", vendor: "LOVES", location: "21548FM471SNATALIA,TX", invoice: "99530122", gallons: 172.491, actual: 957.15 },
      { date: "2026-08-27", vendor: "LOVES", location: "LOVES 453, LA", invoice: "99349841", gallons: 126.529, actual: 643.91 },
    ],
    expenses: [],
    reserve_pct: 1.5, factor_fee_pct: 1.5, expected_advance_cents: 388000,
  },
  {
    load_number: "13550", settlement_no: "5789", faro_inv: "35", wo: "SMX14603", at_wo: "SMX14603",
    customer_id: "f406cfbc-bd3f-402b-b671-1fd39b6226c7",
    driver_id: "3e138476-06db-4b08-9ebe-527a5d8c591d",
    unit_id: "e15c43f8-3c61-4d1c-be67-05a489c3e622",
    trailer_id: "2f38c09a-7915-4d83-9557-c523e39df7a6",
    driver_name: "Jorge Luis Infante Corona",
    linehaul: 4900, driver_gross: 945.1, loaded_miles: 1890.2, empty_miles: 0, rate: 0.5,
    pickup: { date: "2026-08-26", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-08-28", city: "Edison", state: "NJ", zip: "08817" },
    fuel: [
      { date: "2026-08-26", vendor: "LOVES", location: "2024A WEST STREET", invoice: "99600966", gallons: 41.036, actual: 225.25 },
      { date: "2026-08-26", vendor: "LOVES", location: "21548FM471S NATALIA,TX", invoice: "99530124", gallons: 157.367, actual: 873.23 },
      { date: "2026-08-27", vendor: "LOVES", location: "10465LONESOME PINE", invoice: "99460605", gallons: 148.502, actual: 855.22 },
    ],
    expenses: [],
    reserve_pct: 1.5, factor_fee_pct: 1.5, expected_advance_cents: 475300,
  },
  {
    load_number: "13546", settlement_no: "5788", faro_inv: "31", wo: "20348564", at_wo: "20348564",
    customer_id: "3b3c53de-9c6a-431d-92ca-17d379ccbd8a",
    driver_id: "fba21d80-628b-4228-ae54-336f9cbb73b6",
    unit_id: "a10cd288-f599-4016-a8b4-6d70e33f3925",
    trailer_id: "3c804758-1f9c-402a-b1e9-5eb6e2061001",
    driver_name: "ANGEL ALFONSO SOSA",
    linehaul: 1100, driver_gross: 369.86, loaded_miles: 750.5, empty_miles: 71.4, rate: 0.45,
    pickup: { date: "2026-08-25", city: "Fort Pierce", state: "FL", zip: "34945" },
    delivery: { date: "2026-08-28", city: "Laredo", state: "TX", zip: "78045" },
    fuel: [
      { date: "2026-08-25", vendor: "LOVES", location: "200 S Kings Hwy", invoice: "99579121", gallons: 90.75, actual: 503.57 },
      { date: "2026-08-26", vendor: "LOVES", location: "200 S Kings Hwy", invoice: "99579865", gallons: 48, actual: 268.27 },
      { date: "2026-08-26", vendor: "LOVES", location: "200 S Kings Hwy", invoice: "13546-FUEL3", gallons: 115.24, actual: 624.6 },
    ],
    expenses: [],
    reserve_pct: 1.5, factor_fee_pct: 1.5, expected_advance_cents: 106700,
  },
  {
    load_number: "13549", settlement_no: "5787", faro_inv: "34", wo: "314828", at_wo: "314828",
    customer_id: "66870aae-6255-4e6a-95aa-386146ee76e6",
    driver_id: "dcd683f5-b8a1-46a8-aa6b-093732e70b92",
    unit_id: "478d9f14-b2fd-4cea-a51e-76ec30c39ec7",
    trailer_id: "ee474fe0-126a-4cee-8675-93af67861ca7",
    driver_name: "ALFONSO HIDALGO CHAVEZ",
    linehaul: 1000, driver_gross: 569.57, loaded_miles: 745.5, empty_miles: 520.2, rate: 0.45,
    pickup: { date: "2026-08-22", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-08-28", city: "Houston", state: "TX", zip: "77001" },
    fuel: [
      { date: "2026-08-26", vendor: "LOVES", location: "239BYKIN DRIVE", invoice: "1515248", gallons: 127.239, actual: 736.59 },
    ],
    expenses: [],
    reserve_pct: 1.5, factor_fee_pct: 1.5, expected_advance_cents: 97000,
  },
  {
    load_number: "13542", settlement_no: "5790", faro_inv: "29", wo: "196203", at_wo: "196203",
    customer_id: "a87089e7-033c-4a86-b914-f7b8769b22e2",
    driver_id: "5dd518ff-db91-429f-b651-a71b5f0db672",
    unit_id: "507921c7-ab1c-4fa7-bd7c-7f42552f7423",
    trailer_id: "985a5638-0b07-4ddb-9e48-4d96fcea2b2b",
    driver_name: "Leonel Antonio Morales",
    linehaul: 4000, driver_gross: 751.05, loaded_miles: 1502.1, empty_miles: 0, rate: 0.5,
    pickup: { date: "2026-08-25", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-08-28", city: "Morrisville", state: "NC", zip: "27560" },
    fuel: [
      { date: "2026-08-23", vendor: "LOVES", location: "101 PINNACLE ROAD", invoice: "99988777", gallons: 100.558, actual: 578.11 },
      { date: "2026-08-26", vendor: "LOVES", location: "21548FM471S NATALIA,TX", invoice: "99530096", gallons: 184.001, actual: 1021.02 },
      { date: "2026-08-26", vendor: "LOVES", location: "2024A WEST STREET", invoice: "99600926", gallons: 49.091, actual: 269.46 },
    ],
    expenses: [
      { date: "2026-08-22", vendor: "DTOPS", description: "OTR-Mexico Tolls & Intl Bridge", invoice: "13542-TOLL", amount: 20.8 },
      { date: "2026-08-23", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99988783", amount: 44.26 },
      { date: "2026-08-26", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99530096-DEF", amount: 40.91 },
    ],
    reserve_pct: 1.5, factor_fee_pct: 1.5, expected_advance_cents: 388000,
  },
  {
    load_number: "13545", settlement_no: "5791", faro_inv: "32", wo: "20348480", at_wo: "20348480",
    customer_id: "3b3c53de-9c6a-431d-92ca-17d379ccbd8a",
    driver_id: "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
    unit_id: "82db522d-9efe-4dca-958f-bb931e4a55ca",
    trailer_id: "5fae4441-6ec3-4599-a5e0-9c14e6f8becf",
    driver_name: "HUGO GAYTAN",
    linehaul: 4800, driver_gross: 819.05, loaded_miles: 1820.1, empty_miles: 0, rate: 0.45,
    pickup: { date: "2026-08-25", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-08-28", city: "Chicago", state: "IL", zip: "60601" },
    fuel: [
      { date: "2026-08-26", vendor: "LOVES", location: "21548FM471S NATALIA,TX", invoice: "99530416", gallons: 96.953, actual: 537.99 },
      { date: "2026-08-26", vendor: "LOVES", location: "7495SMITH ROAD, TX", invoice: "99610138", gallons: 101.999, actual: 559.87 },
      { date: "2026-08-28", vendor: "LOVES", location: "10465LONESOME PINE", invoice: "99461047", gallons: 160.235, actual: 921.19 },
    ],
    expenses: [],
    reserve_pct: 1.5, factor_fee_pct: 1.5, expected_advance_cents: 465600,
  },
  {
    load_number: "13547", settlement_no: "5792", faro_inv: "30", wo: "20348212", at_wo: "20348212",
    customer_id: "3b3c53de-9c6a-431d-92ca-17d379ccbd8a",
    driver_id: "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
    unit_id: "19d29860-9753-4376-93c4-dc963cc86483",
    trailer_id: "93a6f847-557f-462e-a0e6-64905631743b",
    driver_name: "GENARO GUERRERO CHAVEZ",
    linehaul: 4800, driver_gross: 819.05, loaded_miles: 1820.1, empty_miles: 0, rate: 0.45,
    pickup: { date: "2026-08-26", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-08-28", city: "Chicago", state: "IL", zip: "60601" },
    fuel: [
      { date: "2026-08-26", vendor: "LOVES", location: "21548FM471S NATALIA,TX", invoice: "1848853", gallons: 105.489, actual: 585.36 },
      { date: "2026-08-27", vendor: "LOVES", location: "182CLAIBORNE ROAD, MS", invoice: "99493735", gallons: 181.244, actual: 1012.97 },
      { date: "2026-08-28", vendor: "LOVES", location: "I-81EXIT24", invoice: "99440842", gallons: 109.65, actual: 663.27 },
    ],
    expenses: [],
    reserve_pct: 1.5, factor_fee_pct: 1.5, expected_advance_cents: 465600,
  },
]


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

/** LAW 2 — stamp faro_* BEFORE /advance. Fail-closed if 0 rows or still NULL. */
async function stampFaroMeta(advanceId: string, faroInv: string, report: string[]) {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const u = await c.query<{ display_id: string; faro_purchase_date: string; faro_invoice_number: string }>(
      `UPDATE accounting.factoring_advances fa
          SET faro_invoice_number = COALESCE(fa.faro_invoice_number, $2),
              faro_purchase_date = COALESCE(fa.faro_purchase_date, $3::date)
        WHERE fa.id = $1::uuid
          AND fa.operating_company_id = $4::uuid
        RETURNING fa.display_id, fa.faro_invoice_number, fa.faro_purchase_date::text`,
      [advanceId, faroInv, PURCHASE_DAY, USMCA]
    );
    if (!u.rows[0] || !u.rows[0].faro_purchase_date || !u.rows[0].faro_invoice_number) {
      throw new Error(`FARO_META_STAMP_FAILED advance=${advanceId} inv=${faroInv} rows=${u.rowCount}`);
    }
    report.push(`FARO_META ${u.rows[0].display_id} inv=${u.rows[0].faro_invoice_number} purch=${u.rows[0].faro_purchase_date}`);
  });
}

async function stampFaroMetaByInvoice(invoiceId: string, faroInv: string, report: string[]) {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const u = await c.query<{ display_id: string; faro_purchase_date: string; faro_invoice_number: string }>(
      `UPDATE accounting.factoring_advances fa
          SET faro_invoice_number = COALESCE(fa.faro_invoice_number, $2),
              faro_purchase_date = COALESCE(fa.faro_purchase_date, $3::date)
         FROM accounting.invoices inv
        WHERE inv.id = $1::uuid
          AND fa.id = inv.factoring_advance_id
          AND fa.operating_company_id = $4::uuid
        RETURNING fa.display_id, fa.faro_invoice_number, fa.faro_purchase_date::text`,
      [invoiceId, faroInv, PURCHASE_DAY, USMCA]
    );
    if (!u.rows[0] || !u.rows[0].faro_purchase_date || !u.rows[0].faro_invoice_number) {
      throw new Error(`FARO_META_BY_INV_FAILED invoice=${invoiceId} inv=${faroInv} rows=${u.rowCount}`);
    }
    report.push(`FARO_META_OK ${u.rows[0].display_id} inv=${u.rows[0].faro_invoice_number} purch=${u.rows[0].faro_purchase_date}`);
  });
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
      override_reason: `Historical Faro 8/28 feed: load ${LOAD.load_number} (settlement ${LOAD.settlement_no})`,
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
    entry_date_iso: "2026-08-28",
    actor_user_id: OWNER,
  }).catch((e) => report.push(`WARN revrec1: ${(e as Error).message}`));
  await postLoadRevenueLatch({
    operating_company_id: USMCA,
    load_id: loadId,
    target_status: "completed_docs_received",
    entry_date_iso: "2026-08-28",
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
    const dedupe = `${LOAD.load_number}-${cents(e.amount)}-${e.invoice}`.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 48);
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
    const dedupe = `fuel-${LOAD.load_number}-${f.invoice}-${cents(f.actual)}`.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 48);
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
        submission_batch_ref: `FARO-828-INV-${LOAD.faro_inv}`,
        invoice_ids: [invoiceId.id],
        reserve_pct: LOAD.reserve_pct,
        factor_fee_pct: LOAD.factor_fee_pct,
        notes: `Faro inv ${LOAD.faro_inv} WO ${LOAD.at_wo} — 08/28/2026`,
        // LAW 2 — stamp on CREATE so the row never exists with NULL faro_purchase_date.
        faro_invoice_number: LOAD.faro_inv,
        faro_purchase_date: PURCHASE_DAY,
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
    // Belt: re-stamp BEFORE /advance (covers older API without create-time fields).
    await stampFaroMeta(created.id, LOAD.faro_inv, report);
    const advRes = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/factoring-advances/${created.id}/advance?operating_company_id=${USMCA}`,
      headers: auth,
      payload: { advanced_at: "2026-08-28T18:00:00.000Z", notes: `Wire / Faro 08/28/26 inv ${LOAD.faro_inv}` },
    });
    report.push(
      `ADVANCE inv ${LOAD.faro_inv} load ${LOAD.load_number} → ${created.display_id} purchase $${(created.invoice_total_cents / 100).toFixed(2)} adv $${(created.advance_amount_cents / 100).toFixed(2)} (want ${(LOAD.expected_advance_cents / 100).toFixed(2)}) rsv $${(created.reserve_amount_cents / 100).toFixed(2)} fee $${(created.factor_fee_cents / 100).toFixed(2)} HTTP=${advRes.statusCode}`
    );
    if (advRes.statusCode >= 300) throw new Error(`advance: ${advRes.body.slice(0, 400)}`);
    if (created.advance_amount_cents !== LOAD.expected_advance_cents) {
      throw new Error(`advance cents mismatch got ${created.advance_amount_cents} want ${LOAD.expected_advance_cents}`);
    }
  }

  // Idempotent re-stamp (covers alreadyAdv path + any race). Fail-closed if still null.
  await stampFaroMetaByInvoice(invoiceId.id, LOAD.faro_inv, report);

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
    console.log("Control want: cum purchases $83775 · 30 inv fed (DARDINI15/18+MPH16 STOPPED) · banking 1133");
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
  report.push("EXCEPTION carry: DARDINI15/18 + MPH16 STOPPED. Feeding 8/28 eight invoices.");
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
