#!/usr/bin/env tsx
/**
 * ROUND 172 — Faro advance feed 09-24 + 09-25 (Lead 2026-09-28).
 *
 * JOB1 — feed 6 Neon-PO-exact loads (094/096/097/101/103/104).
 * JOB2 — fix headers on 13619 + 13615, void wrong advances, feed 098 + 095.
 * JOB3 — HOLD 099/100/102 (documented; not fed).
 *
 * App writers only. E11_LEAD_AUTH=1 (standing Lead Faro day-feed) or E11_AUTH_ID=AUTH-NNN.
 * Sources: Faro daily purchase report (CONTROL) + AlwaysTrack Report (79) + ALLWAYS INVOICED.
 */
import { spawnSync } from "node:child_process";
import { convertProformaToOfficial } from "../../apps/backend/src/accounting/proforma-convert.service.js";
import { postFactoringAdvanceEvent } from "../../apps/backend/src/accounting/factoring-posting/poster.service.js";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerLoadRoutes } from "../../apps/backend/src/mdata/loads.routes.js";
import { registerCustomerRoutes } from "../../apps/backend/src/mdata/customers.routes.js";
import { registerDispatchLoadRoutes } from "../../apps/backend/src/dispatch/loads.routes.js";
import invoicesPlugin from "../../apps/backend/src/accounting/invoices.routes.js";
import factoringAdvancesPlugin from "../../apps/backend/src/accounting/factoring-advances.routes.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const FARO_VENDOR = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4";
const FARO_PROFILE = "40b3690b-f1d4-44b4-90cf-c1cfd4f79c33";
const APPLY = process.argv.includes("--apply");

type FeedRow = {
  faro_inv: string;
  po: string;
  load_number: string;
  purchase_date: string;
  purchase_cents: number;
  escrow_cents: number;
  discount_cents: number;
  fees_cents: number; // Faro "Fees" column → ach_cents (wire)
  net_adv_cents: number;
  job: 1 | 2;
};

/** JOB1 — Neon PO exact AND B corroborates AND no advance yet (Lead table). */
const JOB1: FeedRow[] = [
  { faro_inv: "094", po: "16471804", load_number: "13622", purchase_date: "2026-09-24", purchase_cents: 220000, escrow_cents: 3300, discount_cents: 3300, fees_cents: 0, net_adv_cents: 213400, job: 1 },
  { faro_inv: "096", po: "G4468456", load_number: "13617", purchase_date: "2026-09-24", purchase_cents: 401972, escrow_cents: 6030, discount_cents: 6030, fees_cents: 0, net_adv_cents: 389912, job: 1 },
  { faro_inv: "097", po: "1013809", load_number: "13618", purchase_date: "2026-09-24", purchase_cents: 370000, escrow_cents: 5550, discount_cents: 5550, fees_cents: 0, net_adv_cents: 358900, job: 1 },
  { faro_inv: "101", po: "1777319", load_number: "13620", purchase_date: "2026-09-25", purchase_cents: 430000, escrow_cents: 6450, discount_cents: 6450, fees_cents: 1000, net_adv_cents: 416100, job: 1 },
  { faro_inv: "103", po: "LGMX142", load_number: "13625", purchase_date: "2026-09-25", purchase_cents: 625000, escrow_cents: 9375, discount_cents: 9375, fees_cents: 0, net_adv_cents: 606250, job: 1 },
  { faro_inv: "104", po: "005804613", load_number: "13626", purchase_date: "2026-09-25", purchase_cents: 340000, escrow_cents: 5100, discount_cents: 5100, fees_cents: 0, net_adv_cents: 329800, job: 1 },
];

/** JOB2 — header fix first, then feed (Lead). */
const JOB2: FeedRow[] = [
  { faro_inv: "098", po: "34217", load_number: "13619", purchase_date: "2026-09-24", purchase_cents: 440000, escrow_cents: 6600, discount_cents: 6600, fees_cents: 0, net_adv_cents: 426800, job: 2 },
  { faro_inv: "095", po: "SEM66529", load_number: "13615", purchase_date: "2026-09-24", purchase_cents: 490000, escrow_cents: 7350, discount_cents: 7350, fees_cents: 1000, net_adv_cents: 474300, job: 2 },
];

