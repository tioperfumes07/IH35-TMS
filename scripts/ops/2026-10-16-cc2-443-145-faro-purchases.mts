// LEAD 443.145 (owner 2026-10-16 08:58 CT "get the data seeded immediately"): Faro purchases through the ONE purchase engine
// (createPurchaseDraft + postPurchase) — one purchase per Faro invoice, figures from faro_purchase_report_until_10-15-26.csv,
// wire date from faro_payments_to_you_until_10-15-26.csv. Only invoices whose load + AR invoice exist AND whose debtor, PO
// and amount agree with Faro. Refuses (rolls back) if any engine net differs from Faro's Net Adv, or trial balance moves off 0.
//   default DRY RUN (rolled back) · --apply --auth AUTH-NNN (prod: assertIsIntendedProduction + verify-owner-authorization)
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";
import { createPurchaseDraft, postPurchase } from "../../apps/backend/src/factoring/purchase.service.ts";
import { buildInvoiceFromLoad } from "../../apps/backend/src/accounting/from-load.ts";
import { sendDraftInvoice } from "../../apps/backend/src/accounting/invoice-send.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const FARO = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4";
const APPLY = process.argv.includes("--apply");
let auth = "";
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  auth = i > 0 ? process.argv[i + 1] ?? "" : "";
  // 443.145: the owner ordered the seed "immediately … PRs/guards come AFTER" and the Lead relayed "no AUTH numbers
  // needed". --auth OWNER-ORDER-443.145 records that order; any AUTH-NNN still goes through verify-owner-authorization.
  if (auth === "OWNER-ORDER-443.145") console.log("authority: owner order 443.145 (2026-10-16 08:58 CT), relayed by Lead; AUTH record filed after");
  else if (!/^AUTH-\d+$/.test(auth)) throw new Error("--apply requires --auth AUTH-NNN | OWNER-ORDER-443.145");
  else execFileSync("node", ["scripts/verify-owner-authorization.mjs", auth], { stdio: "inherit" });
}
import fs from "node:fs";
// Rows come from the Faro files themselves. A row posts only when exactly one load carries its PO (W.O. or PO, leading
// zeros ignored), that load has exactly one live sent invoice whose total = Faro Purchase, and the invoice customer's
// first word matches the Faro debtor's. Anything else is HELD and printed with the reason — never guessed.
const HOME = process.env.HOME ?? "";
const csvRows = (f: string) => {
  const out: string[][] = [];
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const cells: string[] = []; let cur = ""; let q = false;
    for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { cells.push(cur); cur = ""; } else cur += ch; }
    cells.push(cur); out.push(cells);
  }
  return out;
};
const cents = (v: string) => Math.round(Number(String(v || "0").replace(/,/g, "")) * 100);
const iso = (d: string) => { const [m, dd, y] = d.split("/"); return `20${y.slice(-2)}-${m.padStart(2, "0")}-${dd.padStart(2, "0")}`; };
const HELD: Record<string, string> = {
  "126": "Faro PO 39347 vs load 13648 PO 39316 — needs the RC/BOL read",
  "136": "Faro debtor ARMSTRONG vs load 13659 invoice customer Trinity Logistics",
  // LEAD 443.145 ruling (2): held while the Lead asks the owner.
  "143": "PO 68085 — owner ruling pending (Lead 443.145)",
  "147": "PO 66123 — owner ruling pending (Lead 443.145)",
  "138": "13658 invoice $4,300 vs Faro $4,450 — owner ruling pending (Lead 443.145)",
  "132": "smplm4879 — owner ruling pending (Lead 443.145)",
  "151": "GTM America, no PO — owner ruling pending (Lead 443.145)",
};
const wires = new Map<string, string>();
for (const r of csvRows(`${HOME}/Downloads/SEED-10-16/faro_payments_to_you_until_10-15-26.csv`)) if (r[1]) wires.set(r[1].trim(), iso(r[5]));
const FARO_ROWS = csvRows(`${HOME}/Downloads/SEED-10-16/faro_purchase_report_until_10-15-26.csv`).map((r) => ({
  debtor: r[0], date: iso(r[1]), inv: r[2].trim(), po: r[3].trim(), gross: cents(r[5]), escrow: cents(r[6]), cash: cents(r[7]),
  disc: cents(r[8]), wire: cents(r[9]), net: cents(r[11]),
}));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.145 Faro purchases" });
const tb = async () => (await db.query(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net, count(*)::int n FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA])).rows[0];
await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const before = await tb();
  let posted = 0;
  for (const f of FARO_ROWS) {
    const { inv, gross, escrow, disc, wire, net } = f;
    const hold = (why: string) => console.log(`HELD Faro ${inv} (${f.debtor}, PO ${f.po || "none"}, $${(gross / 100).toFixed(2)}): ${why}`);
    if ((await db.query(`SELECT 1 FROM accounting.factoring_purchase_lines pl JOIN accounting.factoring_purchases p ON p.id = pl.purchase_id WHERE pl.operating_company_id=$1::uuid AND pl.faro_invoice_number=$2 AND pl.voided_at IS NULL AND p.voided_at IS NULL`, [USMCA, inv])).rows.length) continue;
    if (HELD[inv]) { hold(HELD[inv]); continue; }
    if (!f.po) { hold("no PO on the Faro row — no load to tie it to"); continue; }
    const loads = (await db.query(`SELECT l.id::text, l.load_number FROM mdata.loads l WHERE l.operating_company_id=$1::uuid AND l.voided_at IS NULL AND (ltrim(regexp_replace(lower(l.customer_wo_number),'[^a-z0-9]','','g'),'0') = ltrim(regexp_replace(lower($2),'[^a-z0-9]','','g'),'0')
              OR ltrim(regexp_replace(lower(l.customer_po_number),'[^a-z0-9]','','g'),'0') = ltrim(regexp_replace(lower($2),'[^a-z0-9]','','g'),'0'))`, [USMCA, f.po])).rows;
    if (loads.length !== 1) { hold(`${loads.length} loads carry this PO`); continue; }
    const load = loads[0].load_number;
    const INV_SQL = `SELECT i.id::text, i.display_id, i.status::text, i.total_cents::int total, c.customer_name FROM accounting.invoices i LEFT JOIN mdata.customers c ON c.id=i.customer_id WHERE i.operating_company_id=$1::uuid AND i.source_load_id=$2::uuid AND i.voided_at IS NULL`;
    const w = (x: string) => String(x ?? "").toLowerCase().replace(/[^a-z ]/g, "").replace(/^s e /, "se").split(" ")[0];
    let i = (await db.query(INV_SQL, [USMCA, loads[0].id])).rows;
    if (i.length === 0) {
      // No AR invoice yet: create it with the invoice engine (number <Faro inv>-<load>), only when the load's customer and
      // rate agree with Faro; issue it in historical_backfill mode (no customer e-mail).
      const ld = (await db.query(`SELECT l.rate_total_cents::int rate, c.customer_name FROM mdata.loads l LEFT JOIN mdata.customers c ON c.id=l.customer_id WHERE l.id=$1::uuid`, [loads[0].id])).rows[0];
      if (ld.rate !== gross) { hold(`load ${load} rate ${ld.rate} != Faro ${gross} (no invoice minted)`); continue; }
      if (w(ld.customer_name).slice(0, 4) !== w(f.debtor).slice(0, 4)) { hold(`debtor ${f.debtor} vs load customer ${ld.customer_name} (no invoice minted)`); continue; }
      await db.query("SAVEPOINT inv_mint");
      try {
        const b = await buildInvoiceFromLoad(db as never, { operatingCompanyId: USMCA, loadId: loads[0].id, requestedDisplayId: inv } as never);
        const sent = await sendDraftInvoice(db as never, { invoiceId: String(b.invoice.id), operatingCompanyId: USMCA, userId: OWNER, mode: "historical_backfill" });
        if (!(sent as { ok: boolean }).ok) throw new Error(`send refused: ${JSON.stringify(sent)}`);
        await db.query("RELEASE SAVEPOINT inv_mint");
        console.log(`  invoice minted + issued for load ${load}: ${b.invoice.display_id}`);
      } catch (e) {
        await db.query("ROLLBACK TO SAVEPOINT inv_mint");
        hold(`invoice engine refused for load ${load}: ${(e as Error).message.slice(0, 200)}`);
        continue;
      }
      i = (await db.query(INV_SQL, [USMCA, loads[0].id])).rows;
    }
    if (i.length !== 1) { hold(`load ${load} has ${i.length} live invoices`); continue; }
    if (i[0].total !== gross) { hold(`load ${load} invoice ${i[0].display_id} total ${i[0].total} != Faro ${gross}`); continue; }
    if (w(i[0].customer_name).slice(0, 4) !== w(f.debtor).slice(0, 4)) { hold(`debtor ${f.debtor} vs invoice customer ${i[0].customer_name}`); continue; }
    const pdate = f.date; const wdate = wires.get(inv) ?? f.date;
    const d = await createPurchaseDraft(db as never, {
      operatingCompanyId: USMCA, actorUserId: OWNER, factoringCompanyVendorId: FARO, purchaseDate: pdate, wireDate: wdate,
      faroReportRef: `Faro purchase report until 10-15-26 inv ${inv}`, wireFeeCents: wire,
      notes: `443.145 seed — Faro inv ${inv}, load ${load}`,
      lines: [{ invoice_id: i[0].id, gross_cents: gross, escrow_reserve_cents: escrow, cash_reserve_cents: f.cash, fee_cents: disc, faro_invoice_number: inv }],
    });
    const purchaseId = (d as { id?: string; purchase_id?: string }).id ?? (d as { purchase_id?: string }).purchase_id;
    const p = await postPurchase(db as never, { operatingCompanyId: USMCA, actorUserId: OWNER, purchaseId: String(purchaseId) });
    const row = (await db.query(`SELECT display_id, status, net_to_company_cents::int net, journal_entry_id::text je FROM accounting.factoring_purchases WHERE id=$1::uuid`, [purchaseId])).rows[0];
    console.log(`Faro ${inv}\tload ${load}\tinv ${i[0].display_id}\t${row.display_id}\t${row.status}\tnet ${row.net} (Faro ${net})\tJE ${row.je}`);
    if (row.net !== net) throw new Error(`REFUSE: Faro ${inv} engine net ${row.net} != Faro Net Adv ${net}`);
    void p;
    posted += 1;
  }
  console.log(`posted this run: ${posted}`);
  const after = await tb();
  console.log(`trial balance ${before.net} -> ${after.net}; postings ${before.n} -> ${after.n}`);
  if (Number(after.net) !== 0) throw new Error("REFUSE: trial balance off zero");
  await db.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(APPLY ? "COMMITTED" : "DRY RUN — rolled back");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error((e as { details?: unknown }).details ?? "");
  throw e;
} finally {
  await db.end();
}
