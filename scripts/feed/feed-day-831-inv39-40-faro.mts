#!/usr/bin/env tsx
/**
 * ROUND 152.1 / Rule 52 — Faro 8/31/26 missing inv 39 + 40.
 * inv 39 BIG G PO 3965 → load 13554 (owner FARO LOAD MAP / EXCEPTIONS #1; AT linehaul 0 overruled → Faro $3500)
 * inv 40 DGL EXPORT PO L-43416 → load 13557 (DGL Freight Broker $3900)
 * App writers only. E11_LEAD_AUTH=1
 */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
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
import { postFuelExpenseFromEvent } from "../../apps/backend/src/accounting/fuel-posting/poster.service.js";
import { postLoadRevenueLatch } from "../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.js";
import { postFactoringAdvanceEvent } from "../../apps/backend/src/accounting/factoring-posting/poster.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const FARO_VENDOR = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4";
const BANK = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3";
const FUEL_ACCT = "353fbd5b-d39c-4709-ac19-60cae52018f7";
const APPLY = process.argv.includes("--apply");

type Fuel = { date: string; vendor: string; location: string; invoice: string; gallons: number; actual: number; fuel_type: "diesel" | "def" };
type Exp = { date: string; vendor: string; description: string; invoice: string; amount: number };
type Stop = { date: string; city: string; state: string; zip: string; facility: string; leg_miles?: number };
type LoadSpec = {
  load_number: string; settlement_no: string; faro_inv: string; wo: string;
  customer_id: string; driver_id: string; unit_id: string;
  linehaul: number; driver_gross: number; loaded_miles: number; empty_miles: number; rate: number;
  /** AlwaysTrack line amounts — must sum to driver_gross (not always miles×rate). */
  loaded_pay: number; empty_pay: number;
  pickup: Stop; delivery: Stop;
  rests: Stop[];
  fuel: Fuel[]; expenses: Exp[];
  reserve_pct: number; factor_fee_pct: number;
  expected_purchase_cents: number; expected_reserve_cents: number; expected_fee_cents: number;
  expected_ach_cents: number; expected_advance_cents: number; purchase_date: string;
};

