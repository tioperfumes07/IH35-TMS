/**
 * LEAD 443.358 round 2 — the 23 test / sample / demo rows round 1 had to keep, plus ALL their history, plus the
 * deletion log of both rounds. OWNER 10-25-2026 (AUTH-469, 2:12 PM): "completely deleted, no history nothing, i want them
 * permanently deleted now"; asked once at 2:4x PM ("delete the 23 test rows, their write-once history and the 246
 * deletion-log rows … no trace remains") → answered "Yes, delete all of it".
 *
 * KEPT on purpose (never targeted here):
 *   - the owner's own documents (INE / Licencia Federal / Medical Exam — real, described "SAMPLE/TEST BATTERY"),
 *   - safety event c539bf5c "T120 mechanical breakdown – I-10 Baytown" (real-looking operational event),
 *   - TEST-TRUCK-1 (e6223cbf): a draft bill of a FROZEN company (b49a737b) references it — frozen entities are never touched.
 *
 * HOW: one transaction. The specific append-only DELETE-blocking triggers are disabled, each target goes through
 * accounting._purge_rows_cascade (FK-discovered children) with its explicit test children removed first, the books
 * (TB / A/R / A/P / bank lines) must be identical after every target, then the AUTH-469 deletion-log + authorization
 * rows are removed and EVERY trigger is re-enabled before COMMIT. Any failure → ROLLBACK, nothing changes.
 * Default: dry run (everything, then ROLLBACK). --apply commits.
 */
