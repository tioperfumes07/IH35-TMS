// LEAD 443.192 (verify-pl-cost-of-revenue) — RESTATE delivery-latch earns that were dated by the fire day, not the delivery.
// The engine fix (#26924, poster.service.ts resolveEarnEntryDate) dates every NEW earn by its evidence. This restates the
// standing earns written before it, through the engines only (VOID = reversal; nothing deleted, no JE date edited):
//   1. one transaction per load: reverseJournalEntryNoFlip on the STANDING bill JE (its A/R line blocks a re-earn via
//      loadHasStandingInvoiceGl), then the standing earn JE — reversals dated today (open period);
//   2. after commit: postLoadRevenueLatch earn (delivered_pending_docs → the fixed engine dates it by the departure), then
//      bill (completed_docs_received). The latch treats a reversed JE as not standing (ACCT-F66), retires its row on re-post
//      and audits accounting.revrec.earn.posted.
// SELECTION = evidence only: a standing earn whose entry_date ≠ the final active delivery stop's departure as a company
// business date (America/Chicago). A load with no departure (no evidence) is NEVER touched — listed for the Lead.
// Per load, refuses unless amounts after == before (A/R 1100, Unbilled 1150, revenue 4000) and the new earn is dated the
// delivery day; whole run refuses unless the company trial balance is 0.
//   default: dry run inside one transaction, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.192
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { reverseJournalEntryNoFlip } from "../../apps/backend/src/accounting/journal-entries.service.ts";
import { postLoadRevenueLatch, STANDING_LATCH_JE_PREDICATE } from "../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";
import { COMPANY_TIME_ZONE, companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.192") throw new Error("--apply requires --auth LEAD-ORDER-443.192");
  // verify-owner-authorization: Lead ROUND 443.192 (08:55Z) "engine defect → fix at the engine + restatement through the engine,
  // audited, TB 0" — relayed by the owner's Lead channel; amounts unchanged, only the earn date moves to the delivery day.
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.192 revenue earn re-date" });
else if (FORK) await assertNotProduction(db, { label: "443.192 revenue earn re-date (fork)" });
const scope = async () => {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
};
const balances = async (loadId: string) =>
  Object.fromEntries(
    (await db.query(`SELECT a.account_number acct, sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)::int net
       FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id
      WHERE p.load_id=$1::uuid AND a.account_number IN ('1100','1150','4000') GROUP BY 1`, [loadId])).rows.map((r: any) => [r.acct, r.net])
  );
const standing = async (loadId: string) =>
  (await db.query(`SELECT p.event, p.journal_entry_id::text je, je.entry_date::text entry_date
     FROM accounting.load_revenue_recognition_postings p JOIN accounting.journal_entries je ON je.id=p.journal_entry_id
    WHERE p.operating_company_id=$1::uuid AND p.load_id=$2::uuid AND p.is_active AND ${STANDING_LATCH_JE_PREDICATE}`, [USMCA, loadId])).rows as Array<{ event: string; je: string; entry_date: string }>;

// Same evidence the engine reads (finalActiveDeliveryDepartureAt): the final active delivery stop's departure.
const CANDIDATES = `
  WITH earn AS (
    SELECT p.load_id, je.entry_date
      FROM accounting.load_revenue_recognition_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_id
     WHERE p.operating_company_id = $1::uuid AND p.event = 'earn' AND p.is_active AND ${STANDING_LATCH_JE_PREDICATE}),
  dep AS (
    SELECT DISTINCT ON (s.load_id) s.load_id, s.actual_departure_at
      FROM mdata.load_stops s
     WHERE s.stop_type::text = 'delivery' AND s.status::text <> 'cancelled' AND s.soft_deleted_at IS NULL
     ORDER BY s.load_id, s.sequence_number DESC)
  SELECT l.id::text load_id, l.load_number, e.entry_date::text earned_on,
         (d.actual_departure_at AT TIME ZONE $2)::date::text delivered_on
    FROM earn e JOIN mdata.loads l ON l.id = e.load_id LEFT JOIN dep d ON d.load_id = e.load_id
   WHERE l.operating_company_id = $1::uuid AND l.voided_at IS NULL
   ORDER BY l.load_number`;

let tbOk = false;
try {
  await scope();
  const rows = (await db.query(CANDIDATES, [USMCA, COMPANY_TIME_ZONE])).rows as Array<{ load_id: string; load_number: string; earned_on: string; delivered_on: string | null }>;
  const noEvidence = rows.filter((r) => !r.delivered_on);
  const redate = rows.filter((r) => r.delivered_on && r.delivered_on !== r.earned_on);
  console.log(`standing earns ${rows.length} · correct ${rows.length - noEvidence.length - redate.length} · to re-date ${redate.length} · NO delivery evidence (untouched, Lead) ${noEvidence.length}: ${noEvidence.map((r) => r.load_number).join(", ")}`);
  console.log(`re-date: ${redate.map((r) => `${r.load_number} ${r.earned_on}→${r.delivered_on}`).join(" · ")}`);
  if (!APPLY && !FORK) {
    await db.query("ROLLBACK");
    console.log("DRY RUN — selection only, nothing written. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.192.");
  } else {
    await db.query("COMMIT");
    const reason = "Lead 443.192: delivery-latch earn was dated by the fire day — restate at the delivery date (amount unchanged)";
    for (const r of redate) {
      await scope();
      const before = await balances(r.load_id);
      const s = await standing(r.load_id);
      const bill = s.find((x) => x.event === "bill");
      const earn = s.find((x) => x.event === "earn");
      if (!earn) throw new Error(`REFUSE ${r.load_number}: no standing earn`);
      if (bill) await reverseJournalEntryNoFlip(db as never, { operatingCompanyId: USMCA, journalEntryId: bill.je, reason, actorUserId: OWNER, currentBusinessDate: companyBusinessDate() });
      await reverseJournalEntryNoFlip(db as never, { operatingCompanyId: USMCA, journalEntryId: earn.je, reason, actorUserId: OWNER, currentBusinessDate: companyBusinessDate() });
      await db.query("COMMIT");
      const e1 = await postLoadRevenueLatch({ operating_company_id: USMCA, load_id: r.load_id, target_status: "delivered_pending_docs", entry_date_iso: companyBusinessDate(), actor_user_id: OWNER } as never);
      const e2 = bill
        ? await postLoadRevenueLatch({ operating_company_id: USMCA, load_id: r.load_id, target_status: "completed_docs_received", entry_date_iso: companyBusinessDate(), actor_user_id: OWNER } as never)
        : null;
      await scope();
      const after = await balances(r.load_id);
      const now = await standing(r.load_id);
      await db.query("ROLLBACK");
      const newEarn = now.find((x) => x.event === "earn");
      const same = ["1100", "1150", "4000"].every((a) => Number(before[a] ?? 0) === Number(after[a] ?? 0));
      const billOk = !bill || Boolean(now.find((x) => x.event === "bill"));
      console.log(`${r.load_number}: earn ${earn.entry_date}→${newEarn?.entry_date} · bill ${bill ? "re-billed" : "none"} · balances ${JSON.stringify(before)} → ${JSON.stringify(after)} · ${JSON.stringify(e1).slice(0, 60)} ${e2 ? JSON.stringify(e2).slice(0, 60) : ""}`);
      if (!same || newEarn?.entry_date !== r.delivered_on || !billOk) throw new Error(`NOT VERIFIED ${r.load_number} — stop and investigate`);
    }
  }
  await scope();
  const tb = (await db.query(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA])).rows[0];
  await db.query("ROLLBACK");
  tbOk = Number(tb.net) === 0;
  console.log(`trial balance ${tb.net} ${tbOk ? "· VERIFIED" : "· NOT ZERO — investigate"}`);
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
  setTimeout(() => process.exit(tbOk ? 0 : 1), 2000);
}
