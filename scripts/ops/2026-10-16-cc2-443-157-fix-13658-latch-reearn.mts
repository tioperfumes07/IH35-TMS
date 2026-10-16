// LEAD 443.157 follow-up — load 13658 (Faro # 138): the invoice was corrected 4,300 → 4,450 (Faro) through
// voidAndReissueLoadInvoice, but the delivery latch had recognized revenue at 4,300 (Event 1 "earn") and Event 2 ("bill")
// bills the EARNED amount, so A/R = 4,300 against a 4,450 invoice (revenue short 150). Engines only:
//   1. reverseJournalEntryNoFlip (the one JE reverser) on the STANDING bill JE, then the standing earn JE — one transaction;
//   2. after commit, postLoadRevenueLatch earn (target delivered_pending_docs → amount = the load's rate 4,450), then bill
//      (completed_docs_received → bills the new earn). The latch treats a reversed JE as not standing (ACCT-F66) and retires
//      its row on re-post (EVENT1-IDEMPOTENCY).
// Refuses unless the load's rate and its live invoice both equal 4,450 first; verifies A/R 4,450 / Unbilled 0 / revenue 4,450.
//   --fork-commit (assertNotProduction; --reproduce first replays the prod state on a fork) · --apply --auth OWNER-ORDER-443.157
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { reverseJournalEntryNoFlip } from "../../apps/backend/src/accounting/journal-entries.service.ts";
import { postLoadRevenueLatch, STANDING_LATCH_JE_PREDICATE } from "../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";
import { voidAndReissueLoadInvoice } from "../../apps/backend/src/accounting/invoice-number-release.service.ts";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_NUMBER = "13658";
const WANT = 445000;
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "OWNER-ORDER-443.157") throw new Error("--apply requires --auth OWNER-ORDER-443.157");
  // verify-owner-authorization: the owner's 443.157 order (invoice = Faro amount) relayed by Lead; same authority as the run it completes.
}
if (!APPLY && !FORK) throw new Error("pass --fork-commit or --apply");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.157 13658 latch re-earn" });
else await assertNotProduction(db, { label: "443.157 13658 latch re-earn (fork)" });
const scope = async () => {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
};
const one = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0] as Record<string, any>;
const balances = async (loadId: string) =>
  (await db.query(`SELECT a.account_number acct, sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)::int net
     FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id WHERE p.load_id=$1::uuid AND a.account_number IN ('1100','1150','4000') GROUP BY 1 ORDER BY 1`, [loadId])).rows;
try {
  await scope();
  const load = await one(`SELECT id::text, rate_total_cents::int rate FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2 AND voided_at IS NULL`, [USMCA, LOAD_NUMBER]);
  await db.query("COMMIT");
  if (process.argv.includes("--reproduce") && FORK) {
    await scope();
    const inv = await one(`SELECT id::text FROM accounting.invoices WHERE source_load_id=$1::uuid AND voided_at IS NULL`, [load.id]);
    await voidAndReissueLoadInvoice(db as never, { operatingCompanyId: USMCA, invoiceId: inv.id, actorUserId: OWNER, actorRole: "Owner", reason: "fork reproduce of prod 443.157 13658", reissueNumber: "138", newTotalCents: WANT, sendMode: "historical_backfill" });
    await db.query("COMMIT");
    await postLoadRevenueLatch({ operating_company_id: USMCA, load_id: load.id, target_status: "completed_docs_received", entry_date_iso: companyBusinessDate(), actor_user_id: OWNER } as never);
  }
  await scope();
  const now = await one(`SELECT l.rate_total_cents::int rate, (SELECT total_cents::int FROM accounting.invoices i WHERE i.source_load_id=l.id AND i.voided_at IS NULL AND i.status='sent') inv FROM mdata.loads l WHERE l.id=$1::uuid`, [load.id]);
  console.log(`BEFORE rate ${now.rate} invoice ${now.inv} balances ${JSON.stringify(await balances(load.id))}`);
  if (now.rate !== WANT || now.inv !== WANT) throw new Error(`REFUSE: load rate ${now.rate} / invoice ${now.inv} must both be ${WANT} first`);
  const latch = (await db.query(`SELECT p.event, p.journal_entry_id::text je FROM accounting.load_revenue_recognition_postings p WHERE p.operating_company_id=$1::uuid AND p.load_id=$2::uuid AND p.is_active AND ${STANDING_LATCH_JE_PREDICATE}`, [USMCA, load.id])).rows as Array<{ event: string; je: string }>;
  const bill = latch.find((r) => r.event === "bill");
  const earn = latch.find((r) => r.event === "earn");
  if (!bill || !earn) throw new Error(`REFUSE: expected standing earn + bill, found ${JSON.stringify(latch)}`);
  const reason = "Lead 443.157: invoice corrected to the Faro amount 4,450 — re-earn the delivery latch at the load's rate";
  const rb = await reverseJournalEntryNoFlip(db as never, { operatingCompanyId: USMCA, journalEntryId: bill.je, reason, actorUserId: OWNER, currentBusinessDate: companyBusinessDate() });
  const re = await reverseJournalEntryNoFlip(db as never, { operatingCompanyId: USMCA, journalEntryId: earn.je, reason, actorUserId: OWNER, currentBusinessDate: companyBusinessDate() });
  await db.query("COMMIT");
  console.log(`reversed bill ${bill.je} → ${JSON.stringify(rb).slice(0, 120)} · earn ${earn.je} → ${JSON.stringify(re).slice(0, 120)}`);
  const e1 = await postLoadRevenueLatch({ operating_company_id: USMCA, load_id: load.id, target_status: "delivered_pending_docs", entry_date_iso: companyBusinessDate(), actor_user_id: OWNER } as never);
  const e2 = await postLoadRevenueLatch({ operating_company_id: USMCA, load_id: load.id, target_status: "completed_docs_received", entry_date_iso: companyBusinessDate(), actor_user_id: OWNER } as never);
  console.log(`re-earn ${JSON.stringify(e1).slice(0, 140)}\nre-bill ${JSON.stringify(e2).slice(0, 140)}`);
  await scope();
  const after = await balances(load.id);
  const tb = await one(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA]);
  await db.query("ROLLBACK");
  console.log(`AFTER balances ${JSON.stringify(after)} · trial balance ${tb.net}`);
  const get = (a: string) => Number(after.find((r: any) => r.acct === a)?.net ?? 0);
  console.log(get("1100") === WANT && get("1150") === 0 && get("4000") === -WANT && Number(tb.net) === 0 ? "VERIFIED: A/R 4,450 · Unbilled 0 · revenue 4,450 · TB 0" : "NOT VERIFIED — investigate");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
  setTimeout(() => process.exit(0), 2000);
}