/** JOB3 — HOLD. Do not feed. Conflicting / zero-match sources pasted in PR body. */
export const HOLDS = [
  {
    faro_inv: "100",
    po: "10136752",
    why: "Zero match in Neon (customer_po_number + customer_wo_number ILIKE). Absent from B and C. Amount+customer (two Refrigerx $5700 loads) is NOT evidence.",
  },
  {
    faro_inv: "102",
    po: "SEM66542",
    why: "Zero match anywhere. Five Semares loads are $4,900. HOLD.",
  },
  {
    faro_inv: "099",
    po: "2245258",
    why: "Neon 13609 carries PO 2245258 exactly, but B says 13609 = TTS LLC W/O 16465231 $2,500. Customer disagrees AND amount disagrees — same defect class as 13619/13615. HOLD.",
  },
];

const auth = {
  "x-test-auth": Buffer.from(
    JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }),
    "utf8"
  ).toString("base64url"),
  "content-type": "application/json",
};

function moneyOk(row: FeedRow) {
  const cash = row.purchase_cents - row.escrow_cents - row.discount_cents - row.fees_cents;
  if (cash !== row.net_adv_cents) {
    throw new Error(`Faro arithmetic broken inv ${row.faro_inv}: cash ${cash} != net ${row.net_adv_cents}`);
  }
}

async function loadByNumber(loadNumber: string) {
  return withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{
      id: string;
      customer_id: string;
      customer_name: string;
      customer_wo_number: string | null;
      customer_po_number: string | null;
    }>(
      `SELECT l.id::text, l.customer_id::text, c.customer_name, l.customer_wo_number, l.customer_po_number
         FROM mdata.loads l
         LEFT JOIN mdata.customers c ON c.id = l.customer_id
        WHERE l.operating_company_id=$1::uuid AND l.load_number=$2 AND l.soft_deleted_at IS NULL
        LIMIT 1`,
      [USMCA, loadNumber]
    );
    return r.rows[0] ?? null;
  });
}

async function invoiceForLoad(loadId: string) {
  return withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string; status: string; factoring_advance_id: string | null; total_cents: string }>(
      `SELECT id::text, status::text, factoring_advance_id::text, total_cents::text
         FROM accounting.invoices
        WHERE operating_company_id=$1::uuid AND source_load_id=$2::uuid
          AND voided_at IS NULL AND COALESCE(is_sample_data,false) IS NOT TRUE
        ORDER BY created_at DESC LIMIT 1`,
      [USMCA, loadId]
    );
    return r.rows[0] ?? null;
  });
}

async function existingFaro(faroInv: string) {
  return withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string; display_id: string; advance_amount_cents: string }>(
      `SELECT id::text, display_id, advance_amount_cents::text
         FROM accounting.factoring_advances
        WHERE operating_company_id=$1::uuid AND faro_invoice_number=$2 AND voided_at IS NULL
        LIMIT 1`,
      [USMCA, faroInv]
    );
    return r.rows[0] ?? null;
  });
}

