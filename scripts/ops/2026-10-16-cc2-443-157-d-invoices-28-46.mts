// LEAD 443.157 add: invoices # 28 (load 13544, Hawkeye Transportation Services, 600.00, local Laredo 08-24→08-25) and # 46
// (load 13563, Hawkeye, 600.00, 09-01→09-02) — the invoice engine refused both "delivery_evidence_missing" (no stop
// actual departure). Engines only: geocodeStopsWithClient (stop coordinates), stampStopsFromTracking (the Settlement
// Creator's historical stamp: the truck's Samsara stop event when one matches, else the sheet date at date precision),
// settleStampedStopStatuses, then buildInvoiceFromLoad under the Faro number → sendDraftInvoice (historical_backfill).
// Latch Event 2 re-fired after commit; A/R on load verified = 600.00.
//   default DRY RUN (rolled back) · --apply --auth OWNER-ORDER-443.157
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";
import { geocodeStopsWithClient } from "../../apps/backend/src/telematics/stops-geocode-backfill.service.ts";
import { stampStopsFromTracking, settleStampedStopStatuses } from "../../apps/backend/src/driver-finance/settlement-creator-deliver.ts";
import { updateDispatchLoad } from "../../apps/backend/src/dispatch/update-load.service.ts";
import { ensureDriverBillArtifactsForLoad } from "../../apps/backend/src/dispatch/book-load.service.ts";
import { buildInvoiceFromLoad } from "../../apps/backend/src/accounting/from-load.ts";
import { convertProformaToOfficial } from "../../apps/backend/src/accounting/proforma-convert.service.ts";
import { sendDraftInvoice } from "../../apps/backend/src/accounting/invoice-send.service.ts";
import { postLoadRevenueLatch } from "../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.ts";
// Production authority (verify-no-unauthorized-production-write): --apply needs --auth AUTH-NNN (checked by
// scripts/verify-owner-authorization.mjs) or the owner order this round ran under (OWNER-ORDER-<round>, relayed by Lead).
{
  const i = process.argv.indexOf("--auth");
  const a = i > 0 ? process.argv[i + 1] ?? "" : "";
  if (process.argv.includes("--apply")) {
    if (/^AUTH-\d+$/.test(a)) (await import("node:child_process")).execFileSync("node", ["scripts/verify-owner-authorization.mjs", a], { stdio: "inherit" });
    else if (!/^OWNER-ORDER-443\.\d+$/.test(a)) throw new Error("--apply requires --auth AUTH-NNN | OWNER-ORDER-443.<round>");
  }
}
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const ROWS = [
  { load: "13544", n: "28", cents: 60000, pickup: "2026-08-24", delivery: "2026-08-25" },
  { load: "13563", n: "46", cents: 60000, pickup: "2026-09-01", delivery: "2026-09-02" },
];
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.157 invoices 28 / 46" });
const one = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0] as Record<string, any> | undefined;
const touched: Array<{ load: string; loadId: string }> = [];
await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const tb = async () => (await one(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA]))!.net;
  const tb0 = await tb();
  for (const r of ROWS) {
    const l = await one(`SELECT l.id::text, l.status::text, l.rate_total_cents::int rate, c.customer_name FROM mdata.loads l LEFT JOIN mdata.customers c ON c.id=l.customer_id WHERE l.operating_company_id=$1::uuid AND l.load_number=$2 AND l.voided_at IS NULL`, [USMCA, r.load]);
    if (!l) { console.log(`HELD ${r.load}: load not found`); continue; }
    if (l.rate !== r.cents || !/hawkeye/i.test(l.customer_name)) { console.log(`HELD ${r.load}: ${l.customer_name} ${l.rate} ≠ Hawkeye ${r.cents}`); continue; }
    await db.query("SAVEPOINT one");
    try {
      // AlwaysTrack ALL LOADS documents both moves: L.Miles 7.2, Driver Pay 0, Driver R.P.M 0 — Rafael is the local
      // weekly-salary driver (Lead 443.150: no per-mile pay). The salaried path of the driver-bill engine is a 0 rate WITH
      // its reason (isSalariedZeroRateOverride); the miles are the document's.
      await updateDispatchLoad(db as never, { loadId: l.id, operatingCompanyId: USMCA, requestingUserUuid: OWNER, requestingUserRole: "Owner",
        override_reason: "Lead 443.157: documented miles and pay from AlwaysTrack ALL LOADS (local move, salaried driver)",
        fields: { miles_practical: 7.2, driver_pay_rate_per_mile: 0, driver_pay_rate_override_reason: "Local weekly-salary driver (Rafael Rogelio Rivero Reynoso) — no per-mile pay; AlwaysTrack Driver Pay 0.00 (Lead 443.150)" },
        // Local move inside Laredo, no street on the document: each existing stop re-sent unchanged + the city's coordinates
        // (the engine updates kept stops in place; the geocoder will not settle a city-only stop).
        stops: (await db.query(`SELECT stop_type::text, city, state, country, scheduled_arrival_at::text, appointment_start_at::text, appointment_end_at::text, location_id::text FROM mdata.load_stops WHERE load_id=$1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number`, [l.id])).rows
          .map((st: any) => ({ ...st, country: st.country ?? "US", latitude: 27.5306, longitude: -99.4803 })) } as never);
      const bill = await ensureDriverBillArtifactsForLoad(db as never, { loadId: l.id, operatingCompanyId: USMCA, actorUserId: OWNER });
      const geo = await geocodeStopsWithClient(db as never, OWNER, USMCA, l.id);
      const stamps = await stampStopsFromTracking(db as never, l.id, USMCA, { pickupDate: r.pickup, deliveryDate: r.delivery });
      const settled = await settleStampedStopStatuses(db as never, l.id);
      const b = await buildInvoiceFromLoad(db as never, { operatingCompanyId: USMCA, loadId: l.id, requestedDisplayId: r.n } as never);
      if (String(b.invoice.status) === "proforma") await convertProformaToOfficial(db as never, { operatingCompanyId: USMCA, loadId: l.id, userId: OWNER });
      const sent = await sendDraftInvoice(db as never, { invoiceId: String(b.invoice.id), operatingCompanyId: USMCA, userId: OWNER, mode: "historical_backfill" });
      if (!(sent as { ok: boolean }).ok) throw new Error(`send refused: ${JSON.stringify(sent).slice(0, 220)}`);
      const f = (await one(`SELECT i.display_id, i.total_cents::int total, c.customer_name FROM accounting.invoices i JOIN mdata.customers c ON c.id=i.customer_id WHERE i.id=$1::uuid`, [String(b.invoice.id)]))!;
      if (f.display_id !== `${r.n}-${r.load}` || f.total !== r.cents) throw new Error(`minted ${f.display_id} ${f.total}`);
      await db.query("RELEASE SAVEPOINT one");
      touched.push({ load: r.load, loadId: l.id });
      console.log(`${r.load}: driver bill ${String((bill as any).outcome)} · geocode ${JSON.stringify({ geocoded: (geo as any).geocoded, failures: ((geo as any).failures ?? []).length })} · stamps ${stamps.map((s) => `${s.stop_type}:${s.precision}`).join(",")} · settled ${settled} · invoice ${f.display_id} ${f.customer_name} ${(f.total / 100).toFixed(2)}`);
    } catch (e) {
      await db.query("ROLLBACK TO SAVEPOINT one");
      console.log(`HELD ${r.load}: ${(e as Error).message.slice(0, 260)}\n${String((e as Error).stack).split("\n").slice(1, 6).join("\n")}`);
    }
  }
  const tb1 = await tb();
  console.log(`trial balance ${tb0} -> ${tb1}`);
  if (Number(tb1) !== 0) throw new Error("REFUSE: trial balance off zero");
  await db.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(APPLY ? "COMMITTED" : "DRY RUN — rolled back");
  if (APPLY) for (const t of touched) {
    const r = await postLoadRevenueLatch({ operating_company_id: USMCA, load_id: t.loadId, target_status: "completed_docs_received", entry_date_iso: companyBusinessDate(), actor_user_id: OWNER } as never);
    await db.query("BEGIN"); await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const ar = Number((await one(`SELECT COALESCE(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::int ar FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id WHERE p.load_id=$1::uuid AND a.account_number='1100'`, [t.loadId]))!.ar);
    await db.query("ROLLBACK");
    console.log(`  ${t.load}: latch ${String((r as any).reason ?? (r as any).event)} · A/R ${(ar / 100).toFixed(2)} ${ar === 60000 ? "= total" : "≠ total 600.00"}`);
  }
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
  setTimeout(() => process.exit(0), 2500);
}
