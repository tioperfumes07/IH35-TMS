// LEAD 443.150 — invoices on the 2 USMCA completed loads CC-1 seeds from AlwaysTrack (13544 → # 28, 13563 → engine number),
// customer + amount as ALL LOADS / ALL CUSTOMER CHARGES. Same engine path as 443.148 (from-load mint → historical_backfill
// send → delivery-latch Event 2 after commit). No Faro purchase, no factoring status. Held with reason if the load is absent,
// differs from the sheet, or fails the invoice engine's readiness checks.
//   default DRY RUN (rolled back) · --apply (prod: assertIsIntendedProduction)
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";
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
type SheetRow = { load: string; customer: string; status: string; charges_cents: number; number: string | null };
// LEAD 443.150 (owner 10:32 CT, corrected 10:37): USMCA completed loads that were never seeded — AlwaysTrack ALL LOADS /
// ALL CUSTOMER CHARGES. 13544 = invoice # 28 (the number submitted to Faro); 13563 = engine's next number.
const SHEET: SheetRow[] = [
  { load: "13544", customer: "Hawkeye Transportation Services", status: "Completed", charges_cents: 60000, number: "28" },
  // LEAD 443.151: 13563 is invoice # 46 at 600.00 per QBO / Faro (AlwaysTrack's 500 is not the invoice).
  { load: "13563", customer: "Hawkeye Transportation Services", status: "Completed", charges_cents: 60000, number: "46" },
];
const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.150 invoices 13544 (#28) + 13563" });
const one = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0] as Record<string, any>;
const tb = async () => one(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net, count(*)::int n FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA]);
let preIds: string[] = [];
const factoringSig = async () => (await one(`SELECT md5(string_agg(id::text||':'||COALESCE(factoring_status,'')||':'||COALESCE(factoring_advance_id::text,''), ',' ORDER BY id)) m FROM accounting.invoices WHERE id = ANY($1::uuid[])`, [preIds])).m;
const newInvoicesNotFactored = async () => (await one(`SELECT count(*)::int n FROM accounting.invoices WHERE operating_company_id=$1::uuid AND NOT (id = ANY($2::uuid[])) AND COALESCE(factoring_status,'not_factored') <> 'not_factored'`, [USMCA, preIds])).n;
const INV = `SELECT i.id::text, i.display_id, i.status::text, i.total_cents::int total, c.customer_name FROM accounting.invoices i LEFT JOIN mdata.customers c ON c.id=i.customer_id WHERE i.operating_company_id=$1::uuid AND i.source_load_id=$2::uuid AND i.voided_at IS NULL ORDER BY i.created_at DESC`;
const rows: string[] = [];
await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const before = await tb();
  preIds = (await db.query(`SELECT id::text FROM accounting.invoices WHERE operating_company_id=$1::uuid`, [USMCA])).rows.map((r) => r.id as string);
  const fsBefore = await factoringSig();
  let issued = 0;
  const touched: string[] = [];
  const touchedLoads: Array<{ load: string; loadId: string; invoiceId: string }> = [];
  for (const s of SHEET) {
    const loadNo = s.load; const cust = s.customer; const amount = s.charges_cents;
    const l = await one(`SELECT l.id::text, l.status::text, l.rate_total_cents::int rate, c.customer_name FROM mdata.loads l LEFT JOIN mdata.customers c ON c.id=l.customer_id WHERE l.operating_company_id=$1::uuid AND l.load_number=$2 AND l.voided_at IS NULL`, [USMCA, loadNo]);
    const row = (inv: Record<string, any> | undefined, note: string) => {
      const total = inv?.total ?? null;
      rows.push(`| ${loadNo} | ${inv?.display_id ?? "—"} (${inv?.status ?? "none"}) | ${inv?.customer_name ?? l?.customer_name ?? "?"} | ${total == null ? "—" : (total / 100).toFixed(2)} | ${(amount / 100).toFixed(2)} | ${note} |`);
    };
    if (!l) { row(undefined, "HELD: load not found"); continue; }
    let inv = (await db.query(INV, [USMCA, l.id])).rows[0] as Record<string, any> | undefined;
    if (inv && ["sent", "partial", "paid"].includes(inv.status)) { row(inv, inv.total === amount && (norm(inv.customer_name).startsWith(norm(cust)) || norm(cust).startsWith(norm(inv.customer_name))) ? "already issued" : "ISSUED BUT DIFFERS"); continue; }
    if (!(norm(l.customer_name).startsWith(norm(cust)) || norm(cust).startsWith(norm(l.customer_name)))) { row(inv, `HELD: app customer ${l.customer_name} ≠ sheet ${cust}`); continue; }
    if (l.rate !== amount) { row(inv, `HELD: app rate ${(l.rate / 100).toFixed(2)} ≠ sheet Charges`); continue; }
    await db.query("SAVEPOINT one_load");
    try {
      let invoiceId: string;
      if (inv && inv.status === "proforma") {
        const c = await convertProformaToOfficial(db as never, { operatingCompanyId: USMCA, loadId: l.id, userId: OWNER });
        if (!c.converted) throw new Error(`proforma convert refused: ${c.reason}`);
        invoiceId = c.invoiceId;
      } else if (inv && inv.status === "draft") invoiceId = inv.id;
      else {
        const b = await buildInvoiceFromLoad(db as never, { operatingCompanyId: USMCA, loadId: l.id, requestedDisplayId: s.number } as never);
        invoiceId = String(b.invoice.id);
      }
      const draft = await one(`SELECT total_cents::int total FROM accounting.invoices WHERE id=$1::uuid`, [invoiceId]);
      if (draft.total !== amount) throw new Error(`invoice total ${(draft.total / 100).toFixed(2)} ≠ sheet Charges`);
      const sent = await sendDraftInvoice(db as never, { invoiceId, operatingCompanyId: USMCA, userId: OWNER, mode: "historical_backfill" });
      if (!(sent as { ok: boolean }).ok) {
        const s = sent as { error?: string; message?: string };
        throw new Error(`${s.error}: ${String(s.message ?? "").replace(/Invoice [0-9a-f-]+ /, "").slice(0, 160)}`);
      }
      await db.query("RELEASE SAVEPOINT one_load");
      inv = (await db.query(INV, [USMCA, l.id])).rows[0] as Record<string, any>;
      issued += 1;
      touched.push(invoiceId);
      touchedLoads.push({ load: loadNo, loadId: l.id, invoiceId });
      const gl = await one(`SELECT (SELECT count(*)::int FROM accounting.journal_entry_postings p WHERE p.operating_company_id=$1::uuid AND p.source_transaction_id=$2) inv_postings,
          (SELECT count(*)::int FROM accounting.journal_entry_postings p WHERE p.operating_company_id=$1::uuid AND p.load_id=$3::uuid AND p.created_at > now() - interval '1 hour') load_postings_this_txn`, [USMCA, invoiceId, l.id]);
      row(inv, `ISSUED now (A/R postings: invoice-sourced ${gl.inv_postings}, on load this txn ${gl.load_postings_this_txn})`);
    } catch (e) {
      await db.query("ROLLBACK TO SAVEPOINT one_load");
      row(inv, `HELD (${l.status}): ${(e as Error).message.slice(0, 170)}`);
    }
  }
  const after = await tb();
  // Scoped to the invoices this run touched: the owner is buying Faro purchases in the app concurrently, so a company-wide
  // signature races his live work. Every invoice this run issued must still read not_factored with no advance link.
  const touchedBad = (await one(`SELECT count(*)::int n FROM accounting.invoices WHERE id = ANY($1::uuid[]) AND (COALESCE(factoring_status,'not_factored') <> 'not_factored' OR factoring_advance_id IS NOT NULL)`, [touched])).n;
  if (touchedBad !== 0) throw new Error("REFUSE: an invoice this run issued carries a factoring status");
  void fsBefore; void newInvoicesNotFactored;
  console.log("| load | invoice # | customer | total | sheet Charges | state |\n|---|---|---|---|---|---|");
  for (const r of rows) console.log(r);
  console.log(`issued this run: ${issued}; trial balance ${before.net} -> ${after.net}; postings ${before.n} -> ${after.n}; factoring statuses unchanged`);
  if (Number(after.net) !== 0) throw new Error("REFUSE: trial balance off zero");
  await db.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(APPLY ? "COMMITTED" : "DRY RUN — rolled back");
  if (APPLY) {
    // EVENT 2 of the delivery latch (DR A/R / CR Unbilled) is an AFTER-COMMIT hook in the app (enqueueAfterCommit inside
    // sendDraftInvoice). A raw script client has no after-commit registry, so the hook fired on its own connection before
    // this commit and could not see the issued invoice. Run the SAME engine now, after commit, for each issued load.
    for (const t of touchedLoads) {
      const r = await postLoadRevenueLatch({ operating_company_id: USMCA, load_id: t.loadId, target_status: "completed_docs_received", entry_date_iso: companyBusinessDate(), actor_user_id: OWNER } as never);
      const ar = await one(`SELECT COALESCE(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::int ar FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id WHERE p.operating_company_id=$1::uuid AND p.load_id=$2::uuid AND a.account_name ~* 'accounts receivable'`, [USMCA, t.loadId]);
      console.log(`  latch event 2 load ${t.load}: ${JSON.stringify(r).slice(0, 120)} · A/R on load ${(ar.ar / 100).toFixed(2)}`);
    }
  }
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
  setTimeout(() => process.exit(0), 2000);
}