const LOADS: LoadSpec[] = [
  {
    load_number: "13554", settlement_no: "5790", faro_inv: "39", wo: "3965",
    customer_id: "bb123106-ad82-43fb-a27b-ca806910b8b9", // Big G Logistics, LLC
    driver_id: "ac9ea24d-25a5-4e4f-b23e-aa90294357ac", // Leonel Active
    unit_id: "507921c7-ab1c-4fa7-bd7c-7f42552f7423", // T175
    linehaul: 3500, driver_gross: 761.7, loaded_miles: 1046.8, empty_miles: 476.6, rate: 0.45,
    loaded_pay: 523.4, empty_pay: 238.3,
    pickup: { date: "2026-08-28", city: "CATTAWBA", state: "NC", zip: "28609", facility: "COMMSCOPE CATAWBA", leg_miles: 145.8 },
    delivery: { date: "2026-08-31", city: "HOUSTON", state: "TX", zip: "77093", facility: "QUANTA JOINT TRENCH", leg_miles: 1046.8 },
    rests: [
      { date: "2026-08-27", city: "MORRISVILLE", state: "NC", zip: "27560", facility: "SUPERIOR CRANE" },
      { date: "2026-09-01", city: "Laredo", state: "TX", zip: "78045", facility: "EBT Yard", leg_miles: 330.8 },
    ],
    fuel: [
      { date: "2026-08-28", vendor: "LOVES", location: "1217TROLLINGWOOD", invoice: "2051327", gallons: 70.071, actual: 362.2, fuel_type: "diesel" },
      { date: "2026-08-29", vendor: "LOVES", location: "1127TYSON ROAD HOPE", invoice: "99037285", gallons: 118.097, actual: 681.3, fuel_type: "diesel" },
      { date: "2026-08-31", vendor: "LOVES", location: "612PODERSON ROAD", invoice: "99110970", gallons: 161.216, actual: 894.59, fuel_type: "diesel" },
      { date: "2026-08-26", vendor: "LOVES", location: "DEF", invoice: "DEF-13554-1", gallons: 0, actual: 44.26, fuel_type: "def" },
      { date: "2026-08-28", vendor: "LOVES", location: "DEF", invoice: "DEF-13554-2", gallons: 0, actual: 40.91, fuel_type: "def" },
      { date: "2026-08-26", vendor: "LOVES", location: "DEF", invoice: "DEF-13554-3", gallons: 0, actual: 10.81, fuel_type: "def" },
      { date: "2026-08-29", vendor: "LOVES", location: "DEF", invoice: "DEF-13554-4", gallons: 0, actual: 8.7, fuel_type: "def" },
      { date: "2026-08-31", vendor: "LOVES", location: "DEF", invoice: "DEF-13554-5", gallons: 0, actual: 63.94, fuel_type: "def" },
    ],
    expenses: [
      // settlement company_expenses $20.80 / 1 row — AlwaysTrack composition; memo-tied
      { date: "2026-08-31", vendor: "LOVES", description: "Company expense (settlement 5790)", invoice: "CE-13554", amount: 20.8 },
    ],
    reserve_pct: 1.5, factor_fee_pct: 1.5,
    expected_purchase_cents: 350000, expected_reserve_cents: 5250, expected_fee_cents: 5250,
    expected_ach_cents: 0, expected_advance_cents: 339500, purchase_date: "2026-08-31",
  },
  {
    load_number: "13557", settlement_no: "5789", faro_inv: "40", wo: "L-43416",
    customer_id: "2cd5a583-1b24-442c-a841-473ed0b5226c", // DGL Freight Broker
    driver_id: "3e138476-06db-4b08-9ebe-527a5d8c591d", // Jorge Luis Infante Corona Active
    unit_id: "e15c43f8-3c61-4d1c-be67-05a489c3e622", // T177
    linehaul: 3900, driver_gross: 980.75, loaded_miles: 1415.9, empty_miles: 545.6, rate: 0.45,
    loaded_pay: 707.95, empty_pay: 272.8,
    pickup: { date: "2026-08-28", city: "ELKTON", state: "MD", zip: "21921", facility: "Elkton", leg_miles: 107.2 },
    delivery: { date: "2026-08-31", city: "IRVING", state: "TX", zip: "75063", facility: "IRVING", leg_miles: 1415.9 },
    rests: [
      { date: "2026-08-28", city: "EDISON", state: "NJ", zip: "08817", facility: "Global Manufacturing, Inc" },
      { date: "2026-09-01", city: "Laredo", state: "TX", zip: "78045", facility: "EBT Yard", leg_miles: 438.4 },
    ],
    fuel: [
      { date: "2026-08-29", vendor: "LOVES", location: "10465LONESOME PINE", invoice: "99462408", gallons: 146.879, actual: 840.0, fuel_type: "diesel" },
      { date: "2026-08-30", vendor: "LOVES", location: "1610COTTON GIN ROAD", invoice: "99794138", gallons: 179.923, actual: 1005.59, fuel_type: "diesel" },
      { date: "2026-08-29", vendor: "LOVES", location: "DEF", invoice: "DEF-13557-1", gallons: 0, actual: 43.43, fuel_type: "def" },
      { date: "2026-08-30", vendor: "LOVES", location: "DEF", invoice: "DEF-13557-2", gallons: 0, actual: 42.38, fuel_type: "def" },
      { date: "2026-08-31", vendor: "LOVES", location: "DEF", invoice: "DEF-13557-3", gallons: 0, actual: 70.61, fuel_type: "def" },
    ],
    expenses: [],
    reserve_pct: 1.5, factor_fee_pct: 1.5,
    expected_purchase_cents: 390000, expected_reserve_cents: 5850, expected_fee_cents: 5850,
    expected_ach_cents: 0, expected_advance_cents: 378300, purchase_date: "2026-08-31",
  },
];

const auth = {
  "x-test-auth": Buffer.from(
    JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }),
    "utf8"
  ).toString("base64url"),
  "content-type": "application/json",
};

function cents(n: number) { return Math.round(n * 100); }

