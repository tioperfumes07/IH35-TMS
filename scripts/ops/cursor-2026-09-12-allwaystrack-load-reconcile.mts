#!/usr/bin/env tsx
/**
 * cursor-2026-09-12-allwaystrack-load-reconcile.mts — owner 2026-09-12
 * ("the purchase reports are not aligned with faro ... the data should be identical. the real tours /
 *  settlements / loads data is from AllwaysTrack and the real factoring is from faro").
 *
 * ROOT CAUSE (measured, docs/reconcile/ALLWAYSTRACK-FARO-LOAD-RECONCILE-2026-09-12.md): our mdata.loads
 * are scrambled vs the AllwaysTrack LOAD HISTORY export (Report (52).xlsx, 2026-08-28..today). Wrong
 * customer/rate on a load => wrong customer invoice => wrong Faro factoring purchase. This op corrects
 * the loads back to AllwaysTrack truth THROUGH THE REAL ROUTES (no raw SQL on money), void-not-delete:
 *
 *   per corrected load with posted money behind it:
 *     1) POST /api/v1/accounting/factoring-advances/:id/void   (reversing JE) — if a wrong advance exists
 *     2) POST /api/v1/accounting/invoices/:id/void             (reversing JE) — the wrong sent invoice
 *     3) PATCH /api/v1/dispatch/loads/:id                      (customer_id / charges / W.O.) to truth
 *     4) POST /api/v1/accounting/invoices/from-load            (re-post at corrected face) + /send
 *     5) POST /api/v1/accounting/factoring-advances (+/advance) at corrected face  — if Faro purchased it
 *   ($0 legs are corrected but NOT re-invoiced/re-factored.)
 *
 * Missing loads 13579 (Semares SEM66511 $4,900, settl 5802) and 13585 (Direct Connect $2,100, Faro 09/10)
 * require a full book-load create (stops/tour) and are handled in a SEPARATE create phase — reported here.
 *
 * Usage:
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-12-allwaystrack-load-reconcile.mts            # dry-run
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-12-allwaystrack-load-reconcile.mts --apply
 */
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import invoicesPlugin from "../../apps/backend/src/accounting/invoices.routes.js";
import factoringAdvancesPlugin from "../../apps/backend/src/accounting/factoring-advances.routes.js";
import { registerDispatchLoadRoutes } from "../../apps/backend/src/dispatch/loads.routes.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const FARO_VENDOR_ID = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4";
const RESERVE_PCT = 1.5;
const FACTOR_FEE_PCT = 1.5;
const APPLY = process.argv.includes("--apply");

// AllwaysTrack Report (52) truth. rate_cents = the customer "Charges" face. refactor: keep factored at the
// corrected face when Faro purchased this WO (true where a wrong advance already exists on the load).
type Correction = {
  load: string;
  target_customer_id: string | null; // null = customer already correct
  target_wo: string | null;          // null = WO already correct
  target_rate_cents: number;
  refactor: boolean;
  hold?: string; // set => shown in dry-run, SKIPPED on --apply (needs owner factoring ruling or 13579 create)
  note: string;
};
const CORRECTIONS: Correction[] = [
  // 13563 (Hawkeye) and 13570 (XPR) were FALSE ALARMS: AllwaysTrack Report 52 "Charges" is the linehaul
  // base ($500 / $5,900), but the customer invoice + Faro purchase are the TOTAL ($600 / $6,115). Faro
  // export (11).csv confirms Faro purchased 066174=$600 and 2501086=$6,115 — our current data already
  // matches Faro exactly. NO CORRECTION. Principle: load customer/WO/existence=AllwaysTrack; $=Faro.
  { load: "13572", target_customer_id: "146067cf-67fb-4b96-b076-950168c5d563", target_wo: null, target_rate_cents: 320000, refactor: false,
    note: "customer Value Logistics -> EGRO Transport (AT); rate unchanged; no factoring" },
  { load: "13580", target_customer_id: "63464dd2-735c-4553-b341-2ef01aad48e3", target_wo: "42-1269653", target_rate_cents: 330000, refactor: true,
    hold: "entangled trio — must run atomically WITH create of missing 13579 (Semares $4,900) so that identity is not lost",
    note: "Semares $4,900 -> Triple T $3,300 (AT 13580); Semares $4,900 identity moves to NEW 13579" },
  { load: "13581", target_customer_id: "04b65d8b-a1a3-4580-9224-d0f16b0946f5", target_wo: "56210", target_rate_cents: 0, refactor: false,
    hold: "entangled trio — run with 13579/13580 atomically",
    note: "Triple T $4,900 -> Semares $0 (AT 13581, non-billed leg); void invoice+factoring, no re-post" },
  { load: "13584", target_customer_id: "bb8394a4-e093-433a-bfea-d915f8534e9b", target_wo: "2160672", target_rate_cents: 100000, refactor: false,
    note: "Armstrong $0 -> Tennessee Steel $1,000 (AT 13584, settl 5800); no backing docs, create invoice" },
];

