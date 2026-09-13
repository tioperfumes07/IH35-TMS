#!/usr/bin/env tsx
/**
 * cursor-2026-09-13-faro-daybyday-rebuild.mts — owner 2026-09-12 ("close it identical. simple ...
 * i want the cash flow to render the same data day by day").
 *
 * The USMCA factoring advances were batch-minted on the internal job dates (09/06=19, 09/07=32,
 * 09/11=12) instead of Faro's real purchase dates, so nothing lines up day-by-day. This op re-dates
 * each advance to its true Faro purchase date so BOTH the Purchase Report (buckets on submitted_at)
 * and the Cash Flow (buckets on advanced_at::date) render exactly like Faro.
 *
 * SOURCE OF TRUTH: docs/reconcile/faro_reconcile_full.json — the entity-correct reconciliation
 * (USMCA-only Faro rows, per-advance advance_id<->faro_date already resolved). NOT the raw 128-row
 * canonical (that mixes the frozen Transportation entity + has the load-number collision trap).
 *
 * Method (owner-authorised 2026-09-12: "void -> re-advance at the Faro date, clean GL, fully
 * reversible register"), through the REAL routes only (void-not-delete, reuse the poster):
 *   status='advanced' : POST .../:id/void            (reverses the funding JE, frees the invoice)
 *                       POST .../factoring-advances   (recreate, reserve 1.5 / fee 1.5, new FAC #)
 *                       POST .../:new/advance         ({ advanced_at: <Faro date> } -> re-posts JE)
 *                       + submitted_at := Faro date   (benign source-timestamp correction; NO JE)
 *   status='submitted': POST .../:id/advance          ({ advanced_at: <Faro date> })
 *                       + submitted_at := Faro date
 *
 * EXCLUDED (handled separately, never silently mis-dated):
 *   - 13581 / 13586 : DISPUTED — Faro purchased LESS than our invoice face; advance base != face.
 *   - 13578 / 13589 : Faro purchased MORE than face — owner ruling = edit the invoice UP first,
 *                     then advance at the Faro date (done in a follow-on step, not here).
 *
 * Usage:
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-13-faro-daybyday-rebuild.mts            # dry-run
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-13-faro-daybyday-rebuild.mts --apply
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

// Disputed (Faro < face) and edit-up (Faro > face) loads are excluded from the automatic re-date.
const EXCLUDE_LOADS = new Set(["13581", "13586", "13578", "13589"]);

const auth = {
  "x-test-auth": Buffer.from(JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }), "utf8").toString("base64url"),
  "content-type": "application/json",
};

type Row = {
  fa: string;
  advance_id: string;
  invoice_id: string;
  load?: string;
  status: string;
  face_cents: number;
  faro_date?: string;
  matched: boolean;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const recon = JSON.parse(readFileSync(join(__dirname, "../../docs/reconcile/faro_reconcile_full.json"), "utf8")) as { rows: Row[] };

function isoFromMDY(mdy: string): string {
  const [m, d, y] = mdy.split("/");
  return `${y}-${m}-${d}T12:00:00.000Z`;
}
function dateFromMDY(mdy: string): string {
  const [m, d, y] = mdy.split("/");
  return `${y}-${m}-${d}`;
}
function netAdvance(faceCents: number): number {
  const rsv = Math.round((faceCents * RESERVE_PCT) / 100);
  const fee = Math.round((faceCents * FACTOR_FEE_PCT) / 100);
  return faceCents - rsv - fee;
}
function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await (factoringAdvancesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
  });
  const inj = async (method: "POST", url: string, payload: unknown) =>
    app.inject({ method, url, headers: auth, payload: payload as object });
  const client = await pool.connect();
  const report: string[] = [];

  const tasks = recon.rows.filter(
    (r) => r.matched && r.faro_date && typeof r.face_cents === "number" && !(r.load && EXCLUDE_LOADS.has(r.load)),
  );

  // Projected day-by-day (what Cash Flow + Purchase Report will show once re-dated).
  const daily: Record<string, { n: number; purchase: number; net: number }> = {};
  for (const t of tasks) {
    const d = dateFromMDY(t.faro_date!);
    const b = (daily[d] ??= { n: 0, purchase: 0, net: 0 });
    b.n += 1;
    b.purchase += t.face_cents;
    b.net += netAdvance(t.face_cents);
  }

  report.push(`== Faro day-by-day rebuild — ${tasks.length} advances (excluded ${[...EXCLUDE_LOADS].join(", ")}) ==`);
  report.push(`\nProjected per-day (Cash Flow / Purchase Report should equal this):`);
  let gP = 0, gN = 0, gC = 0;
  for (const d of Object.keys(daily).sort()) {
    report.push(`   ${d}   n=${daily[d].n}   purchase=${usd(daily[d].purchase)}   net_adv=${usd(daily[d].net)}`);
    gP += daily[d].purchase; gN += daily[d].net; gC += daily[d].n;
  }
  report.push(`   TOTAL   n=${gC}   purchase=${usd(gP)}   net_adv=${usd(gN)}`);

  try {
    if (!APPLY) {
      report.push(`\n-- per-advance plan --`);
      for (const t of tasks) {
        const action = t.status === "advanced" ? "void->recreate->advance" : "advance";
        report.push(`  ${t.fa} load ${t.load} ${t.status} -> ${dateFromMDY(t.faro_date!)}  ${usd(t.face_cents)}  [${action}]`);
      }
      report.push(`\nDRY-RUN — zero writes. Re-run with --apply.`);
      return;
    }

    let reDated = 0, fail = 0;
    for (const t of tasks) {
      const iso = isoFromMDY(t.faro_date!);
      const ymd = dateFromMDY(t.faro_date!);
      let targetAdvanceId = t.advance_id;

      if (t.status === "advanced") {
        const v = await inj("POST", `/api/v1/accounting/factoring-advances/${t.advance_id}/void?operating_company_id=${USMCA}`, {
          reason: `Faro day-by-day rebuild 2026-09-13 — re-created dated to Faro purchase date ${t.faro_date}`,
        });
        if (v.statusCode >= 300) { report.push(`  FAIL void ${t.fa} ${v.statusCode} ${v.body.slice(0, 140)}`); fail += 1; continue; }
        const cr = await inj("POST", `/api/v1/accounting/factoring-advances?operating_company_id=${USMCA}`, {
          factoring_company_vendor_id: FARO_VENDOR_ID,
          submission_batch_ref: `CURSOR-FARO-REDATE-${t.load}-${ymd.replace(/-/g, "")}`,
          invoice_ids: [t.invoice_id],
          reserve_pct: RESERVE_PCT,
          factor_fee_pct: FACTOR_FEE_PCT,
          notes: `Faro day-by-day re-date — load ${t.load}, Faro purchase date ${t.faro_date}`,
        });
        if (cr.statusCode >= 300) { report.push(`  FAIL create ${t.fa} (load ${t.load}) ${cr.statusCode} ${cr.body.slice(0, 160)}`); fail += 1; continue; }
        targetAdvanceId = (JSON.parse(cr.body) as { id: string }).id;
      }

      const ar = await inj("POST", `/api/v1/accounting/factoring-advances/${targetAdvanceId}/advance?operating_company_id=${USMCA}`, {
        advanced_at: iso,
      });
      if (ar.statusCode >= 300) { report.push(`  FAIL advance ${t.fa} (load ${t.load}) ${ar.statusCode} ${ar.body.slice(0, 160)}`); fail += 1; continue; }

      // submitted_at has NO journal entry (the funding JE is dated by advanced_at via the poster);
      // it is the advance's own submission timestamp and the Purchase Report's day-bucket. Correct it
      // to the true Faro purchase date so the report lines up with Cash Flow. Source-record date
      // correction only — never a GL amount.
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls='lucia'");
      await client.query(
        `UPDATE accounting.factoring_advances SET submitted_at = $2::date WHERE id = $1 AND operating_company_id = $3::uuid`,
        [targetAdvanceId, ymd, USMCA],
      );
      await client.query("COMMIT");
      reDated += 1;
    }
    report.push(`\nAPPLIED: re-dated=${reDated} fail=${fail}`);
  } finally {
    client.release();
    await app.close();
    await pool.end();
    console.log(report.join("\n"));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