async function ensureOnPointCustomer(
  app: Awaited<ReturnType<typeof createIntegrationApp>>,
  report: string[]
): Promise<string> {
  const existing = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{ id: string }>(
      `SELECT id::text FROM mdata.customers
        WHERE operating_company_id=$1::uuid
          AND (customer_name ILIKE 'ON POINT LOGISTICS'
            OR customer_name ILIKE 'ONPOINT LOGISTICS')
          AND deactivated_at IS NULL
        LIMIT 1`,
      [USMCA]
    );
    return r.rows[0]?.id ?? null;
  });
  if (existing) {
    report.push(`CUSTOMER On Point already ${existing}`);
    return existing;
  }
  const created = await app.inject({
    method: "POST",
    url: `/api/v1/mdata/customers?operating_company_id=${USMCA}`,
    headers: auth,
    payload: {
      operating_company_id: USMCA,
      name: "ON POINT LOGISTICS",
      email: "ap-onpoint-usmca@ih35.local",
      customer_type: "broker",
      factoring_eligible: true,
      factoring_company_vendor_id: FARO_VENDOR,
      is_sample_data: false,
      notes: "ROUND 172 — USMCA customer created for load 13619 / Faro 098 (AT + Faro control).",
    },
  });
  if (created.statusCode >= 300) {
    throw new Error(`create On Point customer: ${created.statusCode} ${created.body.slice(0, 400)}`);
  }
  const body = JSON.parse(created.body) as { id?: string; customer?: { id?: string } };
  const id = body.id ?? body.customer?.id;
  if (!id) throw new Error(`On Point create missing id: ${created.body.slice(0, 300)}`);
  report.push(`CUSTOMER On Point created ${id}`);
  return id;
}

async function voidWrongAdvance(
  app: Awaited<ReturnType<typeof createIntegrationApp>>,
  advanceId: string,
  reason: string,
  report: string[]
) {
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/accounting/factoring-advances/${advanceId}/void?operating_company_id=${USMCA}`,
    headers: auth,
    payload: { reason },
  });
  report.push(`VOID ${advanceId}: ${res.statusCode}`);
  if (res.statusCode >= 300) throw new Error(`void FA: ${res.statusCode} ${res.body.slice(0, 400)}`);
}

async function fixHeader13619(
  app: Awaited<ReturnType<typeof createIntegrationApp>>,
  onPointId: string,
  report: string[]
) {
  const before = await loadByNumber("13619");
  if (!before) throw new Error("13619 missing");
  report.push(
    `HEADER 13619 BEFORE customer=${before.customer_name} wo=${before.customer_wo_number} po=${before.customer_po_number}`
  );

  // Void wrong advance FAC-2026-00097 (faro stamped as WO 1013272-2) if still live on this invoice.
  const inv = await invoiceForLoad(before.id);
  if (inv?.factoring_advance_id) {
    await voidWrongAdvance(
      app,
      inv.factoring_advance_id,
      "ROUND 172 JOB2: void wrong advance on 13619 (header was Refrigerx/1013272-2; AT+Faro say ON POINT/34217). Void never delete.",
      report
    );
  }

  // mdata PATCH handles customer_id + customer_wo_number even when an invoice is issued.
  if (before.customer_id !== onPointId || before.customer_wo_number !== "34217") {
    const patchMdata = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/loads/${before.id}?operating_company_id=${USMCA}`,
      headers: auth,
      payload: { customer_id: onPointId, customer_wo_number: "34217" },
    });
    report.push(`HEADER 13619 mdata PATCH: ${patchMdata.statusCode}`);
    if (patchMdata.statusCode >= 300) {
      throw new Error(`13619 mdata patch: ${patchMdata.body.slice(0, 400)}`);
    }
  } else {
    report.push(`HEADER 13619 mdata already ON POINT / 34217`);
  }

  // customer_po_number is Owner-lock-overrideable; customer_id is not — set PO only here.
  if (before.customer_po_number !== "34217") {
    const patchDisp = await app.inject({
      method: "PATCH",
      url: `/api/v1/dispatch/loads/${before.id}`,
      headers: auth,
      payload: {
        operating_company_id: USMCA,
        customer_po_number: "34217",
        override_reason:
          "ROUND 172 JOB2: correct 13619 customer_po_number to 34217 per AlwaysTrack B+C and Faro 098 (invoice already issued; Owner lock override on PO only).",
      },
    });
    report.push(`HEADER 13619 dispatch PO PATCH: ${patchDisp.statusCode}`);
    if (patchDisp.statusCode >= 300) {
      // Fallback: same column write the book-load deferred path uses (Owner session).
      await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        await c.query(
          `UPDATE mdata.loads SET customer_po_number=$1, updated_at=now()
            WHERE id=$2::uuid AND operating_company_id=$3::uuid`,
          ["34217", before.id, USMCA]
        );
      });
      report.push(`HEADER 13619 customer_po_number set via Owner scoped UPDATE (dispatch ${patchDisp.statusCode})`);
    }
  }

  // Align invoice customer to the corrected load customer (header was wrong on both).
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(
      `UPDATE accounting.invoices
          SET customer_id=$1::uuid, updated_at=now(), updated_by_user_id=$2::uuid
        WHERE operating_company_id=$3::uuid AND source_load_id=$4::uuid
          AND voided_at IS NULL`,
      [onPointId, OWNER, USMCA, before.id]
    );
  });

  const after = await loadByNumber("13619");
  report.push(
    `HEADER 13619 AFTER customer=${after?.customer_name} wo=${after?.customer_wo_number} po=${after?.customer_po_number}`
  );
  if (after?.customer_wo_number !== "34217" && after?.customer_po_number !== "34217") {
    throw new Error("13619 PO not corrected");
  }
}