const auth = {
  "x-test-auth": Buffer.from(JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }), "utf8").toString("base64url"),
  "content-type": "application/json",
};

type LoadState = {
  load_id: string; load_status: string; customer_id: string | null; rate_total_cents: number; wo: string | null;
  invoice_id: string | null; invoice_display: string | null; invoice_status: string | null;
  advance_id: string | null; advance_display: string | null; advance_status: string | null;
};

async function readLoad(client: pg.PoolClient, loadNumber: string): Promise<LoadState | null> {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL app.bypass_rls='lucia'`);
    const r = await client.query<Record<string, string | null>>(
      `SELECT l.id::text AS load_id, l.status::text AS load_status, l.customer_id::text AS customer_id,
              l.rate_total_cents::text AS rate_total_cents, l.customer_wo_number AS wo,
              i.id::text AS invoice_id, i.display_id AS invoice_display, i.status::text AS invoice_status,
              fa.id::text AS advance_id, fa.display_id AS advance_display, fa.status::text AS advance_status
         FROM mdata.loads l
         LEFT JOIN accounting.invoices i ON i.source_load_id=l.id AND i.voided_at IS NULL AND i.status<>'void'
         LEFT JOIN accounting.factoring_advances fa ON fa.id=i.factoring_advance_id
        WHERE l.operating_company_id=$1::uuid AND l.load_number=$2 AND l.soft_deleted_at IS NULL
        LIMIT 1`,
      [USMCA, loadNumber]
    );
    await client.query("COMMIT");
    const row = r.rows[0];
    if (!row) return null;
    return {
      load_id: row.load_id!, load_status: row.load_status!, customer_id: row.customer_id,
      rate_total_cents: Number(row.rate_total_cents ?? 0), wo: row.wo,
      invoice_id: row.invoice_id, invoice_display: row.invoice_display, invoice_status: row.invoice_status,
      advance_id: row.advance_id, advance_display: row.advance_display, advance_status: row.advance_status,
    };
  } catch (e) { await client.query("ROLLBACK"); throw e; }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await (invoicesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
    await (factoringAdvancesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
    await registerDispatchLoadRoutes(a);
  });
  const client = await pool.connect();
  const report: string[] = [];
  const inj = async (method: "POST" | "PATCH", url: string, payload: unknown) =>
    app.inject({ method, url, headers: auth, payload: payload as object });
  try {
    for (const c of CORRECTIONS) {
      const s = await readLoad(client, c.load);
      if (!s) { report.push(`MISS ${c.load} — load not visible`); continue; }
      if (APPLY && c.hold) { report.push(`HOLD ${c.load}: ${c.hold}  [${c.note}]`); continue; }
      const acts: string[] = [];
      // 1) void wrong factoring advance
      if (s.advance_id && (s.advance_status === "advanced" || s.advance_status === "submitted")) {
        acts.push(`void factoring ${s.advance_display} (${s.advance_status})`);
        if (APPLY) {
          const r = await inj("POST", `/api/v1/accounting/factoring-advances/${s.advance_id}/void?operating_company_id=${USMCA}`,
            { reason: `AllwaysTrack reconcile 2026-09-12 — ${c.note}` });
          if (r.statusCode >= 300) { report.push(`FAIL ${c.load} void-factoring ${r.statusCode} ${r.body.slice(0,160)}`); continue; }
        }
      }
      // 2) void wrong invoice
      if (s.invoice_id && s.invoice_status && ["sent","partial","factored"].includes(s.invoice_status)) {
        acts.push(`void invoice ${s.invoice_display} ($${(s.rate_total_cents/100).toFixed(2)}, ${s.invoice_status})`);
        if (APPLY) {
          const r = await inj("POST", `/api/v1/accounting/invoices/${s.invoice_id}/void?operating_company_id=${USMCA}`,
            { reason: `AllwaysTrack reconcile 2026-09-12 — ${c.note}` });
          if (r.statusCode >= 300) { report.push(`FAIL ${c.load} void-invoice ${r.statusCode} ${r.body.slice(0,160)}`); continue; }
        }
      }
      // 3) correct the load to AllwaysTrack truth
      const fields: Record<string, unknown> = { operating_company_id: USMCA };
      if (c.target_customer_id && c.target_customer_id !== s.customer_id) fields.customer_id = c.target_customer_id;
      if (c.target_wo && c.target_wo !== s.wo) fields.customer_wo_number = c.target_wo;
      if (c.target_rate_cents !== s.rate_total_cents) fields.charges = [{ code: "linehaul", amount_cents: c.target_rate_cents }];
      const changed = Object.keys(fields).filter((k) => k !== "operating_company_id");
      if (changed.length) {
        acts.push(`PATCH load ${changed.join(",")} -> ${c.target_customer_id ? "cust,": ""}$${(c.target_rate_cents/100).toFixed(2)}`);
        if (APPLY) {
          const r = await inj("PATCH", `/api/v1/dispatch/loads/${s.load_id}`,
            { ...fields, override_reason: "Owner AllwaysTrack source-of-truth reconciliation 2026-09-12" });
          if (r.statusCode >= 300) { report.push(`FAIL ${c.load} patch-load ${r.statusCode} ${r.body.slice(0,200)}`); continue; }
        }
      }
      // 4) re-post invoice at corrected face (skip $0 legs)
      let newInvoiceId: string | null = null;
      if (c.target_rate_cents > 0) {
        acts.push(`re-post invoice from-load $${(c.target_rate_cents/100).toFixed(2)} + send`);
        if (APPLY) {
          // Do NOT reuse the load-number display_id: the voided invoice still holds it (unique constraint
          // includes voided rows -> 23505). Let from-load auto-mint the next INV-YYYY-NNNNN.
          const r = await inj("POST", `/api/v1/accounting/invoices/from-load?operating_company_id=${USMCA}`,
            { load_id: s.load_id });
          if (r.statusCode >= 300) { report.push(`FAIL ${c.load} from-load ${r.statusCode} ${r.body.slice(0,200)}`); continue; }
          newInvoiceId = String((JSON.parse(r.body).invoice as { id?: string } | undefined)?.id ?? JSON.parse(r.body).id ?? "");
          if (newInvoiceId) {
            const sres = await inj("POST", `/api/v1/accounting/invoices/${newInvoiceId}/send?operating_company_id=${USMCA}`, {});
            if (sres.statusCode >= 300) report.push(`WARN ${c.load} send ${sres.statusCode} ${sres.body.slice(0,120)}`);
          }
        }
      }
      // 5) re-factor at corrected face (only if Faro purchased it)
      if (c.refactor && c.target_rate_cents > 0) {
        acts.push(`re-factor $${(c.target_rate_cents/100).toFixed(2)} @1.5/1.5`);
        if (APPLY && newInvoiceId) {
          const cr = await inj("POST", `/api/v1/accounting/factoring-advances?operating_company_id=${USMCA}`,
            { factoring_company_vendor_id: FARO_VENDOR_ID, submission_batch_ref: `CURSOR-ATRECON-${c.load}`,
              invoice_ids: [newInvoiceId], reserve_pct: RESERVE_PCT, factor_fee_pct: FACTOR_FEE_PCT,
              notes: `AllwaysTrack+Faro reconcile 2026-09-12 — ${c.note}` });
          if (cr.statusCode >= 300) { report.push(`FAIL ${c.load} refactor-create ${cr.statusCode} ${cr.body.slice(0,160)}`); continue; }
          const created = JSON.parse(cr.body) as { id: string; display_id: string };
          const ar = await inj("POST", `/api/v1/accounting/factoring-advances/${created.id}/advance?operating_company_id=${USMCA}`, {});
          if (ar.statusCode >= 300) report.push(`WARN ${c.load} refactor-advance ${ar.statusCode} ${ar.body.slice(0,120)}`);
          acts.push(`-> ${created.display_id}`);
        }
      }
      report.push(`${APPLY ? "DONE" : "DRY-RUN"} ${c.load}: ${acts.join(" | ")}  [${c.note}]`);
    }
  } finally {
    client.release();
    await app.close();
    await pool.end();
  }
  console.log(report.join("\n"));
  console.log(`\n${APPLY ? "APPLIED" : "DRY-RUN"} — ${CORRECTIONS.length} corrections. Missing loads 13579/13585 = separate book-load create phase.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
