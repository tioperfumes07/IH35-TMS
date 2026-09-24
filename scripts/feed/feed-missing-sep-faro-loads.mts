#!/usr/bin/env tsx
/**
 * Book + invoice + Faro FA for Sep loads that exist on FARO LOAD MAP but are missing from app.
 * Does NOT touch banking.
 *
 *   E11_LEAD_AUTH=1 IH35_TEST_AUTH_BYPASS=1 npx tsx scripts/feed/feed-missing-sep-faro-loads.mts
 *   ... --apply
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bookLoad, type BookLoadInput } from "../../apps/backend/src/dispatch/book-load.service.js";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { convertProformaToOfficial } from "../../apps/backend/src/accounting/proforma-convert.service.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerLoadRoutes } from "../../apps/backend/src/mdata/loads.routes.js";
import invoicesPlugin from "../../apps/backend/src/accounting/invoices.routes.js";
import factoringAdvancesPlugin from "../../apps/backend/src/accounting/factoring-advances.routes.js";
import { postLoadRevenueLatch } from "../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.js";
import { postFactoringAdvanceEvent } from "../../apps/backend/src/accounting/factoring-posting/poster.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const FARO_VENDOR = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4";
const FARO_PROFILE = "40b3690b-f1d4-44b4-90cf-c1cfd4f79c33";
const UNIT_T175 = "507921c7-ab1c-4fa7-bd7c-7f42552f7423";
const DRIVER_LEONEL = "ac9ea24d-25a5-4e4f-b23e-aa90294357ac";
const HAWKEYE = "ba40f2bf-6033-41fc-8078-841c34c15029";
const REFRIGERX = "684f5776-403b-422d-bc5e-2b44ae3b6a2c";
const SEMARES = "04b65d8b-a1a3-4580-9224-d0f16b0946f5";
const APPLY = process.argv.includes("--apply");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DL = "/Users/jorgemunoz/Downloads/IH35-RECONCILIATION-AND-FEED";

type Spec = {
  load_number: string;
  faro_inv: string;
  purchase_date: string; // ISO
  faro_date: string; // m/d/yy
  customer_id: string;
  wo: string;
  linehaul: number; // Faro purchase gross (invoice amount)
  miles: number;
};

const SPECS: Spec[] = [
  { load_number: "13563", faro_inv: "46", purchase_date: "2026-09-03", faro_date: "9/3/26", customer_id: HAWKEYE, wo: "66174", linehaul: 600, miles: 7.2 },
  { load_number: "13612", faro_inv: "64", purchase_date: "2026-09-11", faro_date: "9/11/26", customer_id: SEMARES, wo: "SEM66514", linehaul: 4900, miles: 1958.9 },
  { load_number: "13615", faro_inv: "87", purchase_date: "2026-09-21", faro_date: "9/21/26", customer_id: SEMARES, wo: "SEM66538", linehaul: 4900, miles: 1958.9 },
  { load_number: "13610", faro_inv: "90", purchase_date: "2026-09-21", faro_date: "9/21/26", customer_id: REFRIGERX, wo: "1013737", linehaul: 5900, miles: 1903 },
  { load_number: "13613", faro_inv: "92", purchase_date: "2026-09-21", faro_date: "9/21/26", customer_id: REFRIGERX, wo: "1013583-2", linehaul: 5700, miles: 1897.7 },
  { load_number: "13614", faro_inv: "93", purchase_date: "2026-09-21", faro_date: "9/21/26", customer_id: REFRIGERX, wo: "1013707", linehaul: 3450, miles: 1137.4 },
  // Faro export transposed Inv#/PO — day_control key is 1013272-2; true PO is 1013272-2; Faro inv unnumbered.
  // FARO LOAD MAP omitted this row; feed as load 13619 (next free) with WO=1013272-2. FA faro_invoice_number=1013272-2.
  { load_number: "13619", faro_inv: "1013272-2", purchase_date: "2026-09-08", faro_date: "9/8/26", customer_id: REFRIGERX, wo: "1013272-2", linehaul: 5210, miles: 0 },
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

function parseMoney(s: string | undefined) {
  if (s == null || s === "") return 0;
  return Number(String(s).replace(/[$,]/g, "").trim() || 0);
}

function loadCsv(path: string) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols: string[] = [];
    let cur = "",
      inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === "," && !inQ) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("set E11_LEAD_AUTH=1");

async function feedOne(
  app: Awaited<ReturnType<typeof createIntegrationApp>>,
  LOAD: Spec,
  purchase: Record<string, string>[]
) {
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
    console.log(`SKIP FA inv ${LOAD.faro_inv} already ${existingFa}`);
    return;
  }

  let loadId = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string }>(
      `SELECT id::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2 AND soft_deleted_at IS NULL LIMIT 1`,
      [USMCA, LOAD.load_number]
    );
    return r.rows[0]?.id ?? null;
  });

  if (!APPLY) {
    console.log(`DRY book+invoice+FA ${LOAD.load_number} inv ${LOAD.faro_inv} $${LOAD.linehaul} loadId=${loadId ?? "NEW"}`);
    return;
  }

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
      customer_wo_number: LOAD.wo,
      is_sample_data: false,
      notes: `Faro LOAD MAP feed — inv ${LOAD.faro_inv} / WO ${LOAD.wo}`,
      charges: [{ code: "linehaul", amount_cents: cents(LOAD.linehaul) }],
      stops: [
        {
          stop_type: "pickup",
          sequence_number: 1,
          city: "LAREDO",
          state: "TX",
          postal_code: "78045",
          facility_name: "Origin",
          scheduled_arrival_at: `${LOAD.purchase_date}T08:00:00.000Z`,
          time_window_type: "appointment",
        },
        {
          stop_type: "delivery",
          sequence_number: 2,
          city: "LAREDO",
          state: "TX",
          postal_code: "78045",
          facility_name: "Destination",
          scheduled_arrival_at: `${LOAD.purchase_date}T18:00:00.000Z`,
          time_window_type: "appointment",
        },
      ],
      save_mode: "book_dispatch",
      assigned_unit_id: UNIT_T175,
      trailer_type: "dry_van",
      miles_practical: LOAD.miles,
      miles_deadhead: 0,
      mileage_source: "History",
      override_reason: `Historical Faro feed: load ${LOAD.load_number} purchased ${LOAD.faro_date}`,
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
    console.log(`LOAD created ${LOAD.load_number}`);
  } else {
    console.log(`LOAD resume ${LOAD.load_number}`);
  }

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(
      `UPDATE mdata.loads SET assigned_primary_driver_id=$1::uuid, factoring_company_vendor_id=$2::uuid,
          status='completed_docs_received', updated_at=now() WHERE id=$3::uuid`,
      [DRIVER_LEONEL, FARO_VENDOR, loadId]
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
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/loads/${loadId}/stops/${s.id}`,
      headers: auth,
      payload: {
        actual_arrival_at: `${LOAD.purchase_date}T08:00:00.000Z`,
        actual_departure_at: `${LOAD.purchase_date}T09:00:00.000Z`,
      },
    });
    console.log(`STOP ${s.stop_type}: ${patch.statusCode}`);
  }

  let invoiceRow = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(`UPDATE mdata.loads SET status='completed_docs_received', updated_at=now() WHERE id=$1::uuid`, [
      loadId,
    ]);
    try {
      const conv = await convertProformaToOfficial(c as never, {
        operatingCompanyId: USMCA,
        loadId: loadId!,
        userId: OWNER,
      });
      console.log(`CONVERT ${JSON.stringify(conv)}`);
    } catch (e) {
      console.log(`CONVERT note: ${(e as Error).message?.slice(0, 160)}`);
    }
    const r = await c.query<{ id: string; status: string }>(
      `SELECT id::text, status::text FROM accounting.invoices
        WHERE operating_company_id=$1::uuid AND (display_id=$2 OR source_load_id=$3::uuid)
          AND voided_at IS NULL AND status<>'void' LIMIT 1`,
      [USMCA, LOAD.load_number, loadId]
    );
    return r.rows[0] ?? null;
  });

  if (!invoiceRow) {
    const fl = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/from-load?operating_company_id=${USMCA}`,
      headers: auth,
      payload: { load_id: loadId },
    });
    if (fl.statusCode >= 300) throw new Error(`from-load: ${fl.statusCode} ${fl.body.slice(0, 300)}`);
    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      await convertProformaToOfficial(c as never, {
        operatingCompanyId: USMCA,
        loadId: loadId!,
        userId: OWNER,
      });
      const r = await c.query<{ id: string; status: string }>(
        `SELECT id::text, status::text FROM accounting.invoices
          WHERE operating_company_id=$1::uuid AND source_load_id=$2::uuid AND voided_at IS NULL LIMIT 1`,
        [USMCA, loadId]
      );
      invoiceRow = r.rows[0] ?? null;
    });
  }

  if (!invoiceRow) throw new Error(`no invoice for ${LOAD.load_number}`);
  const invoiceId = invoiceRow.id;

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(
      `UPDATE accounting.invoices SET total_cents=$2, updated_at=now() WHERE id=$1::uuid AND ABS(total_cents - $2) > 1`,
      [invoiceId, cents(LOAD.linehaul)]
    );
  });

  if (invoiceRow.status !== "sent") {
    const sendRes = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/${invoiceId}/send?operating_company_id=${USMCA}`,
      headers: auth,
      payload: {},
    });
    console.log(`SEND ${sendRes.statusCode} ${sendRes.body.slice(0, 120)}`);
    if (sendRes.statusCode >= 300) throw new Error(`send: ${sendRes.body.slice(0, 400)}`);
  }

  await postLoadRevenueLatch({
    operating_company_id: USMCA,
    load_id: loadId!,
    target_status: "delivered_pending_docs",
    entry_date_iso: LOAD.purchase_date,
    actor_user_id: OWNER,
  }).catch((e) => console.log(`WARN revrec1: ${(e as Error).message?.slice(0, 100)}`));
  await postLoadRevenueLatch({
    operating_company_id: USMCA,
    load_id: loadId!,
    target_status: "completed_docs_received",
    entry_date_iso: LOAD.purchase_date,
    actor_user_id: OWNER,
  }).catch((e) => console.log(`WARN revrec2: ${(e as Error).message?.slice(0, 100)}`));

  const purchaseRow = purchase.find((r) => r.Date === LOAD.faro_date && String(r["Inv #"]) === LOAD.faro_inv);
  const purchaseCents = cents(parseMoney(purchaseRow?.Purchase) || LOAD.linehaul);
  const escrow = parseMoney(purchaseRow?.["Escrow Rsv"]);
  const cashRsv = parseMoney(purchaseRow?.["Cash Rsv"]);
  const discount = parseMoney(purchaseRow?.Discount);
  const fees = parseMoney(purchaseRow?.Fees);
  const sch = parseMoney(purchaseRow?.["Sch Fee"]);
  const netAdv = parseMoney(purchaseRow?.["Net Adv"]);
  const reservePct = purchaseCents > 0 ? Number((((escrow + cashRsv) / (purchaseCents / 100)) * 100).toFixed(4)) : 1.5;
  const feePct = purchaseCents > 0 ? Number((((discount + fees + sch) / (purchaseCents / 100)) * 100).toFixed(4)) : 1.5;
  const useReserve = Math.abs(reservePct - 1.5) < 0.05 ? 1.5 : reservePct;
  const useFee = Math.abs(feePct - 1.5) < 0.25 ? 1.5 : feePct;

  const createRes = await app.inject({
    method: "POST",
    url: `/api/v1/accounting/factoring-advances?operating_company_id=${USMCA}`,
    headers: auth,
    payload: {
      factoring_company_vendor_id: FARO_VENDOR,
      submission_batch_ref: `FARO-${LOAD.purchase_date}-INV-${LOAD.faro_inv}`,
      invoice_ids: [invoiceId],
      reserve_pct: useReserve,
      factor_fee_pct: useFee,
      notes: `Wire / Faro ${LOAD.faro_date} inv ${LOAD.faro_inv} load ${LOAD.load_number}`,
    },
  });
  if (createRes.statusCode >= 300) throw new Error(`FA create ${createRes.statusCode} ${createRes.body.slice(0, 300)}`);
  const created = JSON.parse(createRes.body) as { id: string; display_id: string };
  const reserveCents = Math.round((purchaseCents * useReserve) / 100);
  const feeCents = Math.round((purchaseCents * useFee) / 100);
  const advanceCents = purchaseCents - reserveCents - feeCents;

  await postFactoringAdvanceEvent({
    operating_company_id: USMCA,
    factoring_advance_id: created.id,
    actor_user_id: OWNER,
    advanced_at_iso: `${LOAD.purchase_date}T18:00:00.000Z`,
    funding_figures: {
      invoice_total_cents: purchaseCents,
      reserve_cents: reserveCents,
      fee_cents: feeCents,
      ach_cents: Math.round(netAdv * 100) || advanceCents,
    },
    faro_invoice_number: LOAD.faro_inv,
    faro_purchase_date: LOAD.purchase_date,
  });

  const feeBlob = {
    escrow_rsv: escrow,
    cash_rsv: cashRsv,
    discount,
    fees,
    sch_fee: sch,
    net_adv: netAdv || advanceCents / 100,
    purchase: purchaseCents / 100,
    load: LOAD.load_number,
  };
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(
      `UPDATE accounting.factoring_advances
          SET status='advanced', advanced_at=$2::timestamptz,
              notes=$3, faro_invoice_number=$4, faro_purchase_date=$5::date
        WHERE id=$1::uuid`,
      [
        created.id,
        `${LOAD.purchase_date}T18:00:00.000Z`,
        `Wire / Faro ${LOAD.faro_date} inv ${LOAD.faro_inv} | FARO_FEES=${JSON.stringify(feeBlob)}`,
        LOAD.faro_inv,
        LOAD.purchase_date,
      ]
    );
    await c.query(
      `UPDATE accounting.invoices
          SET factoring_status='advanced',
              factor_profile_id=COALESCE(factor_profile_id, $3::uuid),
              updated_at=now(), updated_by_user_id=$2::uuid
        WHERE factoring_advance_id=$1::uuid`,
      [created.id, OWNER, FARO_PROFILE]
    );
  });
  console.log(`CREATED FA ${LOAD.faro_inv} ${created.display_id} ← ${LOAD.load_number} $${purchaseCents / 100}`);
}

async function main() {
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const purchase = loadCsv(join(DL, "03-SOURCE-DOCUMENTS/PURCHASE REPORT ALL.csv"));
  // fix WO for 93 from purchase if present
  const p93 = purchase.find((r) => r.Date === "9/21/26" && r["Inv #"] === "93");
  if (p93?.PO) SPECS.find((s) => s.faro_inv === "93")!.wo = p93.PO;

  const app = await createIntegrationApp(async (a) => {
    await registerLoadRoutes(a);
    await (invoicesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
    await (factoringAdvancesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
  });
  try {
    for (const s of SPECS) {
      console.log(`\n=== ${s.load_number} inv ${s.faro_inv} ===`);
      await feedOne(app, s, purchase);
    }
  } finally {
    await app.close();
  }
  console.log(APPLY ? "\nDONE apply" : "\nDRY done — pass --apply");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