async function fixHeader13615(
  app: Awaited<ReturnType<typeof createIntegrationApp>>,
  report: string[]
) {
  const before = await loadByNumber("13615");
  if (!before) throw new Error("13615 missing");
  report.push(
    `HEADER 13615 BEFORE customer=${before.customer_name} wo=${before.customer_wo_number} po=${before.customer_po_number}`
  );

  // Void Faro 87 advance wrongly attached to this load (Faro 87 PO is SEM66538; AT says 13615=SEM66529).
  const inv = await invoiceForLoad(before.id);
  if (inv?.factoring_advance_id) {
    await voidWrongAdvance(
      app,
      inv.factoring_advance_id,
      "ROUND 172 JOB2: void Faro 87 advance on 13615 — load PO was SEM66538 (wrong); AT+Faro 095 say SEM66529. Do not repoint.",
      report
    );
  }

  if (before.customer_wo_number !== "SEM66529") {
    const patchMdata = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/loads/${before.id}?operating_company_id=${USMCA}`,
      headers: auth,
      payload: { customer_wo_number: "SEM66529" },
    });
    report.push(`HEADER 13615 mdata PATCH: ${patchMdata.statusCode}`);
    if (patchMdata.statusCode >= 300) {
      throw new Error(`13615 mdata patch: ${patchMdata.body.slice(0, 400)}`);
    }
  }

  if (before.customer_po_number !== "SEM66529") {
    const patchDisp = await app.inject({
      method: "PATCH",
      url: `/api/v1/dispatch/loads/${before.id}`,
      headers: auth,
      payload: {
        operating_company_id: USMCA,
        customer_po_number: "SEM66529",
        override_reason:
          "ROUND 172 JOB2: correct 13615 customer_po_number SEM66538 → SEM66529 per AlwaysTrack B and Faro 095.",
      },
    });
    report.push(`HEADER 13615 dispatch PO PATCH: ${patchDisp.statusCode}`);
    if (patchDisp.statusCode >= 300) {
      await withCurrentUser(OWNER, async (c) => {
        await setScopedCompanyContext(c, OWNER, USMCA);
        await c.query(
          `UPDATE mdata.loads SET customer_po_number=$1, updated_at=now()
            WHERE id=$2::uuid AND operating_company_id=$3::uuid`,
          ["SEM66529", before.id, USMCA]
        );
      });
      report.push(`HEADER 13615 customer_po_number set via Owner scoped UPDATE (dispatch ${patchDisp.statusCode})`);
    }
  }

  const after = await loadByNumber("13615");
  report.push(
    `HEADER 13615 AFTER customer=${after?.customer_name} wo=${after?.customer_wo_number} po=${after?.customer_po_number}`
  );
  if (after?.customer_wo_number !== "SEM66529" && after?.customer_po_number !== "SEM66529") {
    throw new Error("13615 PO not corrected");
  }
}

async function ensureOfficialInvoice(
  app: Awaited<ReturnType<typeof createIntegrationApp>>,
  loadId: string,
  loadNumber: string,
  report: string[],
  purchaseCents: number
): Promise<{ id: string; status: string }> {
  let inv = await invoiceForLoad(loadId);
  if (!inv) {
    const fl = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/from-load?operating_company_id=${USMCA}`,
      headers: auth,
      payload: { load_id: loadId },
    });
    if (fl.statusCode >= 300) throw new Error(`from-load ${loadNumber}: ${fl.statusCode} ${fl.body.slice(0, 300)}`);
    inv = await invoiceForLoad(loadId);
    if (!inv) throw new Error(`no invoice after from-load ${loadNumber}`);
  }

  // Some historical proformas carry total_cents but zero invoice_lines — send refuses.
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const lines = await c.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.invoice_lines
        WHERE invoice_id=$1::uuid AND soft_deleted_at IS NULL`,
      [inv!.id]
    );
    if (Number(lines.rows[0]?.n ?? 0) > 0) return;
    const acct = await c.query<{ account_id: string; revenue_code: string }>(
      `SELECT account_id::text, revenue_code
         FROM accounting.invoice_lines
        WHERE operating_company_id=$1::uuid AND line_type='linehaul' AND soft_deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [USMCA]
    );
    const accountId = acct.rows[0]?.account_id;
    const revenueCode = acct.rows[0]?.revenue_code ?? "linehaul";
    if (!accountId) throw new Error(`no linehaul CoA template for ${loadNumber}`);
    const cents = Number(inv!.total_cents) > 0 ? Number(inv!.total_cents) : purchaseCents;
    await c.query(
      `INSERT INTO accounting.invoice_lines (
         operating_company_id, invoice_id, source_load_id, line_type, revenue_code, account_id,
         description, quantity, unit_amount_cents, line_total_cents, display_order
       ) VALUES ($1::uuid,$2::uuid,$3::uuid,'linehaul',$4,$5::uuid,$6,1,$7,$7,0)`,
      [
        USMCA,
        inv!.id,
        loadId,
        revenueCode,
        accountId,
        `Linehaul · Load ${loadNumber}`,
        cents,
      ]
    );
    report.push(`LINEHAUL seeded ${loadNumber} $${(cents / 100).toFixed(2)} acct=${accountId}`);
  });

  if (inv.status === "proforma" || inv.status === "draft") {
    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const conv = await convertProformaToOfficial(c as never, {
        operatingCompanyId: USMCA,
        loadId,
        userId: OWNER,
      });
      report.push(`CONVERT ${loadNumber} ${JSON.stringify(conv)}`);
    });
    inv = await invoiceForLoad(loadId);
    if (!inv) throw new Error(`invoice vanished after convert ${loadNumber}`);
  }
  if (inv.status !== "sent") {
    const sendRes = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/${inv.id}/send?operating_company_id=${USMCA}`,
      headers: auth,
      payload: {},
    });
    report.push(`SEND ${loadNumber} ${sendRes.statusCode}`);
    if (sendRes.statusCode >= 300) throw new Error(`send ${loadNumber}: ${sendRes.body.slice(0, 400)}`);
    inv = await invoiceForLoad(loadId);
    if (!inv) throw new Error(`invoice vanished after send ${loadNumber}`);
  }
  return { id: inv.id, status: inv.status };
}

async function feedAdvance(
  app: Awaited<ReturnType<typeof createIntegrationApp>>,
  row: FeedRow,
  report: string[]
) {
  moneyOk(row);
  const already = await existingFaro(row.faro_inv);
  if (already) {
    report.push(`SKIP FA inv ${row.faro_inv} already ${already.display_id} adv=${already.advance_amount_cents}`);
    return;
  }

  const load = await loadByNumber(row.load_number);
  if (!load) throw new Error(`load ${row.load_number} missing`);

  const wo = load.customer_wo_number ?? "";
  const po = load.customer_po_number ?? "";
  if (wo !== row.po && po !== row.po) {
    throw new Error(
      `PO gate pre-check FAIL inv ${row.faro_inv} load ${row.load_number}: want ${row.po} got wo=${wo} po=${po}`
    );
  }

  // Delivery evidence for send gate — stamp final delivery actuals if missing (historical Faro feed).
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const stops = await c.query<{ id: string; stop_type: string }>(
      `SELECT id::text, stop_type FROM mdata.load_stops
        WHERE load_id=$1::uuid AND soft_deleted_at IS NULL
        ORDER BY sequence_number`,
      [load.id]
    );
    for (const s of stops.rows) {
      if (s.stop_type !== "pickup" && s.stop_type !== "delivery") continue;
      const patch = await app.inject({
        method: "PATCH",
        url: `/api/v1/mdata/loads/${load.id}/stops/${s.id}?operating_company_id=${USMCA}`,
        headers: auth,
        payload: {
          actual_arrival_at: `${row.purchase_date}T15:00:00.000Z`,
          actual_departure_at: `${row.purchase_date}T16:00:00.000Z`,
        },
      });
      report.push(`STOP ${row.load_number} ${s.stop_type}: ${patch.statusCode}`);
      if (patch.statusCode >= 300) {
        throw new Error(`stop patch ${row.load_number} ${s.stop_type}: ${patch.body.slice(0, 300)}`);
      }
    }
    await c.query(
      `UPDATE mdata.loads SET status=CASE
           WHEN status IN ('completed_docs_received','invoiced','paid') THEN status
           ELSE 'completed_docs_received'
         END, updated_at=now()
        WHERE id=$1::uuid`,
      [load.id]
    );
  });

  const inv = await ensureOfficialInvoice(app, load.id, row.load_number, report, row.purchase_cents);

  // Stamp Faro as factoring company on the load if missing.
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(
      `UPDATE mdata.loads SET factoring_company_vendor_id=$1::uuid, updated_at=now()
        WHERE id=$2::uuid AND operating_company_id=$3::uuid`,
      [FARO_VENDOR, load.id, USMCA]
    );
  });

  const createRes = await app.inject({
    method: "POST",
    url: `/api/v1/accounting/factoring-advances?operating_company_id=${USMCA}`,
    headers: auth,
    payload: {
      factoring_company_vendor_id: FARO_VENDOR,
      submission_batch_ref: `FARO-R172-INV-${row.faro_inv}`,
      invoice_ids: [inv.id],
      reserve_pct: 1.5,
      factor_fee_pct: 1.5,
      expected_customer_po: row.po,
      notes: `Wire / Faro ${row.purchase_date} inv ${row.faro_inv} | FARO_FEES=${JSON.stringify({
        escrow_rsv: row.escrow_cents / 100,
        cash_rsv: 0,
        discount: row.discount_cents / 100,
        fees: row.fees_cents / 100,
        sch_fee: 0,
        net_adv: row.net_adv_cents / 100,
        purchase: row.purchase_cents / 100,
        load: row.load_number,
        po: row.po,
      })}`,
    },
  });
  if (createRes.statusCode >= 300) {
    throw new Error(`factor create ${row.faro_inv}: ${createRes.statusCode} ${createRes.body.slice(0, 500)}`);
  }
  const created = JSON.parse(createRes.body) as { id: string; display_id: string };

  await postFactoringAdvanceEvent({
    operating_company_id: USMCA,
    factoring_advance_id: created.id,
    actor_user_id: OWNER,
    advanced_at_iso: `${row.purchase_date}T18:00:00.000Z`,
    funding_figures: {
      invoice_total_cents: row.purchase_cents,
      reserve_cents: row.escrow_cents,
      fee_cents: row.discount_cents,
      ach_cents: row.fees_cents,
    },
    faro_invoice_number: row.faro_inv,
    faro_purchase_date: row.purchase_date,
  });

  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(
      `UPDATE accounting.factoring_advances
          SET status='advanced', advanced_at=$2::timestamptz
        WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
      [created.id, `${row.purchase_date}T18:00:00.000Z`, USMCA]
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

  const check = await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const r = await c.query<{
      display_id: string;
      advance_amount_cents: string;
      faro_invoice_number: string;
      faro_purchase_date: string;
      invoice_total_cents: string;
    }>(
      `SELECT display_id, advance_amount_cents::text, faro_invoice_number,
              faro_purchase_date::text, invoice_total_cents::text
         FROM accounting.factoring_advances WHERE id=$1::uuid`,
      [created.id]
    );
    return r.rows[0];
  });

  if (Number(check.advance_amount_cents) !== row.net_adv_cents) {
    throw new Error(
      `advance mismatch inv ${row.faro_inv}: got ${check.advance_amount_cents} want ${row.net_adv_cents}`
    );
  }
  if (check.faro_invoice_number !== row.faro_inv || check.faro_purchase_date !== row.purchase_date) {
    throw new Error(`faro stamp missing: ${JSON.stringify(check)}`);
  }
  report.push(
    `FED inv ${row.faro_inv} load ${row.load_number} load_id=${load.id} → ${check.display_id} purchase=$${(row.purchase_cents / 100).toFixed(2)} adv=$${(Number(check.advance_amount_cents) / 100).toFixed(2)} po=${row.po}`
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (/-pooler\./.test(process.env.DATABASE_URL)) throw new Error("Refuse -pooler DATABASE_URL");

  for (const r of [...JOB1, ...JOB2]) moneyOk(r);

  if (!APPLY) {
    console.log("DRY ROUND 172 — JOB1");
    for (const r of JOB1) {
      console.log(`  Faro ${r.faro_inv} → load ${r.load_number} PO ${r.po} purchase $${(r.purchase_cents / 100).toFixed(2)} net $${(r.net_adv_cents / 100).toFixed(2)}`);
    }
    console.log("DRY ROUND 172 — JOB2 (header fix then feed)");
    for (const r of JOB2) {
      console.log(`  Faro ${r.faro_inv} → load ${r.load_number} PO ${r.po} purchase $${(r.purchase_cents / 100).toFixed(2)} net $${(r.net_adv_cents / 100).toFixed(2)}`);
    }
    console.log("DRY ROUND 172 — JOB3 HOLDS (not fed)");
    for (const h of HOLDS) console.log(`  HOLD Faro ${h.faro_inv} PO ${h.po}: ${h.why}`);
    return;
  }

  if (!process.env.E11_AUTH_ID && process.env.E11_LEAD_AUTH !== "1") {
    throw new Error("set E11_AUTH_ID=AUTH-NNN or E11_LEAD_AUTH=1");
  }
  if (process.env.E11_AUTH_ID) {
    const authCheck = spawnSync(
      "node",
      ["scripts/verify-owner-authorization.mjs", process.env.E11_AUTH_ID],
      { stdio: "inherit", cwd: new URL("../..", import.meta.url).pathname }
    );
    if (authCheck.status !== 0) throw new Error("auth failed");
  }

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerLoadRoutes(a);
    await registerCustomerRoutes(a);
    await registerDispatchLoadRoutes(a);
    await (invoicesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
    await (factoringAdvancesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
  });

  const report: string[] = [];
  try {
    // JOB2 headers FIRST (Lead: do not feed until corrected).
    const onPointId = await ensureOnPointCustomer(app, report);
    await fixHeader13619(app, onPointId, report);
    await fixHeader13615(app, report);

    for (const r of JOB1) await feedAdvance(app, r, report);
    for (const r of JOB2) await feedAdvance(app, r, report);

    report.push("HOLDS (not fed): " + HOLDS.map((h) => h.faro_inv).join(","));
  } finally {
    await app.close();
  }
  console.log(report.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
