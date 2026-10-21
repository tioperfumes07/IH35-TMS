// LEAD 443.203 (19:52Z, 5845) — Relay-fill expense documents a LIVE settlement posted (its own driver_finance.settlement_creator
// .posted audit, expense_ids) whose reference names another settlement (the fill's earlier, cancelled settlement: 7 on 5845
// said P-0072, 25 more on 5839–5842) or none. Runs THE engine function (fillRelayFillExpenseSettlementRef, restamp_stale:
// the carrying settlement asks) — never inferred from who holds the load (ruling 443.203 #3).
// --restore: CC-3's first run (#27076 runner) selected by load holder and wrote 5 documents NO live settlement posted (3
// unprinted T170 fills ∅ → 5846, 2 unprinted fills P-0071/P-0080 → 5839/5841) — puts back the exact prior values recorded in
// that run's own audit (old_settlement_no / old_source_settlement_ref; a "filled" event had none), audited.
// Text references only: no JE, trial balance unchanged (verified).
//   default: dry run in one transaction, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.203
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { fillRelayFillExpenseSettlementRef } from "../../apps/backend/src/fuel/fuel-expense-document.service.ts";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
const RESTORE = process.argv.includes("--restore");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.203") throw new Error("--apply requires --auth LEAD-ORDER-443.203");
  // verify-owner-authorization: Lead 443.203 (19:52Z) "engine fix … then run it for the 7" — relayed by the owner's Lead
  // channel; --restore undoes CC-3's own over-selection of 2026-10-21 (ruling 443.203 #3), reported to the Lead.
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.203 relay-fill settlement ref" });
else if (FORK) await assertNotProduction(db, { label: "443.203 relay-fill settlement ref (fork)" });

const POSTED = `
  SELECT DISTINCT x.v AS expense_id, COALESCE(NULLIF(btrim(s.source_document_ref), ''), s.display_id) AS ref, s.display_id
    FROM audit.audit_events a CROSS JOIN LATERAL jsonb_array_elements_text(a.payload->'expense_ids') x(v)
    JOIN driver_finance.driver_settlements s ON s.id::text = a.payload->>'resource_id'
   WHERE a.event_class = 'driver_finance.settlement_creator.posted' AND s.operating_company_id = $1::uuid
     AND s.voided_at IS NULL AND s.status <> 'cancelled'`;
const SELECT = `
  WITH posted AS (${POSTED})
  SELECT e.id::text expense_id, l.load_number, e.settlement_no, e.source_settlement_ref, p.ref, p.display_id
    FROM accounting.expenses e JOIN mdata.vendors v ON v.id = e.vendor_uuid JOIN posted p ON p.expense_id = e.id::text
    LEFT JOIN mdata.loads l ON l.id = e.load_id
   WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND v.vendor_name ~* '^relay( |$)'
     AND (e.settlement_no IS DISTINCT FROM p.ref OR e.source_settlement_ref IS DISTINCT FROM p.ref)
   ORDER BY l.load_number, e.id`;
// The first run's writes on documents no live settlement posted, with the prior values from that run's own audit.
const OVERREACH = `
  WITH posted AS (${POSTED}),
  run AS (
    SELECT DISTINCT ON (a.payload->>'resource_id') a.payload->>'resource_id' AS expense_id, a.event_class, a.payload
      FROM audit.audit_events a
     WHERE a.event_class IN ('accounting.expense.relay_fill_settlement_ref_restamped', 'accounting.expense.relay_fill_settlement_ref_filled')
       AND a.actor_user_uuid = $2::uuid AND a.created_at >= '2026-10-21T19:00:00Z' AND a.created_at < '2026-10-21T21:00:00Z'
       AND a.payload->>'operating_company_id' = $1::text
     ORDER BY a.payload->>'resource_id', a.created_at)
  SELECT r.expense_id, l.load_number, e.settlement_no, e.source_settlement_ref, r.event_class,
         r.payload->>'settlement_no' AS run_no, r.payload->>'old_settlement_no' AS old_no, r.payload->>'old_source_settlement_ref' AS old_ref
    FROM run r JOIN accounting.expenses e ON e.id::text = r.expense_id LEFT JOIN mdata.loads l ON l.id = e.load_id
   WHERE NOT EXISTS (SELECT 1 FROM posted p WHERE p.expense_id = r.expense_id)
     AND e.settlement_no = r.payload->>'settlement_no'
   ORDER BY l.load_number, r.expense_id`;
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
  let expect = 0, done = 0;
  if (RESTORE) {
    const rows = (await db.query(OVERREACH, [USMCA, OWNER])).rows;
    expect += rows.length;
    console.log(`restore ${rows.length}`);
    for (const r of rows) {
      const filled = r.event_class === "accounting.expense.relay_fill_settlement_ref_filled";
      const back = { no: filled ? null : r.old_no, ref: filled ? null : r.old_ref };
      const u = await db.query(
        `UPDATE accounting.expenses SET settlement_no = $3, source_settlement_ref = $4, updated_at = now()
          WHERE operating_company_id = $1::uuid AND id = $2::uuid AND voided_at IS NULL AND settlement_no = $5 RETURNING id`,
        [USMCA, r.expense_id, back.no, back.ref, r.run_no]);
      if (u.rowCount === 1) {
        done++;
        await appendCrudAudit(db as never, OWNER, "accounting.expense.relay_fill_settlement_ref_restored",
          { resource_type: "accounting.expenses", resource_id: r.expense_id, operating_company_id: USMCA, from_settlement_no: r.run_no, settlement_no: back.no, source_settlement_ref: back.ref,
            reason: "443.203 #3: unprinted fill — no live settlement posted this document; CC-3 first run selected by load holder" }, "info", "443.203");
      }
      console.log(`  ${r.expense_id} load ${r.load_number}: ${r.settlement_no} → ${back.no ?? "∅"}/${back.ref ?? "∅"} ${u.rowCount === 1 ? "restored" : "NOT RESTORED"}`);
    }
  }
  const rows = (await db.query(SELECT, [USMCA])).rows;
  expect += rows.length;
  console.log(`restamp ${rows.length}`);
  for (const r of rows) {
    const wrote = await fillRelayFillExpenseSettlementRef(db as never, { operating_company_id: USMCA, expense_id: r.expense_id, settlement_no: r.ref, actor_user_uuid: OWNER, restamp_stale: true });
    console.log(`  ${r.expense_id} load ${r.load_number}: ${r.settlement_no ?? "∅"}/${r.source_settlement_ref ?? "∅"} → ${r.ref} (${r.display_id}) ${wrote ? "written" : "NOT WRITTEN"}`);
    if (wrote) done++;
  }
  const left = (await db.query(SELECT, [USMCA])).rows.length + (RESTORE ? (await db.query(OVERREACH, [USMCA, OWNER])).rows.length : 0);
  const tbAfter = await tb();
  console.log(`written ${done}/${expect} · left ${left} · trial balance before ${tbBefore} after ${tbAfter}`);
  if (done !== expect || left !== 0 || tbAfter !== tbBefore || Number(tbAfter) !== 0) throw new Error("NOT VERIFIED — stop and investigate");
  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await db.query("ROLLBACK");
    console.log("DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.203.");
  }
  ok = true;
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 1000);
}
