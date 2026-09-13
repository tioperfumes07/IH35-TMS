#!/usr/bin/env tsx
/**
 * cursor-2026-09-12-faro-factoring-rebuild.mts — owner 2026-09-12
 * ("i want to see my factoring module rendering the same data exactly as faro, day by day ... i want the
 *  cash flow to render the same data day by day.")
 *
 * The app's USMCA factoring advances were batch-minted on the dates the internal jobs ran (09/06=19,
 * 09/07=32, 09/11=12) instead of Faro's real purchase dates, so nothing lines up day-by-day. Faro is the
 * factoring source of truth: docs/reconcile/faro_canonical_purchases.json (128 purchases, gross $441,128).
 *
 * This op rebuilds the factoring ledger to be an EXACT projection of Faro, through the REAL routes only
 * (void-not-delete, reuse the poster; NO raw SQL on money):
 *   PHASE 1  POST /api/v1/accounting/factoring-advances/:id/void       (reversing JE; frees invoice)
 *   PHASE 2  per Faro purchase mapped PO==load W.O.# -> invoice:
 *            POST /api/v1/accounting/factoring-advances                 (reserve 1.5 / fee 1.5)
 *            POST /api/v1/accounting/factoring-advances/:id/advance     ({ advanced_at: <Faro date> })
 *              -> both the advance row AND its ASC 860 secured-borrowing JE are dated to the Faro purchase
 *                 date (poster.advanced_at_iso), so Purchase Report AND Cash Flow bucket on Faro's day.
 *
 * Usage:
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-12-faro-factoring-rebuild.mts            # dry-run
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-12-faro-factoring-rebuild.mts --apply
 *   ...--apply --phase=1     (void only)      ...--apply --phase=2     (rebuild only)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import factoringAdvancesPlugin from "../../apps/backend/src/accounting/factoring-advances.routes.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const FARO_VENDOR_ID = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4";
const RESERVE_PCT = 1.5;
const FACTOR_FEE_PCT = 1.5;
const APPLY = process.argv.includes("--apply");
const phaseArg = process.argv.find((a) => a.startsWith("--phase="));
const PHASE = phaseArg ? phaseArg.slice(7) : "12";

const auth = {
  "x-test-auth": Buffer.from(JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }), "utf8").toString("base64url"),
  "content-type": "application/json",
};

type FaroPurchase = { inv: string; date: string; debtor: string; po: string; purchase: number; net_adv: number };
const __dirname = dirname(fileURLToPath(import.meta.url));
const canonical = JSON.parse(readFileSync(join(__dirname, "../../docs/reconcile/faro_canonical_purchases.json"), "utf8")) as { purchases: FaroPurchase[] };

function isoFromMDY(mdy: string): string {
  const [m, d, y] = mdy.split("/");
  return `${y}-${m}-${d}T12:00:00.000Z`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await (factoringAdvancesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
  });
  const client = await pool.connect();
  const report: string[] = [];
  const inj = async (method: "POST", url: string, payload: unknown) =>
    app.inject({ method, url, headers: auth, payload: payload as object });
  try {
    // ---- Load the invoice map ONCE: load W.O.# -> invoice (id/status/factoring/amount/advance) ----
    await client.query("BEGIN"); await client.query("SET LOCAL app.bypass_rls='lucia'");
    const invRows = (await client.query<{ wo: string | null; inv_id: string; inv_display: string; inv_status: string; fstatus: string | null; total_cents: string; adv_id: string | null; adv_status: string | null }>(
      `SELECT l.customer_wo_number AS wo, i.id::text AS inv_id, i.display_id AS inv_display, i.status::text AS inv_status,
              i.factoring_status::text AS fstatus, i.total_cents::text AS total_cents,
              fa.id::text AS adv_id, fa.status::text AS adv_status
         FROM accounting.invoices i
         JOIN mdata.loads l ON l.id=i.source_load_id
         LEFT JOIN accounting.factoring_advances fa ON fa.id=i.factoring_advance_id
        WHERE i.operating_company_id=$1::uuid AND i.voided_at IS NULL`,
      [USMCA]
    )).rows;
    // all non-void advances (for PHASE 1 void)
    const advRows = (await client.query<{ id: string; display_id: string; status: string; d: string; total_cents: string }>(
      `SELECT id::text, display_id, status::text, COALESCE(advanced_at,created_at)::date::text AS d, invoice_total_cents::text AS total_cents
         FROM accounting.factoring_advances
        WHERE operating_company_id=$1::uuid AND status NOT IN ('void','voided') ORDER BY d`,
      [USMCA]
    )).rows;
    await client.query("COMMIT");
    const invByWo = new Map<string, typeof invRows[number]>();
    for (const r of invRows) if (r.wo) invByWo.set(r.wo.trim().toLowerCase(), r);

    // ---------- PHASE 1 — void every existing non-void advance ----------
    if (PHASE.includes("1")) {
      let done = 0, fail = 0;
      report.push(`\n== PHASE 1 void ${advRows.length} existing advances ==`);
      for (const a of advRows) {
        if (!APPLY) { report.push(`  DRY void ${a.display_id} (${a.status}, ${a.d}, $${(Number(a.total_cents)/100).toFixed(2)})`); done += 1; continue; }
        const r = await inj("POST", `/api/v1/accounting/factoring-advances/${a.id}/void?operating_company_id=${USMCA}`,
          { reason: "Faro day-by-day rebuild 2026-09-12 — re-created dated to Faro purchase date" });
        if (r.statusCode >= 300) { report.push(`  FAIL void ${a.display_id} ${r.statusCode} ${r.body.slice(0,120)}`); fail += 1; continue; }
        done += 1;
      }
      report.push(`  PHASE 1 ${APPLY ? "APPLIED" : "DRY"}: voided=${done} fail=${fail}`);
    }

    // ---------- PHASE 2 — create+advance each Faro purchase at its Faro date ----------
    if (PHASE.includes("2")) {
      let created = 0, unmapped = 0, notSent = 0, fail = 0;
      const dailyPlanned: Record<string, { n: number; sum: number }> = {};
      report.push(`\n== PHASE 2 rebuild ${canonical.purchases.length} Faro purchases ==`);
      for (const p of canonical.purchases) {
        const inv = p.po ? invByWo.get(p.po.trim().toLowerCase()) : undefined;
        if (!inv) { report.push(`  UNMAPPED Faro ${p.inv} ${p.date} ${p.debtor} PO=${p.po} $${p.purchase.toFixed(0)} — no load W.O. match`); unmapped += 1; continue; }
        const faceOk = Math.abs(Number(inv.total_cents) / 100 - p.purchase) < 0.5;
        const bucket = (dailyPlanned[p.date] ??= { n: 0, sum: 0 }); bucket.n += 1; bucket.sum += p.purchase;
        if (!APPLY) {
          report.push(`  DRY ${p.date} Faro ${p.inv} -> inv ${inv.inv_display} (${inv.inv_status}/${inv.fstatus}) $${p.purchase.toFixed(0)}${faceOk ? "" : ` [FACE DIFF app $${(Number(inv.total_cents)/100).toFixed(0)}]`}`);
          created += 1; continue;
        }
        if (inv.inv_status !== "sent") { report.push(`  SKIP ${p.inv} inv ${inv.inv_display} status=${inv.inv_status} (needs sent)`); notSent += 1; continue; }
        const cr = await inj("POST", `/api/v1/accounting/factoring-advances?operating_company_id=${USMCA}`,
          { factoring_company_vendor_id: FARO_VENDOR_ID, submission_batch_ref: `CURSOR-FARO-${p.inv}-${p.date.replace(/\//g,"")}`,
            invoice_ids: [inv.inv_id], reserve_pct: RESERVE_PCT, factor_fee_pct: FACTOR_FEE_PCT,
            notes: `Faro rebuild — Faro inv ${p.inv} ${p.date} ${p.debtor} PO ${p.po}` });
        if (cr.statusCode >= 300) { report.push(`  FAIL create ${p.inv} (inv ${inv.inv_display}) ${cr.statusCode} ${cr.body.slice(0,140)}`); fail += 1; continue; }
        const adv = JSON.parse(cr.body) as { id: string; display_id: string };
        const ar = await inj("POST", `/api/v1/accounting/factoring-advances/${adv.id}/advance?operating_company_id=${USMCA}`,
          { advanced_at: isoFromMDY(p.date) });
        if (ar.statusCode >= 300) { report.push(`  FAIL advance ${p.inv} (${adv.display_id}) ${ar.statusCode} ${ar.body.slice(0,140)}`); fail += 1; continue; }
        created += 1;
      }
      report.push(`  PHASE 2 ${APPLY ? "APPLIED" : "DRY"}: created=${created} unmapped=${unmapped} notSent=${notSent} fail=${fail}`);
      report.push(`\n  Planned per-day (should equal Faro daily gross):`);
      for (const d of Object.keys(dailyPlanned).sort((a,b)=> (a.slice(6)+a.slice(0,2)+a.slice(3,5)).localeCompare(b.slice(6)+b.slice(0,2)+b.slice(3,5))))
        report.push(`    ${d}  ${dailyPlanned[d].n}  $${dailyPlanned[d].sum.toFixed(2)}`);
    }
  } finally {
    client.release(); await app.close(); await pool.end();
  }
  console.log(report.join("\n"));
}
main().catch((e) => { console.error(e); process.exit(1); });
