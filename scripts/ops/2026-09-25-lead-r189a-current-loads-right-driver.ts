// R-189A (Lead, 09-25) — six current loads carry the wrong driver/truck and sit on one pre-settlement
// (c50e6c82, source_document_ref '5819') that the R-168 engine call minted. Source of truth: the owner's
// AlwaysTrack export "load history report 09-21-26 without cancelled loads.xlsx" (LOADS 2026-08-07 → 09-22).
// Per load, one transaction, existing engines:
//   driver + unit on mdata.loads (+ dispatch.load_assignment_history row with the trailer, the canonical trailer link)
//   → the driver bill is voided and re-minted for the right driver (ensureDriverBillArtifactsForLoad)
//   → the load moves to its driver's OPEN pre-settlement (reassignLoadToSettlementInClientTx); if the driver has
//     none, one is created WITHOUT a settlement number (createBareSettlementForDocument, source_document_ref NULL —
//     closed doc §10: a pre-settlement carries no AlwaysTrack number until AlwaysTrack settles it)
//   → the emptied '5819' shell is voided (never deleted).
// Load status is NOT changed: all six carry an invoice Faro already purchased (factoring_status advanced).
// DRY_RUN=1 rolls back.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";
import { reassignLoadToSettlementInClientTx } from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DRY = process.env.DRY_RUN === "1";
const TAG = "R-189A";
if (!DRY) { const a = process.env.OWNER_AUTH_ID; if (!a) { console.error("OWNER_AUTH_ID required"); process.exit(1); } execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), a], { stdio: "inherit" }); }
const SHELL = "c50e6c82-efff-4432-a1f5-b1e7edc42dd0";
const PLAN = [ // load, driver, unit, trailer, pickup  (report rows)
  ["13610", "6edcb351-e81b-4bf2-adf7-5eca9eff9137", "19d29860-9753-4376-93c4-dc963cc86483", "5fae4441-6ec3-4599-a5e0-9c14e6f8becf", "2026-09-18"], // Genaro T152 10202
  ["13612", "a32a35c8-7cd5-4368-83f0-35e185092433", "f439def3-05ac-42cf-829b-2b66ecf85a32", "22ca9ef8-e57e-49c6-b590-8bebb15e23d2", "2026-09-18"], // Neftali T176 FB-56210
  ["13613", "61727a46-af2e-4d33-8236-e2d99b737708", "478d9f14-b2fd-4cea-a51e-76ec30c39ec7", "d3aca32f-40fe-40d3-b144-5101e85c1335", "2026-09-18"], // Carlos Pena Carvallo T164 10380
  ["13614", "1ec7654c-1ae9-4f3d-9af6-af9fd4b6bcc9", "82db522d-9efe-4dca-958f-bb931e4a55ca", "93a6f847-557f-462e-a0e6-64905631743b", "2026-09-17"], // Ruben T173 10870
  ["13615", "3e138476-06db-4b08-9ebe-527a5d8c591d", "e15c43f8-3c61-4d1c-be67-05a489c3e622", "2f38c09a-7915-4d83-9557-c523e39df7a6", "2026-09-15"], // Jorge Luis Infante T177 FB-56713
  ["13563", "c864a4bb-a7ff-4373-a5e1-c1590eefe3b7", "ea1b0fe4-1731-49ca-a50a-3363dfc76ae4", "6bde4624-76f5-4f75-84f7-e92a9e8bc5fd", "2026-09-01"], // Rafael Rogelio Rivero T148 10218 (Hawkeye 500.00, Laredo local)
  ["13619", "6edcb351-e81b-4bf2-adf7-5eca9eff9137", "19d29860-9753-4376-93c4-dc963cc86483", "5fae4441-6ec3-4599-a5e0-9c14e6f8becf", "2026-09-22"], // Genaro T152 10202
];
class Rollback extends Error {}
const st: Record<string, any> = { moved: [] as string[] };
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
let ok = false;
try {
  for (const [ln, drv, unit, trl, pickup] of PLAN) {
    const L = (await c.query(`SELECT id::text, assigned_primary_driver_id::text d, assigned_unit_id::text u, presettlement_link_id::text p FROM mdata.loads WHERE operating_company_id=$1 AND load_number=$2`, [USMCA, ln])).rows[0];
    if (!L) throw new Error(`${ln} not found`);
    if (L.p !== SHELL) throw new Error(`${ln} is not on the 5819 shell (on ${L.p})`);
    const prevT = (await c.query(`SELECT new_trailer_id::text t FROM dispatch.load_assignment_history WHERE load_id=$1::uuid ORDER BY assigned_at DESC NULLS LAST, created_at DESC LIMIT 1`, [L.id])).rows[0]?.t ?? null;
    await c.query(`UPDATE mdata.loads SET assigned_primary_driver_id=$2::uuid, assigned_unit_id=$3::uuid, updated_at=now() WHERE id=$1::uuid`, [L.id, drv, unit]);
    await c.query(`INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, previous_driver_id, new_driver_id, previous_unit_id, new_unit_id, previous_trailer_id, new_trailer_id, assigned_by_user_id, assigned_at, reason_code, notes)
       VALUES ($1::uuid,$2::uuid,'manual_reassign',$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9::uuid,now(),'source_document_correction',$10)`,
      [USMCA, L.id, L.d, drv, L.u, unit, prevT, trl, OWNER, `${TAG}: AlwaysTrack load history report 09-21-26 — driver/truck/trailer`]);
    // driver bill: an OPEN, never-posted bill minted on the wrong driver. All six drivers carry the same rate
    // (USMCA standard $0.48/mi, driver_finance.driver_pay_rates, owner directive 2026-08-07), so the amount is
    // unchanged; the engine refuses to re-mint over a voided bill (ACCT-F277), so the bill's driver is corrected.
    const nb = (await c.query(`SELECT id::text, driver_id::text d, gross_amount_cents g, status::text s FROM driver_finance.driver_bills WHERE load_id=$1::uuid AND voided_at IS NULL`, [L.id])).rows;
    if (nb.length !== 1 || nb[0].s !== "open") throw new Error(`${ln}: expected 1 open bill, got ${JSON.stringify(nb)}`);
    const posted = Number((await c.query(`SELECT count(*) n FROM accounting.journal_entry_postings WHERE source_transaction_id::text=$1`, [nb[0].id])).rows[0].n);
    if (posted) throw new Error(`${ln}: bill ${nb[0].id} has ${posted} GL postings — refusing`);
    await c.query(`UPDATE driver_finance.driver_bills SET driver_id=$2::uuid WHERE id=$1::uuid`, [nb[0].id, drv]);
    await appendCrudAudit(c as never, OWNER, "driver_bill.driver_corrected", { bill: nb[0].id, load: ln, from_driver: nb[0].d, to_driver: drv, gross_cents: nb[0].g, round: TAG }, "info", "LEAD-R189A");
    // the driver's own open pre-settlement, else a new one with NO settlement number
    let tgt = (await c.query(`SELECT id::text FROM driver_finance.driver_settlements WHERE operating_company_id=$1 AND driver_id=$2::uuid AND voided_at IS NULL AND status::text='open' AND id<>$3::uuid`, [USMCA, drv, SHELL])).rows;
    let tid: string;
    if (tgt.length === 1) tid = tgt[0].id;
    else if (tgt.length === 0) {
      // Owner 06:35 PM CT: pre-settlement numbers are EDITABLE; the app no longer continues AlwaysTrack's sequence
      // (that is what minted the fake 5819). A new pre-settlement takes our own P-series number, editable, and
      // carries NO source_document_ref until AlwaysTrack settles it. Same INSERT shape as createBareSettlementForDocument.
      const mx = Number((await c.query(`SELECT COALESCE(max(substring(display_id from '^P-([0-9]+)$')::int),0) n FROM driver_finance.driver_settlements WHERE operating_company_id=$1`, [USMCA])).rows[0].n);
      const disp = `P-${String(mx + 1).padStart(4, "0")}`;
      const ins = await c.query(`INSERT INTO driver_finance.driver_settlements (operating_company_id, driver_id, status, display_id, period_start, period_end, trip_started_at, trip_closed_at, settlement_model, created_by_user_id, is_sample_data)
         VALUES ($1::uuid,$2::uuid,'open',$3,$4::date,$4::date,$4::date,NULL,'load_bookended',$5::uuid,false) RETURNING id::text`, [USMCA, drv, disp, pickup, OWNER]);
      await appendCrudAudit(c as never, OWNER, "driver_finance.presettlement.created", { settlement_id: ins.rows[0].id, display_id: disp, driver: drv, load: ln, round: TAG }, "info", "LEAD-R189A");
      const made = { settlement_id: ins.rows[0].id, display_id: disp };
      tid = made.settlement_id; st.created = [...(st.created ?? []), `${made.display_id} for ${ln}`];
    } else throw new Error(`${ln}: driver has ${tgt.length} open pre-settlements`);
    const r: any = await reassignLoadToSettlementInClientTx(c as never, { operating_company_id: USMCA, load_id: L.id, target_settlement_id: tid, actor_user_id: OWNER, reason: `${TAG}: load belongs to the report's driver` });
    if (r.kind !== "ok") throw new Error(`${ln}: reassign ${r.kind}`);
    await c.query(`UPDATE driver_finance.driver_bills SET settled_in_settlement_id=NULL WHERE id=$1::uuid AND settled_in_settlement_id IS NOT NULL AND settled_in_settlement_id<>$2::uuid`, [nb[0].id, tid]);
    await appendCrudAudit(c as never, OWNER, "load.corrected_to_source_driver", { load: ln, from_driver: L.d, to_driver: drv, unit, trailer: trl, settlement: tid, round: TAG }, "info", "LEAD-R189A");
    st.moved.push(`${ln} -> driver ${drv.slice(0, 8)} bill ${(Number(nb[0].g) / 100).toFixed(2)} presettlement ${tid.slice(0, 8)}`);
  }
  // the other two minted pre-settlement numbers (5817, 5818: open, not an AlwaysTrack document) take the P-series
  // too, so AlwaysTrack's real 5817/5818 can never collide with them. Editable per the owner.
  const minted = (await c.query(`SELECT id::text, display_id, source_document_ref FROM driver_finance.driver_settlements WHERE operating_company_id=$1 AND voided_at IS NULL AND status::text='open' AND source_document_ref ~ '^[0-9]{4}$' AND source_document_ref::int > 5816 AND id<>$2::uuid`, [USMCA, SHELL])).rows;
  for (const m of minted) {
    const mx = Number((await c.query(`SELECT COALESCE(max(substring(display_id from '^P-([0-9]+)$')::int),0) n FROM driver_finance.driver_settlements WHERE operating_company_id=$1`, [USMCA])).rows[0].n);
    const disp = `P-${String(mx + 1).padStart(4, "0")}`;
    await c.query(`UPDATE driver_finance.driver_settlements SET display_id=$2, source_document_ref=NULL, updated_at=now() WHERE id=$1::uuid`, [m.id, disp]);
    await appendCrudAudit(c as never, OWNER, "driver_finance.presettlement.renumbered", { settlement_id: m.id, from: m.display_id, to: disp, reason: "minted AlwaysTrack-sequence number on an open pre-settlement; owner 09-25: editable own series", round: TAG }, "info", "LEAD-R189A");
    st.renumbered = [...(st.renumbered ?? []), `${m.display_id} -> ${disp}`];
  }
  const left = Number((await c.query(`SELECT count(*) n FROM mdata.loads WHERE presettlement_link_id=$1::uuid`, [SHELL])).rows[0].n);
  if (left !== 0) throw new Error(`shell still has ${left} loads`);
  await c.query(`UPDATE driver_finance.driver_settlements SET voided_at=now(), void_reason=$2, voided_by_user_id=$3::uuid, status='cancelled' WHERE id=$1::uuid`, [SHELL, `${TAG}: minted pre-settlement number 5819 (engine call in R-168); its 6 loads belong to 5 other drivers — emptied and voided`, OWNER]);
  await appendCrudAudit(c as never, OWNER, "driver_settlement.voided_minted_shell", { settlement_id: SHELL, source_document_ref: "5819", round: TAG }, "warning", "LEAD-R189A");
  const tb = Number((await c.query(`SELECT COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0) net FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid WHERE je.operating_company_id=$1 AND je.status='posted'`, [USMCA])).rows[0].net);
  st.tb_net_cents = tb; if (tb !== 0) throw new Error(`TB ${tb}`);
  await c.query("SET CONSTRAINTS ALL IMMEDIATE");
  if (DRY) throw new Rollback("dry");
  await c.query("COMMIT"); ok = true; st.result = "COMMITTED";
} catch (err) {
  st.result = err instanceof Rollback ? "DRY_RUN rolled back" : "FAILED — rolled back: " + (err as Error).message;
} finally { if (!ok) await c.query("ROLLBACK").catch(() => {}); await c.end(); }
console.log(JSON.stringify(st, null, 1));
process.exit(String(st.result).startsWith("FAILED") ? 1 : 0);
