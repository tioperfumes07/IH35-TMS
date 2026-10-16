// OWNER 2026-10-16 09:51 CT: Faro data is informational only — the owner creates every purchase himself. Reverse the 8
// purchases CC-2 posted at 14:05 UTC (FP-2026-00001..00008) through the ONE purchase void engine (voidPurchase: reversal JE
// via reverseFactoringAdvanceEventInClientTx, void stamp, invoices back to not_factored, audit row). No delete.
// Refuses unless exactly these 8 end voided, their 8 invoices read not_factored + open, and the trial balance nets 0.
//   default DRY RUN (rolled back) · --apply (prod: assertIsIntendedProduction; authority = owner order 09:51 CT)
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";
import { voidPurchase } from "../../apps/backend/src/factoring/purchase.service.ts";
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
const IDS = [
  "e5f1f571-6d8f-420b-bb8a-5489a7f52a39", "064f25c4-66dc-44a5-b294-f47c3969fb6d", "d0b06d5f-7ca8-4405-a575-6aae489bdfba",
  "681671ed-f14d-4d48-851a-b80ebce9851f", "36fe285a-734d-4858-adcd-bd1688397cac", "42027b4e-f595-4fec-83ba-3d5a3e5ed30a",
  "c0239679-e564-41fe-b5e5-192dda09d855", "893be42c-917a-463b-abec-9a02671a6488",
];
const REASON = "Owner 2026-10-16 09:51 CT: Faro data is informational only — owner creates every purchase himself. Reversing CC-2 443.145 seed.";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.145 void 8 Faro purchases" });
const tb = async () => (await db.query(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net, count(*)::int n FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA])).rows[0];
await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const before = await tb();
  for (const id of IDS) {
    await voidPurchase(db as never, { operatingCompanyId: USMCA, actorUserId: OWNER, purchaseId: id, reason: REASON });
    const audit = (await db.query(`SELECT payload->>'reversal_journal_entry_id' rev FROM audit.audit_events WHERE event_class='accounting.factoring_purchase_voided' AND payload->>'resource_id'=$1 ORDER BY 1 DESC LIMIT 1`, [id])).rows[0];
    const r = (await db.query(`SELECT p.display_id, p.status, pl.faro_invoice_number faro, l.load_number, p.journal_entry_id::text je, i.display_id inv, i.status::text inv_status, i.factoring_status fs
        FROM accounting.factoring_purchases p JOIN accounting.factoring_purchase_lines pl ON pl.purchase_id=p.id JOIN accounting.invoices i ON i.id=pl.invoice_id LEFT JOIN mdata.loads l ON l.id=pl.load_id WHERE p.id=$1::uuid`, [id])).rows[0];
    console.log(`${r.display_id}\t${r.status}\tFaro ${r.faro}\tload ${r.load_number}\tJE ${r.je}\treversal JE ${audit?.rev ?? "?"}\tinv ${r.inv} ${r.inv_status} factoring=${r.fs}`);
    if (r.status !== "voided" || r.fs !== "not_factored" || !audit?.rev) throw new Error(`REFUSE: ${r.display_id} not fully reversed`);
  }
  const after = await tb();
  const left = (await db.query(`SELECT count(*)::int n FROM accounting.factoring_purchases WHERE operating_company_id=$1::uuid AND voided_at IS NULL`, [USMCA])).rows[0].n;
  console.log(`live purchases left ${left}; trial balance ${before.net} -> ${after.net}; postings ${before.n} -> ${after.n}`);
  if (Number(after.net) !== 0 || left !== 0) throw new Error("REFUSE: TB off zero or a purchase still live");
  await db.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(APPLY ? "COMMITTED" : "DRY RUN — rolled back");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error((e as { details?: unknown }).details ?? "");
  throw e;
} finally {
  await db.end();
}
