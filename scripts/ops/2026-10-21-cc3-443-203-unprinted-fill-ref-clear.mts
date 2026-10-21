// LEAD 443.203 (20:22Z) — the 2 unprinted Relay fills still naming cancelled P-0071 (load 13665) / P-0080 (load 13671): no
// live settlement printed them (its own posted audit names neither the document nor a fuel row of the fill) → clear
// settlement_no + source_settlement_ref to NULL, audited (old reference kept), same as ruling #3's T170 fills.
// Refuses unless each document still names that reference and NO live settlement printed it. Text only — TB unchanged.
//   default: dry run, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.203
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DOCS = [
  { id: "6a3d34d6-6c24-49f0-89be-7e97b8e1319e", ref: "P-0071", load: "13665" },
  { id: "f04cfd43-8585-419f-8846-a89b409cf9f7", ref: "P-0080", load: "13671" },
];
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.203") throw new Error("--apply requires --auth LEAD-ORDER-443.203");
  // verify-owner-authorization: Lead 443.203 (20:22Z) "the 2 unprinted fills still naming P-0071 / P-0080 → clear to NULL
  // with audit, same as ruling #3" — relayed by the owner's Lead channel.
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.203 unprinted fill ref clear" });
else if (FORK) await assertNotProduction(db, { label: "443.203 unprinted fill ref clear (fork)" });

const PRINTED_BY_LIVE = `
  SELECT EXISTS (
    SELECT 1 FROM driver_finance.driver_settlements s JOIN audit.audit_events a
        ON a.event_class = 'driver_finance.settlement_creator.posted' AND a.payload->>'resource_id' = s.id::text
     WHERE s.operating_company_id = e.operating_company_id AND s.voided_at IS NULL AND s.status <> 'cancelled'
       AND (a.payload->'expense_ids' ? e.id::text
            OR a.payload->'fuel_transaction_ids' ?| ARRAY(
                 SELECT ft.id::text FROM fuel.fuel_transactions ft
                  WHERE ft.operating_company_id = e.operating_company_id AND ft.voided_at IS NULL
                    AND (ft.id = e.source_fuel_transaction_id
                         OR ft.id::text IN (SELECT p.source_transaction_id::text FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event')
                         OR ft.relay_fuel_transaction_id::text IN (SELECT p.source_transaction_id::text FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event'))))) AS printed`;
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
  for (const d of DOCS) {
    const r = (await db.query(
      `SELECT e.settlement_no, e.source_settlement_ref, l.load_number, (${PRINTED_BY_LIVE}) printed
         FROM accounting.expenses e LEFT JOIN mdata.loads l ON l.id = e.load_id
        WHERE e.operating_company_id = $1::uuid AND e.id = $2::uuid AND e.voided_at IS NULL FOR UPDATE OF e`, [USMCA, d.id])).rows[0];
    if (!r || r.settlement_no !== d.ref || r.load_number !== d.load) throw new Error(`REFUSE ${d.id}: expected ${d.ref} on ${d.load}, found ${JSON.stringify(r)}`);
    if (r.printed) throw new Error(`REFUSE ${d.id}: a live settlement printed this fill`);
    await db.query(`UPDATE accounting.expenses SET settlement_no = NULL, source_settlement_ref = NULL, updated_at = now()
                     WHERE operating_company_id = $1::uuid AND id = $2::uuid AND settlement_no = $3`, [USMCA, d.id, d.ref]);
    await appendCrudAudit(db as never, OWNER, "accounting.expense.relay_fill_settlement_ref_cleared",
      { resource_type: "accounting.expenses", resource_id: d.id, operating_company_id: USMCA, old_settlement_no: r.settlement_no, old_source_settlement_ref: r.source_settlement_ref,
        reason: "Lead 443.203 20:22Z: unprinted fill — no live settlement printed it; names cancelled settlement (ruling #3)" }, "info", "443.203");
    console.log(`${d.id} load ${d.load}: ${r.settlement_no}/${r.source_settlement_ref} → ∅/∅ cleared`);
  }
  const after = (await db.query(`SELECT count(*)::int n FROM accounting.expenses WHERE id = ANY($1::uuid[]) AND settlement_no IS NULL AND source_settlement_ref IS NULL`, [DOCS.map((d) => d.id)])).rows[0].n;
  const tbAfter = await tb();
  console.log(`cleared ${after}/${DOCS.length} · trial balance before ${tbBefore} after ${tbAfter}`);
  if (after !== DOCS.length || tbAfter !== tbBefore || Number(tbAfter) !== 0) throw new Error("NOT VERIFIED");
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
