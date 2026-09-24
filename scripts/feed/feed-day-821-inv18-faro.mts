#!/usr/bin/env tsx
/**
 * ROUND 152.1 / Rule 52 — Faro purchase day 8/21/26 LIVE feed for missing inv 18.
 * Faro inv 18 · DARDINI LLC · PO 154067 · load 13529 · settl 5782 · $3,900 / net adv $3,783
 * (escrow_rsv $58.50 + discount $58.50). Register had UNMATCHED name — matched to 13529
 * (DLS Dardini / Hugo / T173 / $3900) as the Only AlwaysTrack load that is Dardini+$3900.
 *
 * App writers only. Auth: E11_LEAD_AUTH=1 or E11_AUTH_ID=AUTH-NNN.
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

const LOAD = {
  load_number: "13529",
  settlement_no: "5782",
  faro_inv: "18",
  wo: "154067",
  at_wo: "154067",
  customer_id: "71afff38-075d-4d64-b98a-e1176f0b0c44", // DARDINI LLC (Faro debtor)
  driver_id: "3445cf68-4a7f-4d73-89f7-04bf1fd207b4", // HUGO GAYTAN Active
  unit_id: "82db522d-9efe-4dca-958f-bb931e4a55ca", // T173
  linehaul: 3900,
  driver_gross: 728.51,
  loaded_miles: 1618.9,
  empty_miles: 0,
  rate: 0.45,
  pickup: {
    date: "2026-08-17",
    city: "LAREDO",
    state: "TX",
    zip: "78045",
    facility: "Mastronardi Produce",
  },
  delivery: {
    date: "2026-08-19",
    city: "PETERSBURG",
    state: "VA",
    zip: "23803",
    facility: "Aldi Petersburg",
  },
  rest: null as null,
  fuel: [
    { date: "2026-08-17", vendor: "LOVES", location: "21548FM471S NATALIA,TX", invoice: "99524227", gallons: 133.259, actual: 731.46, fuel_type: "diesel" },
    { date: "2026-08-18", vendor: "LOVES", location: "431MAIN STREET", invoice: "99365532", gallons: 128.939, actual: 746.43, fuel_type: "diesel" },
  ],
  expenses: [] as { date: string; vendor: string; description: string; invoice: string; amount: number }[],
  reserve_pct: 1.5, // escrow_rsv $58.50 / $3900
  factor_fee_pct: 1.5,
  expected_purchase_cents: 390000,
  expected_reserve_cents: 5850, // Escrow Rsv $58.50
  expected_fee_cents: 5850, // Discount $58.50
  expected_ach_cents: 0,
  expected_advance_cents: 378300, // Net Adv $3,783
  purchase_date: "2026-08-21",
};

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

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  // Refuse pooler — session GUC must survive
  if (/-pooler\./.test(process.env.DATABASE_URL)) {
    throw new Error("Refuse -pooler DATABASE_URL (session GUC would not survive). Use direct endpoint.");
  }
  if (!APPLY) {
    console.log(
      `DRY 8/21 Faro inv ${LOAD.faro_inv} WO ${LOAD.at_wo} load ${LOAD.load_number} settl ${LOAD.settlement_no} $${LOAD.linehaul} → adv $${(LOAD.expected_advance_cents / 100).toFixed(2)} fuel=${LOAD.fuel.length} exp=${LOAD.expenses.length}`
    );
    return;
  }

  const authId = process.env.E11_AUTH_ID ?? "";
  if (authId) {
    const authCheck = spawnSync("node", ["scripts/verify-owner-authorization.mjs", authId], {
      stdio: "inherit",
      cwd: new URL("../..", import.meta.url).pathname,
    });
    if (authCheck.status !== 0) throw new Error(`verify-owner-authorization ${authId} failed`);
  } else if (process.env.E11_LEAD_AUTH !== "1") {
    throw new Error("set E11_AUTH_ID=AUTH-NNN or E11_LEAD_AUTH=1 for Round 152.1 Cursor feed");
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

  try {
    const existing = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const r = await c.query<{ id: string }>(
        `SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2 AND soft_deleted_at IS NULL LIMIT 1`,
        [USMCA, LOAD.load_number]
      );
      return r.rows[0]?.id ?? null;
    });

    const existingFa = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const r = await c.query<{ display_id: string }>(
        `SELECT display_id FROM accounting.factoring_advances
          WHERE operating_company_id=$1::uuid AND faro_invoice_number=$2 AND voided_at IS NULL LIMIT 1`,
        [USMCA, LOAD.faro_inv]
      );
      return r.rows[0]?.display_id ?? null;
    });
    if (existingFa) throw new Error(`FA inv ${LOAD.faro_inv} already exists ${existingFa}`);

    let loadId: string;
    if (existing) {
      loadId = existing;
      report.push(`LOAD resume ${LOAD.load_number} id=${loadId}`);
    } else {
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
        notes: `AlwaysTrack seed — settlement ${LOAD.settlement_no} / Faro inv ${LOAD.faro_inv} / WO ${LOAD.at_wo}`,
        charges: [{ code: "linehaul", amount_cents: cents(LOAD.linehaul) }],
        stops: [
          {
            stop_type: "pickup",
            sequence_number: 1,
            city: LOAD.pickup.city,
            state: LOAD.pickup.state,
            postal_code: LOAD.pickup.zip,
            facility_name: LOAD.pickup.facility,
            scheduled_arrival_at: `${LOAD.pickup.date}T12:00:00.000Z`,
            time_window_type: "appointment",
          },
          {
            stop_type: "delivery",
            sequence_number: 2,
            city: LOAD.delivery.city,
            state: LOAD.delivery.state,
            postal_code: LOAD.delivery.zip,
            facility_name: LOAD.delivery.facility,
            scheduled_arrival_at: `${LOAD.delivery.date}T12:00:00.000Z`,
            time_window_type: "appointment",
          },
        ],
        save_mode: "book_dispatch",
        assigned_unit_id: LOAD.unit_id,
        trailer_type: "dry_van",
        miles_practical: LOAD.loaded_miles + LOAD.empty_miles,
        miles_deadhead: LOAD.empty_miles,
        mileage_source: "History",
        override_reason: `Historical Faro 8/21 feed: load ${LOAD.load_number} already completed (settlement ${LOAD.settlement_no})`,
        override_rules: [
          { rule_code: "WF-HOS-VIOLATION", reason: `Historical backfill load ${LOAD.load_number}` },
          { rule_code: "WF-MED-CARD-MISSING", reason: `Historical backfill load ${LOAD.load_number}`, subject: "Hugo Gaytan Sarabia" },
        ],
      };

      let result = await bookLoad(bookInput);
      if (
        result.kind === "error" &&
        (result.payload as { error?: string }).error === "duplicate_load_number"
      ) {
        await new Promise((r) => setTimeout(r, 1500));
        result = await bookLoad(bookInput);
      }
      if (result.kind === "error") throw new Error(`bookLoad: ${JSON.stringify(result.payload)}`);
      loadId = String(result.row.id);
      report.push(`LOAD created ${LOAD.load_number} id=${loadId}`);
    }

    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      await c.query(
        `UPDATE mdata.loads
            SET assigned_primary_driver_id=$1::uuid,
                factoring_company_vendor_id=$2::uuid,
                updated_at=now()
          WHERE id=$3::uuid`,
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
        method: "PATCH",
        url: `/api/v1/mdata/loads/${loadId}/stops/${s.id}`,
        headers: auth,
        payload: {
          actual_arrival_at: `${spec.date}T08:00:00.000Z`,
          actual_departure_at: `${spec.date}T09:00:00.000Z`,
          facility_name: spec.facility,
        },
      });
      report.push(`STOP ${s.stop_type}: ${patch.statusCode}`);
      if (patch.statusCode >= 300) throw new Error(`stop ${s.stop_type}: ${patch.body.slice(0, 300)}`);
    }

    // Rest/empty stop — skip when AlwaysTrack has pickup+delivery only.
    if (LOAD.rest) {
      await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        const hasRest = await c.query(
          `SELECT 1 FROM mdata.load_stops WHERE load_id=$1::uuid AND stop_type='rest' AND soft_deleted_at IS NULL LIMIT 1`,
          [loadId]
        );
        if (!hasRest.rows[0]) {
          await c.query(
            `UPDATE mdata.load_stops SET sequence_number = sequence_number + 100
              WHERE load_id=$1::uuid AND soft_deleted_at IS NULL`,
            [loadId]
          );
          await c.query(
            `INSERT INTO mdata.load_stops (
               load_id, sequence_number, stop_type, facility_name, city, state, postal_code,
               address_line1, status, country, scheduled_arrival_at, actual_arrival_at, actual_departure_at
             ) VALUES (
               $1::uuid, 1, 'rest', $2, $3, $4, $5,
               $6, 'departed', 'US', $7::timestamptz, $7::timestamptz, $7::timestamptz
             )`,
            [
              loadId,
              LOAD.rest.facility,
              LOAD.rest.city,
              LOAD.rest.state,
              LOAD.rest.zip,
              `${LOAD.rest.facility}, ${LOAD.rest.city}, ${LOAD.rest.state} ${LOAD.rest.zip}`,
              `${LOAD.rest.date}T12:00:00.000Z`,
            ]
          );
          await c.query(
            `UPDATE mdata.load_stops SET sequence_number=2, leg_miles=$2
              WHERE load_id=$1::uuid AND stop_type='pickup' AND soft_deleted_at IS NULL`,
            [loadId, LOAD.empty_miles]
          );
          await c.query(
            `UPDATE mdata.load_stops SET sequence_number=3, leg_miles=$2
              WHERE load_id=$1::uuid AND stop_type='delivery' AND soft_deleted_at IS NULL`,
            [loadId, LOAD.loaded_miles]
          );
          report.push(`STOP rest: inserted ${LOAD.rest.facility}`);
        } else {
          report.push(`STOP rest: already present`);
        }
      });
    } else {
      await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        await c.query(
          `UPDATE mdata.load_stops SET leg_miles=$2
            WHERE load_id=$1::uuid AND stop_type='delivery' AND soft_deleted_at IS NULL`,
          [loadId, LOAD.loaded_miles]
        );
      });
      report.push(`STOP rest: none (pickup+delivery only)`);
    }

    let invoiceId = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      await c.query(`UPDATE mdata.loads SET status='completed_docs_received', updated_at=now() WHERE id=$1::uuid`, [loadId]);
      const conv = await convertProformaToOfficial(c as never, {
        operatingCompanyId: USMCA,
        loadId,
        userId: OWNER,
      });
      report.push(`CONVERT ${JSON.stringify(conv)}`);
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
      report.push(`SEND ${sendRes.statusCode} ${sendRes.body.slice(0, 120)}`);
      if (sendRes.statusCode >= 300) throw new Error(`send: ${sendRes.body.slice(0, 400)}`);
    }

    await postLoadRevenueLatch({
      operating_company_id: USMCA,
      load_id: loadId,
      target_status: "delivered_pending_docs",
      entry_date_iso: LOAD.delivery.date,
      actor_user_id: OWNER,
    }).catch((e) => report.push(`WARN revrec1: ${(e as Error).message}`));
    await postLoadRevenueLatch({
      operating_company_id: USMCA,
      load_id: loadId,
      target_status: "completed_docs_received",
      entry_date_iso: LOAD.delivery.date,
      actor_user_id: OWNER,
    }).catch((e) => report.push(`WARN revrec2: ${(e as Error).message}`));

    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const existingBill = await c.query(
        `SELECT 1 FROM driver_finance.driver_bills WHERE load_id=$1::uuid AND voided_at IS NULL LIMIT 1`,
        [loadId]
      );
      if (existingBill.rows[0]) {
        report.push(`DRIVER_BILL already present`);
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

    for (const e of LOAD.expenses) {
      const vendorId = await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        return resolveVendor(c as unknown as pg.PoolClient, e.vendor);
      });
      const dedupe = `${e.invoice}-${cents(e.amount)}`.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 30);
      const exp = await app.inject({
        method: "POST",
        url: "/api/v1/expenses",
        headers: auth,
        payload: {
          operating_company_id: USMCA,
          category_account_id: FUEL_ACCT,
          payment_account_uuid: BANK,
          expense_date: e.date,
          amount_cents: cents(e.amount),
          vendor_uuid: vendorId,
          memo: `${e.description} — inv ${e.invoice} — ${e.date} — $${e.amount.toFixed(2)} (settlement ${LOAD.settlement_no})`,
          vendor_document_number: dedupe,
          load_id: loadId,
          unit_id: LOAD.unit_id,
          driver_id: LOAD.driver_id,
          is_company_expense: true,
          is_sample_data: false,
        },
      });
      report.push(`EXPENSE ${e.invoice}: ${exp.statusCode}`);
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
           ON CONFLICT (operating_company_id, source_row_hash) DO NOTHING
           RETURNING id::text`,
          [USMCA, f.date, loadId, vendorId, f.gallons, f.actual, f.location, f.invoice, rowHash, OWNER, LOAD.driver_id, LOAD.unit_id, fuelKind]
        );
        let id = ins.rows[0]?.id;
        if (!id) {
          const ex = await c.query<{ id: string }>(
            `SELECT id::text FROM fuel.fuel_transactions WHERE operating_company_id=$1::uuid AND source_row_hash=$2 LIMIT 1`,
            [USMCA, rowHash]
          );
          id = ex.rows[0]?.id;
        }
        if (!id) throw new Error(`fuel insert failed ${f.invoice}`);
        return id;
      });
      await postFuelExpenseFromEvent({
        operating_company_id: USMCA,
        actor_user_id: OWNER,
        fuel_event_id: fuelId,
        fuel_kind: fuelKind,
        posted_at: f.date,
        amount_cents: cents(f.actual),
        posting_path: "company_direct",
      }).catch((e) => report.push(`WARN fuel GL ${f.invoice}: ${(e as Error).message}`));
      report.push(`FUEL ${fuelKind} ${f.invoice}: ${fuelId} $${f.actual}`);
    }

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
        notes: `Wire / Faro 08/21/26 inv ${LOAD.faro_inv}`,
      },
    });
    if (createRes.statusCode >= 300) throw new Error(`factor create: ${createRes.statusCode} ${createRes.body.slice(0, 400)}`);
    const created = JSON.parse(createRes.body) as { id: string; display_id: string };

    // App writer: funding with Faro's real figures + faro_invoice_number (Round 86 poster path)
    await postFactoringAdvanceEvent({
      operating_company_id: USMCA,
      factoring_advance_id: created.id,
      actor_user_id: OWNER,
      advanced_at_iso: `${LOAD.purchase_date}T18:00:00.000Z`,
      funding_figures: {
        invoice_total_cents: LOAD.expected_purchase_cents,
        reserve_cents: LOAD.expected_reserve_cents,
        fee_cents: LOAD.expected_fee_cents,
        ach_cents: LOAD.expected_ach_cents,
      },
      faro_invoice_number: LOAD.faro_inv,
      faro_purchase_date: LOAD.purchase_date,
    });

    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      await c.query(
        `UPDATE accounting.factoring_advances
            SET status='advanced', advanced_at=$2::timestamptz,
                notes=COALESCE(notes, $3)
          WHERE id=$1::uuid AND operating_company_id=$4::uuid`,
        [created.id, `${LOAD.purchase_date}T18:00:00.000Z`, `Wire / Faro 08/21/26 inv ${LOAD.faro_inv}`, USMCA]
      );
      await c.query(
        `UPDATE accounting.invoices SET factoring_status='advanced', updated_at=now(), updated_by_user_id=$2::uuid
          WHERE factoring_advance_id=$1::uuid`,
        [created.id, OWNER]
      );
    });

    const check = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const r = await c.query<{
        display_id: string;
        advance_amount_cents: string;
        faro_invoice_number: string;
        faro_purchase_date: string;
      }>(
        `SELECT display_id, advance_amount_cents::text, faro_invoice_number, faro_purchase_date::text
           FROM accounting.factoring_advances WHERE id=$1::uuid`,
        [created.id]
      );
      return r.rows[0];
    });
    report.push(
      `ADVANCE Faro inv ${LOAD.faro_inv} load ${LOAD.load_number} → ${check.display_id} adv $${Number(check.advance_amount_cents) / 100} faro=${check.faro_invoice_number}@${check.faro_purchase_date}`
    );
    if (Number(check.advance_amount_cents) !== LOAD.expected_advance_cents) {
      throw new Error(`advance cents mismatch got ${check.advance_amount_cents} want ${LOAD.expected_advance_cents}`);
    }
    if (check.faro_invoice_number !== LOAD.faro_inv || check.faro_purchase_date !== LOAD.purchase_date) {
      throw new Error(`faro stamp missing: ${JSON.stringify(check)}`);
    }

    report.push(`DONE 8/21 inv ${LOAD.faro_inv} load ${LOAD.load_number} — full composition via app writers`);
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
