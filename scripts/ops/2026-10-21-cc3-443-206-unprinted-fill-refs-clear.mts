// LEAD 21:25Z (answer to CC-3): the Relay-fill expense documents that name a settlement which did NOT print them (no live
// settlement by that reference whose own settlement_creator.posted audit names the document or a fuel row of the fill —
// the 10-11 / 10-12 load-holder fill named them) → clear settlement_no + source_settlement_ref to NULL, audited (old
// reference kept), exactly like P-0071 / P-0080 (2026-10-21-cc3-443-203-unprinted-fill-ref-clear.mts). Selection = the guard's
// RULE 6 predicate (verify-relay-fill-expense-settlement-ref.mjs). Refuses unless exactly EXPECT documents match.
// Text only — TB unchanged (verified). default: dry run, ROLLED BACK · --fork-commit · --apply --auth LEAD-ORDER-443.206
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const EXPECT = 23;
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.206") throw new Error("--apply requires --auth LEAD-ORDER-443.206");
  // verify-owner-authorization: Lead 10-21 21:25Z ANSWERS "CC-3: 23 Relay docs naming a settlement that did not print them →
  // GO, clear to NULL exactly like P-0071/P-0080 (fork first, audit row keeps old ref, TB 0), guard ceiling → 0".
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.206 unprinted fill refs clear" });
else if (FORK) await assertNotProduction(db, { label: "443.206 unprinted fill refs clear (fork)" });

const SELECT = `
  SELECT e.id::text AS id, e.settlement_no, e.source_settlement_ref, l.load_number
    FROM accounting.expenses e JOIN mdata.vendors v ON v.id = e.vendor_uuid LEFT JOIN mdata.loads l ON l.id = e.load_id
   WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND v.vendor_name ~* '^relay( |$)' AND e.settlement_no IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM driver_finance.driver_settlements s JOIN audit.audit_events a
           ON a.event_class = 'driver_finance.settlement_creator.posted' AND a.payload->>'resource_id' = s.id::text
        WHERE s.operating_company_id = e.operating_company_id AND s.voided_at IS NULL AND s.status <> 'cancelled'
          AND COALESCE(NULLIF(btrim(s.source_document_ref), ''), s.display_id) = e.settlement_no
          AND (a.payload->'expense_ids' ? e.id::text
               OR a.payload->'fuel_transaction_ids' ?| ARRAY(
                    SELECT ft.id::text FROM fuel.fuel_transactions ft
                     WHERE ft.operating_company_id = e.operating_company_id AND ft.voided_at IS NULL
                       AND (ft.id = e.source_fuel_transaction_id
                            OR ft.id::text IN (SELECT p.source_transaction_id::text FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event')
                            OR ft.relay_fuel_transaction_id::text IN (SELECT p.source_transaction_id::text FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event')))))
   ORDER BY l.load_number, e.id
   FOR UPDATE OF e`;
const tb = async () =>
  (await db.query(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net
     FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA])).rows[0].net;

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const tbBefore = await tb();
  const rows = (await db.query(SELECT, [USMCA])).rows;
  console.log(`selected ${rows.length}`);
  if (rows.length !== EXPECT) throw new Error(`REFUSE: expected ${EXPECT} documents, found ${rows.length}`);
  for (const r of rows) {
    await db.query(`UPDATE accounting.expenses SET settlement_no = NULL, source_settlement_ref = NULL, updated_at = now()
                     WHERE operating_company_id = $1::uuid AND id = $2::uuid AND settlement_no = $3`, [USMCA, r.id, r.settlement_no]);
    await appendCrudAudit(db as never, OWNER, "accounting.expense.relay_fill_settlement_ref_cleared",
      { resource_type: "accounting.expenses", resource_id: r.id, operating_company_id: USMCA, old_settlement_no: r.settlement_no, old_source_settlement_ref: r.source_settlement_ref,
        reason: "Lead 21:25Z: unprinted fill — the named settlement did not print it (named by the 10-11/10-12 load-holder fill)" }, "info", "443.206");
    console.log(`  ${r.id} load ${r.load_number ?? "-"}: ${r.settlement_no}/${r.source_settlement_ref ?? "∅"} → ∅/∅`);
  }
  const left = (await db.query(SELECT, [USMCA])).rows.length;
  const tbAfter = await tb();
  console.log(`cleared ${rows.length} · left ${left} · trial balance before ${tbBefore} after ${tbAfter}`);
  if (left !== 0 || tbAfter !== tbBefore || Number(tbAfter) !== 0) throw new Error("NOT VERIFIED");
  if (APPLY || FORK) { await db.query("COMMIT"); console.log("COMMITTED"); }
  else { await db.query("ROLLBACK"); console.log("DRY RUN — ROLLED BACK."); }
  ok = true;
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 1000);
}
