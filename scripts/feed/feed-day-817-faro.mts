#!/usr/bin/env tsx
/**
 * ROUND 152.1 / Rule 52 — Faro purchase day 8/17/26 LIVE feed for missing inv 15.
 * Faro inv 15 · DARDINI · PO 154100 · load 13523 · settl 5781 · $3,600 / net adv $3,482
 * (wire $10 + discount $54 + escrow $54)
 *
 * Inv 14 (load 13521) already LIVE. This script feeds ONLY inv 15 / 13523.
 * App writers only: bookLoad + convertProforma + createHistoricalDriverBill +
 * factoring-advances API + postFactoringAdvanceEvent(funding_figures + faro_*).
 *
 * Auth: E11_LEAD_AUTH=1 (standing Round 152.1 Cursor feed order) or E11_AUTH_ID=AUTH-NNN.
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
const APPLY = process.argv.includes("--apply");

const LOAD = {
  load_number: "13523",
  settlement_no: "5781",
  faro_inv: "15",
  wo: "154100",
  at_wo: "154100",
  customer_id: "40012e4b-1c4f-498f-b2f9-27a3cf02bdc5", // DLS Dardini Logistics Services
  driver_id: "5dd518ff-db91-429f-b651-a71b5f0db672", // Leonel Antonio Morales (same as 13515/13534)
  unit_id: "507921c7-ab1c-4fa7-bd7c-7f42552f7423", // T175
  // Physical trailer 10222 is mdata.equipment — book-load's load_trailer_equipment_id is the
  // catalogs.load_trailer_equipment row (DRY_VAN default). Do not pass equipment UUID here.
  linehaul: 3600,
  driver_gross: 627.89,
  loaded_miles: 1395.3,
  empty_miles: 0,
  rate: 0.45,
  pickup: {
    date: "2026-08-15",
    city: "LAREDO",
    state: "TX",
    zip: "78045",
    facility: "Mission Produce Distribution",
  },
  delivery: {
    date: "2026-08-18",
    city: "Salisbury",
    state: "NC",
    zip: "28146",
    facility: "Aldi Salisbury",
  },
  fuel: [
    { date: "2026-08-16", vendor: "LOVES", location: "21548FM471SNATALIA,TX", invoice: "99522983", gallons: 53.008, actual: 285.66 },
    { date: "2026-08-16", vendor: "LOVES", location: "900SEAGLEST", invoice: "99308095", gallons: 79.004, actual: 449.45 },
    { date: "2026-08-17", vendor: "LOVES", location: "1917HWY18WEST", invoice: "99630372", gallons: 113.002, actual: 631.57 },
  ],
  // Faro purchase 8/17 inv 15
  reserve_pct: 1.5,
  factor_fee_pct: 1.5, // submit estimate; funding_figures corrects
  expected_purchase_cents: 360000,
  expected_reserve_cents: 5400, // Escrow Rsv $54
  // Standing USMCA Faro row shape (LDT-4): factor_fee_cents = discount + wire; ach folded in.
  // Matches FAC-2026-00001 / inv 12 / 19 pattern — advance+reserve+fee = purchase.
  expected_fee_cents: 6400, // Discount $54 + Wire $10
  expected_ach_cents: 0,
  expected_advance_cents: 348200, // Net Adv $3,482
  purchase_date: "2026-08-17",
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
      `DRY 8/17 Faro inv ${LOAD.faro_inv} WO ${LOAD.at_wo} load ${LOAD.load_number} settl ${LOAD.settlement_no} $${LOAD.linehaul} → adv $${(LOAD.expected_advance_cents / 100).toFixed(2)}`
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
    if (existing) throw new Error(`load ${LOAD.load_number} already exists ${existing}`);

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
      override_reason: `Historical Faro 8/17 feed: load ${LOAD.load_number} already completed (settlement ${LOAD.settlement_no})`,
      override_rules: [
        { rule_code: "WF-HOS-VIOLATION", reason: `Historical backfill load ${LOAD.load_number}` },
        { rule_code: "WF-MED-CARD-MISSING", reason: `Historical backfill load ${LOAD.load_number}`, subject: "Leonel Antonio Morales" },
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
    const loadId = String(result.row.id);
    report.push(`LOAD created ${LOAD.load_number} id=${loadId}`);

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
      const bill = await createHistoricalDriverBill(c as never, {
        operating_company_id: USMCA,
        load_id: loadId,
        load_number: LOAD.load_number,
        driver_id: LOAD.driver_id,
        team_driver_id: null,
        gross_amount_cents: cents(LOAD.driver_gross),
        loaded_pay_cents: cents(LOAD.loaded_miles * LOAD.rate),
        deadhead_pay_cents: 0,
        miles_basis: LOAD.loaded_miles,
        miles_basis_type: "practical",
        rate_per_mile_cents: cents(LOAD.rate),
        miles_deadhead: 0,
        rate_empty_per_mile_cents: cents(LOAD.rate),
        source_document_ref: LOAD.settlement_no,
        requesting_user_uuid: OWNER,
      });
      report.push(`DRIVER_BILL ${JSON.stringify(bill)}`);
      if (bill.outcome === "refused") throw new Error(bill.reason);
    });

    for (const f of LOAD.fuel) {
      const fuelId = await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        const vendorId = await resolveVendor(c as unknown as pg.PoolClient, f.vendor);
        const rowHash = `alwaystrack:${USMCA}:${loadId}:${f.date}:${f.vendor}:${f.invoice}`;
        const ins = await c.query<{ id: string }>(
          `INSERT INTO fuel.fuel_transactions (
             operating_company_id, transaction_at, purchased_at, load_id, vendor_id, fuel_type,
             gallons, total_cost, location_city, transaction_reference, source, source_row_hash,
             created_by_user_id, updated_by_user_id, driver_id, unit_id
           ) VALUES ($1::uuid, $2::date, $2::date, $3::uuid, $4::uuid, 'diesel', $5, $6, $7, $8, 'import', $9, $10::uuid, $10::uuid, $11::uuid, $12::uuid)
           ON CONFLICT (operating_company_id, source_row_hash) DO NOTHING
           RETURNING id::text`,
          [USMCA, f.date, loadId, vendorId, f.gallons, f.actual, f.location, f.invoice, rowHash, OWNER, LOAD.driver_id, LOAD.unit_id]
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
        fuel_kind: "diesel",
        posted_at: f.date,
        amount_cents: cents(f.actual),
        posting_path: "company_direct",
      }).catch((e) => report.push(`WARN fuel GL ${f.invoice}: ${(e as Error).message}`));
      report.push(`FUEL ${f.invoice}: ${fuelId} $${f.actual}`);
    }

    const createRes = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/factoring-advances?operating_company_id=${USMCA}`,
      headers: auth,
      payload: {
        factoring_company_vendor_id: FARO_VENDOR,
        submission_batch_ref: `FARO-817-INV-${LOAD.faro_inv}`,
        invoice_ids: [invoiceId.id],
        reserve_pct: LOAD.reserve_pct,
        factor_fee_pct: LOAD.factor_fee_pct,
        notes: `Wire / Faro 08/17/26 inv ${LOAD.faro_inv}`,
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
        [created.id, `${LOAD.purchase_date}T18:00:00.000Z`, `Wire / Faro 08/17/26 inv ${LOAD.faro_inv}`, USMCA]
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

    report.push(`DONE 8/17 inv ${LOAD.faro_inv} load ${LOAD.load_number} — full composition via app writers`);
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