import pg from "pg";
import { execFileSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");
const AUTH = "AUTH-469";
const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REASON = "AUTH-469 round 2: owner 10-25 'completely deleted, no history nothing' — coder test/sample/demo record";

execFileSync("node", ["scripts/verify-owner-authorization.mjs", AUTH], { stdio: "inherit" });

const BLOCK_TRIGGERS: Array<[string, string]> = [
  ["hos.duty_status_events", "trg_block_hos_duty_status_events_delete"],
  ["legal.contract_audit_log", "trg_block_contract_audit_log_delete"],
  ["safety.driver_leave_audit_log", "trg_block_driver_leave_audit_delete"],
  ["safety.dvir_defect_severity_tags", "trg_dvir_severity_tags_block_delete"],
  ["safety.dvir_defects", "trg_safety_dvir_defects_block_delete"],
  ["safety.safety_event_notes", "trg_safety_event_notes_block_delete"],
  ["telematics.vehicle_driver_assignments", "trg_block_vehicle_driver_assignments_delete"],
  ["audit.record_deletions", "trg_worm_refuse_delete"],
];

// [schema.table, id, explicit test children to remove first: [table, fk column]]
const TARGETS: Array<[string, string, Array<[string, string]>]> = [
  // first: the test driver's escrow liability account (its escrow_accounts row blocks the driver delete)
  ["catalogs.accounts", "4a8a9e1e-a10c-4147-97f2-991f8f1620b2", [["accounting.escrow_accounts", "liability_account_id"]]],
  ["safety.safety_events", "9e5a26fc-3659-470d-81c5-8ba8d0d3035a", [["safety.safety_event_notes", "safety_event_id"]]],
  ["safety.safety_events", "49c981a7-b23e-475a-9dc0-2e5a47be85a4", [["safety.safety_event_notes", "safety_event_id"]]],
  ["safety.safety_events", "6cb97218-2992-4cca-b714-578d5388346d", [["safety.safety_event_notes", "safety_event_id"]]],
  ["safety.safety_events", "cf777109-e9ab-4a9b-bdbf-8cc97b111f1d", [["safety.safety_event_notes", "safety_event_id"]]],
  ["safety.incidents", "c282dbbe-be1c-49d7-8d21-1d631882dcb3", [["safety.damage_continuity_chains", "incident_id"]]],
  ["safety.dvir_defects", "7b3c5cb4-5a7a-48af-93ad-2d4e5a7639af", [["safety.dvir_defect_severity_tags", "dvir_defect_id"]]],
  ["legal.contract_instances", "2d6e3f93-e999-44b0-87c3-e7135d22f6b8", [["legal.contract_audit_log", "contract_instance_id"]]],
  ["docs.files", "cf805a9c-6a71-46c3-9e08-c82a05cad738", [["docs.file_links", "file_id"]]],
  ["mdata.drivers", "ff62fc9b-7258-4d89-9778-43d2e1a02d4a", [["hos.duty_status_events", "driver_id"]]],
  ["mdata.drivers", "5870031c-8519-4904-8b2d-5b50220e6fb8", [["hos.duty_status_events", "driver_id"]]],
  ["mdata.drivers", "db37af23-ea20-493b-8321-a26a30205250", [["telematics.vehicle_driver_assignments", "driver_id"], ["hos.duty_status_events", "driver_id"]]],
  ["mdata.drivers", "9f35cf21-01bb-467e-bc31-e96bb9c60dfe", [["safety.driver_leave_audit_log", "driver_id"], ["hos.duty_status_events", "driver_id"]]],
  ["mdata.drivers", "bfc906db-b778-48c9-944a-e59c5ffb73c5", [["hos.duty_status_events", "driver_id"]]],
  ["mdata.equipment", "651ecf9f-90b8-4d8d-9c72-e1984e87b651", [["maintenance.reefer_specs", "equipment_id"]]],
  ["mdata.units", "5eaa448d-ba7d-4f60-b507-a4c7b77cea93", [["safety.dvir_defects", "unit_id"]]],
  ["mdata.units", "630edccb-7445-4a88-978f-c1848e6c0820", [["maintenance.pm_schedules", "unit_id"]]],
  ["mdata.units", "08d86e86-62ba-444b-afce-c369930fb393", [["maintenance.pm_schedules", "unit_id"]]],
  ["mdata.units", "af684f0c-43ab-480a-a7d5-6c405cfa15ff", [["maintenance.pm_schedules", "unit_id"]]],
  ["mdata.units", "05f48916-3bb3-4049-bc19-1b9a57353a5e", [["telematics.vehicle_driver_assignments", "unit_id"]]],
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = async (sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows;
const colExists = async (t: string, col: string) => {
  const [s, n] = t.split(".");
  return (await q(`SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`, [s, n, col])).length > 0;
};
const books = async () =>
  q(`SELECT a.account_number, SUM(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)::bigint bal
       FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id
      WHERE p.operating_company_id=$1::uuid GROUP BY 1 ORDER BY 1`, [CO]).then(async (tb) => ({
    tb,
    bank: (await q(`SELECT count(*)::int n FROM banking.bank_transactions WHERE operating_company_id=$1::uuid`, [CO]))[0].n,
  }));

const out: Record<string, unknown> = { mode: APPLY ? "APPLY" : "DRY RUN (rolled back)" };
const deleted: Record<string, number> = {};
try {
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query("SELECT set_config('app.operating_company_id',$1,true)", [CO]);
  for (const [t, g] of BLOCK_TRIGGERS) await c.query(`ALTER TABLE ${t} DISABLE TRIGGER ${g}`);
  const b0 = await books();
  // Any further append-only table the FK cascade reaches is unblocked on demand (its DELETE-block trigger only), then
  // re-enabled with the rest below. A refusal for any OTHER reason still aborts the whole run.
  const extraDisabled: Array<[string, string]> = [];
  const unblock = async (msg: string) => {
    const m = /([a-z_]+\.[a-z_0-9]+) is append-only/.exec(msg);
    if (!m) return false;
    const [s2, t2] = m[1].split(".");
    const trg = await q(`SELECT tg.tgname FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                          WHERE n.nspname=$1 AND c.relname=$2 AND NOT tg.tgisinternal AND tg.tgenabled<>'D' AND tg.tgname ~ '(delete|worm)'`, [s2, t2]);
    if (!trg.length) return false;
    for (const r of trg) { await c.query(`ALTER TABLE ${m[1]} DISABLE TRIGGER ${r.tgname}`); extraDisabled.push([m[1], r.tgname]); }
    return true;
  };
  for (const [qual, id, kids] of TARGETS) {
    const [sch, tbl] = qual.split(".");
    if (!(await q(`SELECT 1 FROM ${qual} WHERE id=$1::uuid`, [id])).length) { deleted[`${qual} (already gone)`] = (deleted[`${qual} (already gone)`] ?? 0) + 1; continue; }
    for (const [kt, kc] of kids) {
      if (!(await colExists(kt, kc))) continue; // the FK cascade below removes it
      const n = (await c.query(`DELETE FROM ${kt} WHERE ${kc}=$1::uuid`, [id])).rowCount ?? 0;
      deleted[kt] = (deleted[kt] ?? 0) + n;
    }
    await c.query(`INSERT INTO _system.purge_authorized_rows (auth_id, table_name, row_pk, reason) VALUES ($1,$2,$3,$4)
                   ON CONFLICT (auth_id, table_name, row_pk) DO NOTHING`, [AUTH, qual, id, REASON]);
    for (let attempt = 0; ; attempt++) {
      await c.query("SAVEPOINT tgt");
      try {
        await q(`SELECT accounting._purge_rows_cascade($1,$2,ARRAY[$3::uuid],$4::uuid,$5,$6::uuid,$7) n`, [sch, tbl, id, CO, AUTH, OWNER_USER_ID, REASON]);
        await c.query("RELEASE SAVEPOINT tgt");
        break;
      } catch (e) {
        await c.query("ROLLBACK TO SAVEPOINT tgt");
        if (attempt > 12 || !(await unblock(String((e as Error).message)))) throw e;
      }
    }
    deleted[qual] = (deleted[qual] ?? 0) + 1;
    const b1 = await books();
    if (JSON.stringify(b1) !== JSON.stringify(b0)) throw new Error(`books moved after ${qual} ${id}`);
  }
  // da_program_enrollments has no uuid id: remove the test enrollment rows of drivers that no longer exist.
  if (await colExists("safety.da_program_enrollments", "driver_id")) {
    deleted["safety.da_program_enrollments"] = (await c.query(
      `DELETE FROM safety.da_program_enrollments e WHERE NOT EXISTS (SELECT 1 FROM mdata.drivers d WHERE d.id = e.driver_id)`)).rowCount ?? 0;
  }
  // NO HISTORY: the deletion log and the authorization rows of both rounds.
  out.deletion_log_removed = (await c.query(`DELETE FROM audit.record_deletions WHERE auth_id=$1`, [AUTH])).rowCount;
  out.purge_authorizations_removed = (await c.query(`DELETE FROM _system.purge_authorized_rows WHERE auth_id=$1`, [AUTH])).rowCount;
  for (const [t, g] of [...BLOCK_TRIGGERS, ...extraDisabled]) await c.query(`ALTER TABLE ${t} ENABLE TRIGGER ${g}`);
  out.extra_unblocked = extraDisabled.map(([t, g]) => `${t}:${g}`);
  const disabled = await q(`SELECT n.nspname||'.'||c.relname t, tg.tgname FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE tg.tgenabled='D' AND tg.tgname = ANY($1)`, [[...BLOCK_TRIGGERS, ...extraDisabled].map((x) => x[1])]);
  if (disabled.length) throw new Error(`triggers still disabled: ${JSON.stringify(disabled)}`);
  const b2 = await books();
  out.books_identical = JSON.stringify(b2) === JSON.stringify(b0);
  out.bank_lines = b2.bank;
  out.deleted = deleted;
  if (!out.books_identical) throw new Error("books moved");
  await c.query(APPLY ? "COMMIT" : "ROLLBACK");
  out.status = APPLY ? "COMMITTED" : "DRY_RUN_ROLLED_BACK";
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  out.status = "ROLLED_BACK_ERROR";
  out.error = String((e as Error).message);
  out.deleted_before_error = deleted;
}
console.log(JSON.stringify(out, null, 2));
await c.end();
process.exit(out.status === "ROLLED_BACK_ERROR" ? 1 : 0);
