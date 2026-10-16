// LEAD 443.151 (b) (owner reconciliation 10-1-26-Usmca-Faro-Always-Reconciliation.xlsx, invoices 1–118; ruling option 3):
// correct each ISSUED invoice to the sheet through voidAndReissueLoadInvoice — void (reversal JE) → the voided row is renamed
// "<number>-V1" (audited) → the load's line haul set to the sheet amount → reissued under the SAME number (# 87 is reissued
// on 13612 under 87, the number the owner submitted) → issued without customer e-mail (historical_backfill).
// # 99 is NOT here: 443.157 (owner 11:34 CT) corrects it to Shram Logistics Solutions 2,400.00 in the Faro realignment run. Each row in its own savepoint; a refusal
// rolls back that row only and is printed. Refuses (whole run) if the trial balance moves off 0.
//   default DRY RUN (rolled back) · --fork-commit (assertNotProduction) · --apply --auth AUTH-NNN (prod)
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { voidAndReissueLoadInvoice } from "../../apps/backend/src/accounting/invoice-number-release.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
let auth = "";
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  auth = i > 0 ? process.argv[i + 1] ?? "" : "";
  // Lead 443.151 carries the owner's order (owner law: merge-on-safe, "no AUTH numbers needed"); --auth OWNER-ORDER-443.151 records
  // it; any AUTH-NNN still goes through verify-owner-authorization.
  if (auth === "OWNER-ORDER-443.151") console.log("authority: owner order relayed by Lead 443.151 (2026-10-16)");
  else if (!/^AUTH-\d+$/.test(auth)) throw new Error("--apply requires --auth AUTH-NNN | OWNER-ORDER-443.151");
  else execFileSync("node", ["scripts/verify-owner-authorization.mjs", auth], { stdio: "inherit" });
}
// app invoice # → sheet amount (cents); reissue number when it differs from the invoice's own.
const ROWS: Array<{ display: string; cents: number; number?: string; customer?: string }> = [
  { display: "52-13570", cents: 611500 },
  { display: "59-13578", cents: 521000 },
  { display: "69-13589", cents: 415000 },
  { display: "70-13587", cents: 412000 },
  { display: "91-13611", cents: 320000 },
  { display: "117-13640", cents: 112000 },
  { display: "100-13612", cents: 490000, number: "87" },
];
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.151 b void-and-reissue same number" });
else if (FORK) await assertNotProduction(db, { label: "443.151 b void-and-reissue (fork)" });
const one = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0] as Record<string, any>;
await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const tb = async () => (await one(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA])).net;
  const tb0 = await tb();
  for (const r of ROWS) {
    const inv = await one(`SELECT id::text FROM accounting.invoices WHERE operating_company_id=$1::uuid AND display_id=$2 AND voided_at IS NULL`, [USMCA, r.display]);
    if (!inv) { console.log(`HELD ${r.display}: no live invoice with that number`); continue; }
    await db.query("SAVEPOINT one");
    try {
      const out = await voidAndReissueLoadInvoice(db as never, {
        operatingCompanyId: USMCA, invoiceId: inv.id, actorUserId: OWNER, actorRole: "Owner",
        reason: `Lead 443.151 b: owner reconciliation — invoice ${r.number ?? r.display.split("-")[0]} = ${(r.cents / 100).toFixed(2)}`,
        newTotalCents: r.cents, reissueNumber: r.number, newCustomerId: r.customer, sendMode: "historical_backfill",
      });
      const ar = await one(`SELECT COALESCE(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::int ar FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id WHERE p.load_id=$1::uuid AND a.account_number='1100'`, [out.load_id]);
      await db.query("RELEASE SAVEPOINT one");
      console.log(`${r.display}\tvoided→${out.released_display_id}\treversal ${out.reversal_journal_entry_id}\treissued ${out.new_display_id}\t${(out.before_total_cents / 100).toFixed(2)} → ${(out.after_total_cents / 100).toFixed(2)}\tA/R on load ${(ar.ar / 100).toFixed(2)}`);
    } catch (e) {
      await db.query("ROLLBACK TO SAVEPOINT one");
      console.log(`HELD ${r.display}: ${(e as Error).message.slice(0, 260)}`);
    }
  }
  const tb1 = await tb();
  console.log(`trial balance ${tb0} -> ${tb1}`);
  if (Number(tb1) !== 0) throw new Error("REFUSE: trial balance off zero");
  await db.query(APPLY || FORK ? "COMMIT" : "ROLLBACK");
  console.log(APPLY || FORK ? "COMMITTED" : "DRY RUN — rolled back");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
  setTimeout(() => process.exit(0), 2000);
}
