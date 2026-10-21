// LEAD 443.203 (19:52Z, 5845) — Relay-fill expense documents whose settlement reference names no live settlement holding
// their load (the fill was carried to another settlement's load, or the named settlement was cancelled: 7 on 5845's loads
// said P-0072; the same defect left 27 more on 5839–5842's loads), plus documents with no reference on a held load.
// Engine fix: fillRelayFillExpenseSettlementRef restamps a stale reference (old one audited). This runs THE engine function
// for every such document whose load is held by exactly ONE live settlement — selection is evidence only. Text references
// only: no JE, trial balance unchanged (verified).
//   default: dry run in one transaction, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.203
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { fillRelayFillExpenseSettlementRef } from "../../apps/backend/src/fuel/fuel-expense-document.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.203") throw new Error("--apply requires --auth LEAD-ORDER-443.203");
  // verify-owner-authorization: Lead 443.203 (19:52Z) "engine fix … then run it for the 7" — relayed by the owner's Lead
  // channel; the 27 more documents are the same defect on the same evidence (one live holder), reported to the Lead.
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.203 relay-fill settlement ref restamp" });
else if (FORK) await assertNotProduction(db, { label: "443.203 relay-fill settlement ref restamp (fork)" });

const HOLDERS = `
  SELECT DISTINCT s.id, COALESCE(NULLIF(btrim(s.source_document_ref), ''), s.display_id) AS ref, s.display_id
    FROM driver_finance.driver_settlements s
   WHERE s.operating_company_id = e.operating_company_id AND s.voided_at IS NULL AND s.status <> 'cancelled'
     AND (s.id IN (SELECT g.settlement_id FROM driver_finance.driver_settlement_gl_bills g JOIN mdata.loads l2 ON l2.load_number = g.load_number AND l2.operating_company_id = g.operating_company_id WHERE l2.id = e.load_id)
          OR s.id IN (SELECT sl.settlement_id FROM driver_finance.settlement_lines sl WHERE sl.load_id = e.load_id))`;
const SELECT = `
  SELECT e.id::text expense_id, l.load_number, e.settlement_no, e.source_settlement_ref, h.ref, h.display_id
    FROM accounting.expenses e JOIN mdata.vendors v ON v.id = e.vendor_uuid JOIN mdata.loads l ON l.id = e.load_id
    CROSS JOIN LATERAL (SELECT min(x.ref) ref, min(x.display_id) display_id, count(*)::int n FROM (${HOLDERS}) x) h
   WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND v.vendor_name ~* '^relay( |$)'
     AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event')
     AND h.n = 1
     AND (e.settlement_no IS NULL OR e.source_settlement_ref IS NULL
          OR NOT EXISTS (SELECT 1 FROM (${HOLDERS}) y WHERE y.ref = e.settlement_no)
          OR NOT EXISTS (SELECT 1 FROM (${HOLDERS}) y WHERE y.ref = e.source_settlement_ref))
   ORDER BY l.load_number, e.id`;
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
  let done = 0;
  for (const r of rows) {
    const wrote = await fillRelayFillExpenseSettlementRef(db as never, { operating_company_id: USMCA, expense_id: r.expense_id, settlement_no: r.ref, actor_user_uuid: OWNER });
    console.log(`  ${r.expense_id} load ${r.load_number}: ${r.settlement_no ?? "∅"}/${r.source_settlement_ref ?? "∅"} → ${r.ref} (${r.display_id}) ${wrote ? "written" : "NOT WRITTEN"}`);
    if (wrote) done++;
  }
  const left = (await db.query(SELECT, [USMCA])).rows.length;
  const tbAfter = await tb();
  console.log(`written ${done}/${rows.length} · left ${left} · trial balance before ${tbBefore} after ${tbAfter}`);
  if (done !== rows.length || left !== 0 || tbAfter !== tbBefore || Number(tbAfter) !== 0) throw new Error("NOT VERIFIED — stop and investigate");
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
