// LEAD 443.151 A (owner 10:39 CT, "it is shown in the reconciliation" — 10-1-26-Usmca-Faro-Always-Reconciliation.xlsx,
// sheet QBO-FARO-Allways): two loads carry a $0.00 invoice where the reconciliation has a real one:
//   13554 0-13554 $0  → # 39 Big G Logistics 3,500.00      13564 0-13564 $0 → # 51 Armstrong Transport GR 3,000.00
// Engines only, one transaction per load (savepoint): voidDocument('invoice') on the $0 invoice (no hard delete; it keeps
// its number as the audit record) → updateDispatchLoad charges (line haul = sheet amount; Owner lock-override with reason,
// the D-H0 path that refuses while a sent invoice is live) → buildInvoiceFromLoad(# 39 / 51) → sendDraftInvoice
// (historical_backfill, no e-mail) → delivery-latch Event 2 after commit when the latch owns the load. No Faro purchase.
//   default DRY RUN (rolled back) · --apply (prod: assertIsIntendedProduction)
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";
import { voidDocument } from "../../apps/backend/src/accounting/void-document.service.ts";
import { updateDispatchLoad } from "../../apps/backend/src/dispatch/update-load.service.ts";
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
  { load: "13554", number: "39", customer: "Big G Logistics", cents: 350000 },
  { load: "13564", number: "51", customer: "Armstrong Transport GR", cents: 300000 },
];
const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.151 A replace $0 invoices 13554/13564" });
const one = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0] as Record<string, any>;
const done: Array<{ load: string; loadId: string }> = [];
await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  // Same session shape as the app's withCurrentUser for the Owner: dispatch.* RLS keys on identity.current_user_id().
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const tb0 = await one(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA]);
  for (const r of ROWS) {
    const l = await one(`SELECT l.id::text, l.status::text, l.rate_total_cents::int rate, c.customer_name FROM mdata.loads l LEFT JOIN mdata.customers c ON c.id=l.customer_id WHERE l.operating_company_id=$1::uuid AND l.load_number=$2 AND l.voided_at IS NULL`, [USMCA, r.load]);
    if (!l) { console.log(`HELD ${r.load}: load not found`); continue; }
    if (!norm(l.customer_name).startsWith(norm(r.customer))) { console.log(`HELD ${r.load}: app customer ${l.customer_name} ≠ sheet ${r.customer}`); continue; }
    const old = (await db.query(`SELECT id::text, display_id, status::text, total_cents::int total, amount_paid_cents::int paid, COALESCE(factoring_status,'not_factored') fs FROM accounting.invoices WHERE operating_company_id=$1::uuid AND source_load_id=$2::uuid AND voided_at IS NULL`, [USMCA, l.id])).rows;
    if (old.length !== 1 || old[0].total !== 0 || old[0].paid !== 0 || old[0].fs !== "not_factored") { console.log(`HELD ${r.load}: expected exactly one unpaid unfactored $0 invoice, found ${JSON.stringify(old)}`); continue; }
    await db.query("SAVEPOINT one_load");
    try {
      const v = await voidDocument(db as never, { operatingCompanyId: USMCA, type: "invoice", id: old[0].id, reason: `Lead 443.151 A: $0 placeholder replaced by invoice # ${r.number} per owner reconciliation`, actor: { userId: OWNER, role: "Owner" }, currentBusinessDate: companyBusinessDate() });
      // The typed number is honoured first; the load is still $0, so the draft mints through the zero-revenue path as
      // <#>-<load>, then the load edit below re-syncs this UNSENT invoice from the new rate (resyncProformaInvoiceFromLoadRate).
      const b = await buildInvoiceFromLoad(db as never, { operatingCompanyId: USMCA, loadId: l.id, requestedDisplayId: r.number, authorizedZeroRevenue: true } as never);
      await updateDispatchLoad(db as never, {
        loadId: l.id, operatingCompanyId: USMCA, requestingUserUuid: OWNER, requestingUserRole: "Owner",
        override_reason: `Lead 443.151 A: line haul ${(r.cents / 100).toFixed(2)} per owner reconciliation (invoice # ${r.number})`,
        fields: {}, charges: [{ code: "linehaul", description: "Line haul", amount_cents: r.cents }],
      } as never);
      // The load edit re-enters the proforma minter; a proforma converts at POD through its one engine.
      if (String(b.invoice.status) === "proforma") {
        const c = await convertProformaToOfficial(db as never, { operatingCompanyId: USMCA, loadId: l.id, userId: OWNER });
        if (!c.converted) throw new Error(`proforma convert refused: ${c.reason}`);
      }
      const draft = await one(`SELECT total_cents::int total, display_id FROM accounting.invoices WHERE id=$1::uuid`, [String(b.invoice.id)]);
      if (draft.display_id !== `${r.number}-${r.load}`) throw new Error(`invoice number ${draft.display_id} ≠ ${r.number}-${r.load} (engine minted its own number)`);
      if (draft.total !== r.cents) throw new Error(`minted total ${draft.total} ≠ ${r.cents}`);
      const sent = await sendDraftInvoice(db as never, { invoiceId: String(b.invoice.id), operatingCompanyId: USMCA, userId: OWNER, mode: "historical_backfill" });
      if (!(sent as { ok: boolean }).ok) throw new Error(`send refused: ${JSON.stringify(sent).slice(0, 220)}`);
      await db.query("RELEASE SAVEPOINT one_load");
      done.push({ load: r.load, loadId: l.id });
      console.log(`${r.load}\tvoided ${old[0].display_id} (reversal ${v.reversalJournalEntryId ?? "none — $0, nothing posted"})\tload line haul ${(l.rate / 100).toFixed(2)} → ${(r.cents / 100).toFixed(2)}\tissued ${draft.display_id} ${(draft.total / 100).toFixed(2)} ${l.customer_name}`);
    } catch (e) {
      await db.query("ROLLBACK TO SAVEPOINT one_load");
      console.log(`HELD ${r.load}: ${(e as Error).message.slice(0, 260)}`);
    }
  }
  const tb1 = await one(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA]);
  console.log(`trial balance ${tb0.net} -> ${tb1.net}`);
  if (Number(tb1.net) !== 0) throw new Error("REFUSE: trial balance off zero");
  await db.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(APPLY ? "COMMITTED" : "DRY RUN — rolled back");
  if (APPLY) for (const t of done) {
    const r = await postLoadRevenueLatch({ operating_company_id: USMCA, load_id: t.loadId, target_status: "completed_docs_received", entry_date_iso: companyBusinessDate(), actor_user_id: OWNER } as never);
    console.log(`  latch event 2 ${t.load}: ${JSON.stringify(r).slice(0, 140)}`);
  }
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
  setTimeout(() => process.exit(0), 2000);
}
