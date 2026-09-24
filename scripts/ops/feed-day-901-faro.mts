#!/usr/bin/env tsx
/**
 * E22 — Faro 9/1/26 — 4 invoices (44+42+37+43) = day $14,650 · net adv $14,200.50
 * inv44 Refrigerx 1013241→13561 · inv42 SERVICE FIRST/SFL 131252703→13559
 * inv37 Armstrong 4613473-1→13551 · inv43 Sheer/SHEERTRANS 131060693→13560
 * AT settlements 5795/5792/5800/5791. Linkage at create (ROUND 145.2).
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
const PURCHASE_DAY = "2026-09-01";
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
    // inv44 Refrigerx PO 1013241 · settl 5795 · AT 13561
    load_number: "13561", settlement_no: "5795", faro_inv: "44", wo: "1013241", at_wo: "1013241",
    customer_id: "684f5776-403b-422d-bc5e-2b44ae3b6a2c",
    driver_id: "4ff53886-41cc-434f-ae23-a36a0e3ec8e2",
    unit_id: "f4430f58-c259-43d8-83b5-f4004ab866be",
    trailer_id: "43d4f7dc-1ea5-4ba2-a523-60d4d21d4fd9",
    driver_name: "LUIS ARMANDO SOSA PEREZ",
    linehaul: 3450, driver_gross: 500.22, loaded_miles: 1111.6, empty_miles: 0, rate: 0.45,
    pickup: { date: "2026-08-29", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-08-31", city: "Mesquite", state: "TX", zip: "75149" },
    fuel: [
      { date: "2026-08-30", vendor: "LOVES", location: "21548FM471SNATALIA,TX", invoice: "2886913", gallons: 62.016, actual: 340.41 },
      { date: "2026-08-31", vendor: "LOVES", location: "612PADERSON ROAD", invoice: "1644390", gallons: 119.333, actual: 662.18 },
    ],
    expenses: [
      { date: "2026-08-31", vendor: "LOVES", description: "Road Service-Truck Repair", invoice: "8130337", amount: 617.17 },
    ],
    reserve_pct: 1.5, factor_fee_pct: 1.5, expected_advance_cents: 334650,
  },
  {
    // inv42 SERVICE FIRST / SFL PO 131252703 · settl 5792 · AT 13559
    load_number: "13559", settlement_no: "5792", faro_inv: "42", wo: "131252703", at_wo: "131252703",
    customer_id: "a68d80a8-69a8-4a2e-b14f-92e497bed4d3",
    driver_id: "6edcb351-e81b-4bf2-adf7-5eca9eff9137",
    unit_id: "19d29860-9753-4376-93c4-dc963cc86483",
    trailer_id: "93a6f847-557f-462e-a0e6-64905631743b",
    driver_name: "GENARO GUERRERO CHAVEZ",
    linehaul: 3800, driver_gross: 709.61, loaded_miles: 1508.1, empty_miles: 68.8, rate: 0.45,
    pickup: { date: "2026-08-28", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-09-01", city: "Hutchins", state: "TX", zip: "75141" },
    fuel: [
      { date: "2026-08-30", vendor: "LOVES", location: "2050HWY70E", invoice: "99478043", gallons: 103.854, actual: 590.83 },
      { date: "2026-09-01", vendor: "LOVES", location: "2500SIH-45 HUTCHINS,TX", invoice: "99378673", gallons: 171.3, actual: 940.27 },
    ],
    expenses: [
      { date: "2026-09-01", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99378673-DEF", amount: 55.76 },
    ],
    // Faro: escrow 57 + discount 57 + fees 10 → fee=(57+10)/3800
    reserve_pct: 1.5, factor_fee_pct: (67 / 3800) * 100, expected_advance_cents: 367600,
  },
  {
    // inv37 Armstrong PO 4613473-1 · settl 5800 · AT 13551
    load_number: "13551", settlement_no: "5800", faro_inv: "37", wo: "4613473-1", at_wo: "4613473-1",
    customer_id: "99a7814d-e2e7-4616-b255-bf91d9e450df",
    driver_id: "40022039-b657-4713-97de-439fba899946",
    unit_id: "8a842d23-8261-4c5a-bf72-bb38fa93b9f5",
    trailer_id: "985a5638-0b07-4ddb-9e48-4d96fcea2b2b",
    driver_name: "Vicente Santos Contreras",
    linehaul: 3000, driver_gross: 698.9, loaded_miles: 1397.8, empty_miles: 0, rate: 0.5,
    pickup: { date: "2026-08-26", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-08-28", city: "North Wilkesboro", state: "NC", zip: "28659" },
    fuel: [
      { date: "2026-08-29", vendor: "LOVES", location: "612PEDERSIN ROAD", invoice: "2255359", gallons: 93.754, actual: 520.24 },
      { date: "2026-08-30", vendor: "LOVES", location: "16101HWY84", invoice: "1087729", gallons: 116.376, actual: 671.37 },
      { date: "2026-08-31", vendor: "LOVES", location: "4855MAYSVILLE RD", invoice: "2245936", gallons: 71.573, actual: 390.0 },
    ],
    expenses: [
      { date: "2026-08-29", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "2255359-DEF", amount: 19.76 },
      { date: "2026-08-30", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "1087729-DEF", amount: 18.63 },
    ],
    reserve_pct: 1.5, factor_fee_pct: 1.5, expected_advance_cents: 291000,
  },
  {
    // inv43 Sheer/SHEERTRANS PO 131060693 · settl 5791 · AT 13560
    load_number: "13560", settlement_no: "5791", faro_inv: "43", wo: "131060693", at_wo: "131060693",
    customer_id: "75f6c297-f641-48d4-a098-7abfb884b66a",
    driver_id: "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
    unit_id: "82db522d-9efe-4dca-958f-bb931e4a55ca",
    trailer_id: "5fae4441-6ec3-4599-a5e0-9c14e6f8becf",
    driver_name: "HUGO GAYTAN",
    linehaul: 4400, driver_gross: 870.98, loaded_miles: 1524.4, empty_miles: 411.1, rate: 0.45,
    pickup: { date: "2026-08-28", city: "Laredo", state: "TX", zip: "78045" },
    delivery: { date: "2026-09-01", city: "Chicago", state: "IL", zip: "60601" },
    fuel: [
      { date: "2026-08-30", vendor: "LOVES", location: "5275NORTH FORK RD", invoice: "99418769", gallons: 132.795, actual: 790.0 },
      { date: "2026-08-31", vendor: "LOVES", location: "182CLAIRBONE ROAD", invoice: "99496951", gallons: 184.509, actual: 1031.22 },
    ],
    expenses: [
      { date: "2026-08-31", vendor: "LOVES", description: "Fuel-DEF-Diesel Exhaust Fluid", invoice: "99496951-DEF", amount: 53.21 },
    ],
    reserve_pct: 1.5, factor_fee_pct: 1.5, expected_advance_cents: 426800,
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
      // ROUND 145.2 — every Faro purchase load stamps the factor vendor at creation.
      factoring_company_vendor_id: FARO_VENDOR,
      trailer_type: "dry_van",
      miles_practical: LOAD.loaded_miles + LOAD.empty_miles,
      miles_deadhead: LOAD.empty_miles,
      mileage_source: "History",
      override_reason: `Historical Faro 8/31 feed: load ${LOAD.load_number} (settlement ${LOAD.settlement_no})`,
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
  // ROUND 145.2 — resolve physical trailer from the load (assignment history), never invent.
  const trailerEquipId = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ trailer_id: string }>(
      `SELECT h.new_trailer_id::text AS trailer_id
         FROM dispatch.load_assignment_history h
        WHERE h.load_id = $1::uuid AND h.new_trailer_id IS NOT NULL
        ORDER BY h.assigned_at DESC NULLS LAST, h.created_at DESC
        LIMIT 1`,
      [loadId]
    );
    return r.rows[0]?.trailer_id ?? LOAD.trailer_id;
  });

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
        trailer_id: trailerEquipId,
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
    // ROUND 145.2 — fuel txn carries load_id + driver + unit + trailer + vendor at creation.
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
               unit_id = COALESCE(fuel.fuel_transactions.unit_id, EXCLUDED.unit_id),
               driver_id = COALESCE(fuel.fuel_transactions.driver_id, EXCLUDED.driver_id),
               trailer_id = COALESCE(fuel.fuel_transactions.trailer_id, EXCLUDED.trailer_id),
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
          trailerEquipId,
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
            `UPDATE fuel.fuel_transactions
                SET fuel_card_id = COALESCE(fuel_card_id, $2::uuid),
                    unit_id = COALESCE(unit_id, $3::uuid),
                    driver_id = COALESCE(driver_id, $4::uuid),
                    trailer_id = COALESCE(trailer_id, $5::uuid),
                    updated_at = now()
              WHERE id = $1::uuid`,
            [id, fuelCardId, LOAD.unit_id, LOAD.driver_id, trailerEquipId]
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
        trailer_id: trailerEquipId,
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
        `post=${body.posting_status ?? "?"} hold=${body.posting_hold_reason ?? "none"} trailer=${trailerEquipId}`
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
        submission_batch_ref: `FARO-831-INV-${LOAD.faro_inv}`,
        invoice_ids: [invoiceId.id],
        reserve_pct: LOAD.reserve_pct,
        factor_fee_pct: LOAD.factor_fee_pct,
        notes: `Faro inv ${LOAD.faro_inv} WO ${LOAD.at_wo} — 09/01/2026`,
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
      payload: { advanced_at: "2026-09-01T18:00:00.000Z", notes: `Wire / Faro 09/01/26 inv ${LOAD.faro_inv}` },
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
    console.log("Control want after 8/31 matched: +$6500 (41+38) → cum purchases $90275 / 32 inv (39+40 STOPPED) · banking 1133");
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
  report.push("STOPPED inv39 Big G + inv40 DGL EXPORT (UNMATCHED). Feeding matched inv41+inv38.");
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