async function resolveVendor(client: pg.PoolClient, name: string): Promise<string> {
  const rows = await searchVendorsForAutocomplete(client, {
    operating_company_id: USMCA, term: name, limit: 5, active_only: true,
  });
  const exact = rows.find((r) => r.display_name.toUpperCase() === name.toUpperCase());
  if (exact) return exact.id;
  if (rows[0]) return rows[0].id;
  throw new Error(`vendor_not_found ${name}`);
}

async function feedOne(app: Awaited<ReturnType<typeof createIntegrationApp>>, LOAD: LoadSpec, report: string[]) {
  const existingFa = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ display_id: string }>(
      `SELECT display_id FROM accounting.factoring_advances
        WHERE operating_company_id=$1::uuid AND faro_invoice_number=$2 AND voided_at IS NULL LIMIT 1`,
      [USMCA, LOAD.faro_inv]
    );
    return r.rows[0]?.display_id ?? null;
  });
  if (existingFa) {
    report.push(`SKIP FA inv ${LOAD.faro_inv} already ${existingFa}`);
    return;
  }

  const existing = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string }>(
      `SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2 AND soft_deleted_at IS NULL LIMIT 1`,
      [USMCA, LOAD.load_number]
    );
    return r.rows[0]?.id ?? null;
  });

  let loadId: string;
  if (existing) {
    loadId = existing;
    report.push(`LOAD resume ${LOAD.load_number} id=${loadId}`);
  } else {
    const bookInput: BookLoadInput = {
      requestingUserUuid: OWNER, requestingUserRole: "Owner", operating_company_id: USMCA,
      customer_id: LOAD.customer_id, status: "dispatched", trip_type: "NB", tour_id: randomUUID(),
      load_number: LOAD.load_number, requested_load_number: LOAD.load_number,
      customer_wo_number: LOAD.wo, is_sample_data: false,
      notes: `AlwaysTrack seed — settlement ${LOAD.settlement_no} / Faro inv ${LOAD.faro_inv} / WO ${LOAD.wo}`,
      charges: [{ code: "linehaul", amount_cents: cents(LOAD.linehaul) }],
      stops: [
        { stop_type: "pickup", sequence_number: 1, city: LOAD.pickup.city, state: LOAD.pickup.state, postal_code: LOAD.pickup.zip, facility_name: LOAD.pickup.facility, scheduled_arrival_at: `${LOAD.pickup.date}T12:00:00.000Z`, time_window_type: "appointment" },
        { stop_type: "delivery", sequence_number: 2, city: LOAD.delivery.city, state: LOAD.delivery.state, postal_code: LOAD.delivery.zip, facility_name: LOAD.delivery.facility, scheduled_arrival_at: `${LOAD.delivery.date}T12:00:00.000Z`, time_window_type: "appointment" },
      ],
      save_mode: "book_dispatch", assigned_unit_id: LOAD.unit_id, trailer_type: "dry_van",
      miles_practical: LOAD.loaded_miles + LOAD.empty_miles, miles_deadhead: LOAD.empty_miles, mileage_source: "History",
      override_reason: `Historical Faro 8/31 feed: load ${LOAD.load_number} already completed (settlement ${LOAD.settlement_no})`,
      override_rules: [
        { rule_code: "WF-HOS-VIOLATION", reason: `Historical backfill load ${LOAD.load_number}` },
        { rule_code: "WF-MED-CARD-MISSING", reason: `Historical backfill load ${LOAD.load_number}`, subject: "historical" },
      ],
    };
    let result = await bookLoad(bookInput);
    if (result.kind === "error" && (result.payload as { error?: string }).error === "duplicate_load_number") {
      await new Promise((r) => setTimeout(r, 1500));
      result = await bookLoad(bookInput);
    }
    if (result.kind === "error") throw new Error(`bookLoad ${LOAD.load_number}: ${JSON.stringify(result.payload)}`);
    loadId = String(result.row.id);
    report.push(`LOAD created ${LOAD.load_number} id=${loadId}`);
  }

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(
      `UPDATE mdata.loads SET assigned_primary_driver_id=$1::uuid, factoring_company_vendor_id=$2::uuid, updated_at=now() WHERE id=$3::uuid`,
      [LOAD.driver_id, FARO_VENDOR, loadId]
    );
  });

  const stops = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string; stop_type: string }>(
      `SELECT id::text, stop_type FROM mdata.load_stops WHERE load_id=$1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number`,
      [loadId]
    );
    return r.rows;
  });
  for (const s of stops) {
    if (s.stop_type !== "pickup" && s.stop_type !== "delivery") continue;
    const spec = s.stop_type === "pickup" ? LOAD.pickup : LOAD.delivery;
    const patch = await app.inject({
      method: "PATCH", url: `/api/v1/mdata/loads/${loadId}/stops/${s.id}`, headers: auth,
      payload: { actual_arrival_at: `${spec.date}T08:00:00.000Z`, actual_departure_at: `${spec.date}T09:00:00.000Z`, facility_name: spec.facility },
    });
    report.push(`STOP ${LOAD.load_number} ${s.stop_type}: ${patch.statusCode}`);
    if (patch.statusCode >= 300) throw new Error(`stop: ${patch.body.slice(0, 300)}`);
  }

  // Rest stops via close helper path later; stamp leg miles on pickup/delivery now
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(`UPDATE mdata.load_stops SET leg_miles=$2 WHERE load_id=$1::uuid AND stop_type='pickup' AND soft_deleted_at IS NULL`, [loadId, LOAD.pickup.leg_miles ?? LOAD.empty_miles]);
    await c.query(`UPDATE mdata.load_stops SET leg_miles=$2 WHERE load_id=$1::uuid AND stop_type='delivery' AND soft_deleted_at IS NULL`, [loadId, LOAD.delivery.leg_miles ?? LOAD.loaded_miles]);
  });

  let invoiceId = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(`UPDATE mdata.loads SET status='completed_docs_received', updated_at=now() WHERE id=$1::uuid`, [loadId]);
    const conv = await convertProformaToOfficial(c as never, { operatingCompanyId: USMCA, loadId, userId: OWNER });
    report.push(`CONVERT ${LOAD.load_number} ${JSON.stringify(conv)}`);
    const r = await c.query<{ id: string; status: string }>(
      `SELECT id::text, status::text FROM accounting.invoices WHERE operating_company_id=$1::uuid AND source_load_id=$2::uuid AND voided_at IS NULL AND status<>'void' LIMIT 1`,
      [USMCA, loadId]
    );
    return r.rows[0] ?? null;
  });

  if (!invoiceId) {
    const fl = await app.inject({
      method: "POST", url: `/api/v1/accounting/invoices/from-load?operating_company_id=${USMCA}`, headers: auth,
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
      method: "POST", url: `/api/v1/accounting/invoices/${invoiceId.id}/send?operating_company_id=${USMCA}`, headers: auth, payload: {},
    });
    report.push(`SEND ${LOAD.load_number} ${sendRes.statusCode}`);
    if (sendRes.statusCode >= 300) throw new Error(`send: ${sendRes.body.slice(0, 400)}`);
  }

  await postLoadRevenueLatch({ operating_company_id: USMCA, load_id: loadId, target_status: "delivered_pending_docs", entry_date_iso: LOAD.delivery.date, actor_user_id: OWNER }).catch((e) => report.push(`WARN revrec1: ${(e as Error).message}`));
  await postLoadRevenueLatch({ operating_company_id: USMCA, load_id: loadId, target_status: "completed_docs_received", entry_date_iso: LOAD.delivery.date, actor_user_id: OWNER }).catch((e) => report.push(`WARN revrec2: ${(e as Error).message}`));

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const existingBill = await c.query(`SELECT 1 FROM driver_finance.driver_bills WHERE load_id=$1::uuid AND voided_at IS NULL LIMIT 1`, [loadId]);
    if (existingBill.rows[0]) { report.push(`DRIVER_BILL ${LOAD.load_number} already`); return; }
    const bill = await createHistoricalDriverBill(c as never, {
      operating_company_id: USMCA, load_id: loadId, load_number: LOAD.load_number, driver_id: LOAD.driver_id, team_driver_id: null,
      gross_amount_cents: cents(LOAD.driver_gross),
      loaded_pay_cents: cents(LOAD.loaded_pay),
      deadhead_pay_cents: cents(LOAD.empty_pay),
      miles_basis: LOAD.loaded_miles, miles_basis_type: "practical", rate_per_mile_cents: cents(LOAD.rate),
      miles_deadhead: LOAD.empty_miles, rate_empty_per_mile_cents: cents(LOAD.rate),
      source_document_ref: LOAD.settlement_no, requesting_user_uuid: OWNER,
    });
    report.push(`DRIVER_BILL ${LOAD.load_number} ${JSON.stringify(bill)}`);
    if (bill.outcome === "refused") throw new Error(bill.reason);
  });

  for (const e of LOAD.expenses) {
    const vendorId = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      return resolveVendor(c as unknown as pg.PoolClient, e.vendor);
    });
    const dedupe = `${e.invoice}-${cents(e.amount)}`.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 30);
    const exp = await app.inject({
      method: "POST", url: "/api/v1/expenses", headers: auth,
      payload: {
        operating_company_id: USMCA, category_account_id: FUEL_ACCT, payment_account_uuid: BANK,
        expense_date: e.date, amount_cents: cents(e.amount), vendor_uuid: vendorId,
        memo: `${e.description} — inv ${e.invoice} — $${e.amount.toFixed(2)} (settlement ${LOAD.settlement_no})`,
        vendor_document_number: dedupe, load_id: loadId, unit_id: LOAD.unit_id, driver_id: LOAD.driver_id,
        is_company_expense: true, is_sample_data: false,
      },
    });
    report.push(`EXPENSE ${LOAD.load_number} ${e.invoice}: ${exp.statusCode}`);
    if (exp.statusCode >= 300 && !exp.body.includes("duplicate_vendor_document_number")) {
      throw new Error(`expense: ${exp.body.slice(0, 300)}`);
    }
  }

  for (const f of LOAD.fuel) {
    const fuelKind = f.fuel_type === "def" ? "def" : "diesel";
    const fuelId = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const vendorId = await resolveVendor(c as unknown as pg.PoolClient, f.vendor);
      const rowHash = `alwaystrack:${USMCA}:${loadId}:${f.date}:${f.vendor}:${f.invoice}`;
      const ins = await c.query<{ id: string }>(
        `INSERT INTO fuel.fuel_transactions (
           operating_company_id, transaction_at, purchased_at, load_id, vendor_id, fuel_type,
           gallons, total_cost, location_city, transaction_reference, source, source_row_hash,
           created_by_user_id, updated_by_user_id, driver_id, unit_id
         ) VALUES ($1::uuid, $2::date, $2::date, $3::uuid, $4::uuid, $13, $5, $6, $7, $8, 'import', $9, $10::uuid, $10::uuid, $11::uuid, $12::uuid)
         ON CONFLICT (operating_company_id, source_row_hash) DO NOTHING RETURNING id::text`,
        [USMCA, f.date, loadId, vendorId, f.gallons, f.actual, f.location, f.invoice, rowHash, OWNER, LOAD.driver_id, LOAD.unit_id, fuelKind]
      );
      let id = ins.rows[0]?.id;
      if (!id) {
        const ex = await c.query<{ id: string }>(`SELECT id::text FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND source_row_hash=$2 LIMIT 1`, [USMCA, rowHash]);
        id = ex.rows[0]?.id;
      }
      if (!id) throw new Error(`fuel insert failed ${f.invoice}`);
      return id;
    });
    await postFuelExpenseFromEvent({
      operating_company_id: USMCA, actor_user_id: OWNER, fuel_event_id: fuelId, fuel_kind: fuelKind,
      posted_at: f.date, amount_cents: cents(f.actual), posting_path: "company_direct",
    }).catch((e) => report.push(`WARN fuel GL ${f.invoice}: ${(e as Error).message}`));
    report.push(`FUEL ${LOAD.load_number} ${fuelKind} ${f.invoice}: $${f.actual}`);
  }

  const createRes = await app.inject({
    method: "POST", url: `/api/v1/accounting/factoring-advances?operating_company_id=${USMCA}`, headers: auth,
    payload: {
      factoring_company_vendor_id: FARO_VENDOR,
      submission_batch_ref: `FARO-831-INV-${LOAD.faro_inv}`,
      invoice_ids: [invoiceId.id],
      reserve_pct: LOAD.reserve_pct, factor_fee_pct: LOAD.factor_fee_pct,
      notes: `Wire / Faro 08/31/26 inv ${LOAD.faro_inv}`,
    },
  });
  if (createRes.statusCode >= 300) throw new Error(`factor create ${LOAD.faro_inv}: ${createRes.statusCode} ${createRes.body.slice(0, 400)}`);
  const created = JSON.parse(createRes.body) as { id: string; display_id: string };

  await postFactoringAdvanceEvent({
    operating_company_id: USMCA, factoring_advance_id: created.id, actor_user_id: OWNER,
    advanced_at_iso: `${LOAD.purchase_date}T18:00:00.000Z`,
    funding_figures: {
      invoice_total_cents: LOAD.expected_purchase_cents,
      reserve_cents: LOAD.expected_reserve_cents,
      fee_cents: LOAD.expected_fee_cents,
      ach_cents: LOAD.expected_ach_cents,
    },
    faro_invoice_number: LOAD.faro_inv, faro_purchase_date: LOAD.purchase_date,
  });

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(
      `UPDATE accounting.factoring_advances SET status='advanced', advanced_at=$2::timestamptz, notes=COALESCE(notes, $3)
        WHERE id=$1::uuid AND operating_company_id=$4::uuid`,
      [created.id, `${LOAD.purchase_date}T18:00:00.000Z`, `Wire / Faro 08/31/26 inv ${LOAD.faro_inv}`, USMCA]
    );
    await c.query(
      `UPDATE accounting.invoices SET factoring_status='advanced', updated_at=now(), updated_by_user_id=$2::uuid WHERE factoring_advance_id=$1::uuid`,
      [created.id, OWNER]
    );
  });

  const check = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ display_id: string; advance_amount_cents: string; faro_invoice_number: string; faro_purchase_date: string }>(
      `SELECT display_id, advance_amount_cents::text, faro_invoice_number, faro_purchase_date::text FROM accounting.factoring_advances WHERE id=$1::uuid`,
      [created.id]
    );
    return r.rows[0];
  });
  report.push(`ADVANCE inv ${LOAD.faro_inv} load ${LOAD.load_number} → ${check.display_id} adv $${Number(check.advance_amount_cents) / 100}`);
  if (Number(check.advance_amount_cents) !== LOAD.expected_advance_cents) {
    throw new Error(`advance mismatch got ${check.advance_amount_cents} want ${LOAD.expected_advance_cents}`);
  }
  if (check.faro_invoice_number !== LOAD.faro_inv || check.faro_purchase_date !== LOAD.purchase_date) {
    throw new Error(`faro stamp missing: ${JSON.stringify(check)}`);
  }
  report.push(`DONE inv ${LOAD.faro_inv} load ${LOAD.load_number}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (/-pooler\./.test(process.env.DATABASE_URL)) throw new Error("Refuse -pooler DATABASE_URL");
  if (!APPLY) {
    for (const L of LOADS) {
      console.log(`DRY 8/31 inv ${L.faro_inv} → ${L.load_number} $${L.linehaul} adv $${(L.expected_advance_cents / 100).toFixed(2)} fuel=${L.fuel.length}`);
    }
    return;
  }
  if (!process.env.E11_AUTH_ID && process.env.E11_LEAD_AUTH !== "1") {
    throw new Error("set E11_AUTH_ID=AUTH-NNN or E11_LEAD_AUTH=1");
  }
  if (process.env.E11_AUTH_ID) {
    const authCheck = spawnSync("node", ["scripts/verify-owner-authorization.mjs", process.env.E11_AUTH_ID], { stdio: "inherit", cwd: new URL("../..", import.meta.url).pathname });
    if (authCheck.status !== 0) throw new Error("auth failed");
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerLoadRoutes(a); await registerExpenseRoutes(a); await registerVendorRoutes(a);
    await registerFuelTransactionsRoutes(a);
    await (invoicesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
    await (factoringAdvancesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
  });
  const report: string[] = [];
  try {
    for (const L of LOADS) await feedOne(app, L, report);
  } finally {
    await app.close(); await pool.end();
  }
  console.log(report.join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
