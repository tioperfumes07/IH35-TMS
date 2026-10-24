/**
 * LEAD 443.319 — DELETE the 11 USMCA driver escrow accounts left behind when their TEST drivers were removed.
 *
 * OWNER: "test recrods shuold be deleted permanently" (2026-10-22 3:36 PM CT); 2026-10-24 12:16 PM CT on these accounts:
 * "it does not matter, just fix." Measured 10-24 (prod, bypass lucia): each holder_id exists in no mdata.drivers row and
 * its audit trail names a coder test driver (CODEX FLEET TEST 20260821, TESTCC3 Driver0822, ZZTEST AUTOACCT PROBE, Juan
 * USMCA-Battery, …); balance $0, 0 escrow_postings, 0 driver_escrow_separations.
 *
 * Refuses unless EVERY target is still: USMCA, holder_type driver, holder absent from mdata.drivers, balance 0, no postings,
 * no separations, and its audit trail names a test driver. Banking (JEs / postings / bank lines / expenses) must be
 * unchanged. Dry run by default; --apply + OWNER_AUTH_ID=AUTH-NNN commits through accounting._purge_rows_cascade
 * (audit.record_deletions).
 */
import pg from "pg";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--apply");
const AUTH = process.env.OWNER_AUTH_ID ?? "";
const REASON = "443.319: escrow account of a deleted TEST driver (coder test record), $0, no postings — owner 10-22 test records deleted permanently; 10-24 just fix";
const TARGETS = [
  "2e0dd6bc-1cd7-4177-9554-c7eaf8feec7e", "90a69c5c-6165-4f14-8f8f-5b1464c49569", "4c74d733-3068-4371-8405-c468ee4ce8c2",
  "d3b3ed21-6794-4c73-bc61-7f00a7ad5e0f", "6fee3b9f-edda-4b1a-98a0-53149a569201", "bf3ced84-c762-4a29-b4ee-ed6a4a8f9d30",
  "c5f248cd-ef8a-49fc-a3aa-3094437fbed5", "019d55ba-0d47-4041-92c6-ee482d091dc3", "fb60061f-795c-466d-980c-66649f5960c9",
  "864a3128-503d-4a5b-b638-2aaeeccf4e0d", "93358b4d-f4ba-465e-bcdb-d528186c45ae",
];
const TEST_NAME_RE = /test|codex|cc3|probe|battery/i;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (COMMIT && !/^AUTH-[0-9]+$/.test(AUTH)) throw new Error("--apply requires OWNER_AUTH_ID=AUTH-NNN");

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const banking = async () => (await c.query(
  `SELECT (SELECT count(*) FROM accounting.journal_entries WHERE operating_company_id=$1::uuid)::int je,
          (SELECT count(*) FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid)::int postings,
          (SELECT count(*) FROM banking.bank_transactions WHERE operating_company_id=$1::uuid)::int bank_txns,
          (SELECT count(*) FROM accounting.expenses WHERE operating_company_id=$1::uuid)::int expenses`, [CO])).rows[0];
const out: Record<string, unknown> = { mode: COMMIT ? `COMMIT ${AUTH}` : "DRY RUN (ROLLBACK)" };
try {
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query("SELECT set_config('app.operating_company_id',$1,true)", [CO]);
  await c.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER_USER_ID]);
  if (AUTH) await c.query("SELECT set_config('app.purge_auth_id',$1,true)", [AUTH]);
  const pre = (await c.query(
    `SELECT ea.id::text, ea.holder_type, ea.holder_id::text,
            EXISTS (SELECT 1 FROM mdata.drivers d WHERE d.id = ea.holder_id) AS holder_exists,
            COALESCE((SELECT vd.balance_cents FROM driver_finance.v_driver_escrow_balance vd WHERE vd.escrow_account_id = ea.id), 0)::bigint AS balance_cents,
            (SELECT count(*) FROM accounting.escrow_postings p WHERE p.escrow_account_id = ea.id)::int AS postings,
            (SELECT count(*) FROM driver_finance.driver_escrow_separations s WHERE s.escrow_account_id = ea.id)::int AS separations,
            (SELECT string_agg(DISTINCT concat_ws(' ', ae.payload->>'first_name', ae.payload->>'last_name'), ' | ')
               FROM audit.audit_events ae WHERE ae.event_class = 'mdata.drivers.created' AND ae.payload::text LIKE '%' || ea.holder_id::text || '%') AS test_name
       FROM accounting.escrow_accounts ea WHERE ea.id = ANY($1::uuid[]) AND ea.operating_company_id = $2::uuid`,
    [TARGETS, CO])).rows;
  out.pre_check = pre;
  if (pre.length !== TARGETS.length) throw new Error(`expected ${TARGETS.length} accounts, found ${pre.length}`);
  for (const r of pre) {
    if (r.holder_type !== "driver") throw new Error(`${r.id}: holder_type ${r.holder_type}`);
    if (r.holder_exists) throw new Error(`${r.id}: holder driver exists — not an orphan; refusing`);
    if (Number(r.balance_cents) !== 0) throw new Error(`${r.id}: balance ${r.balance_cents} — never delete an escrow with a balance`);
    if (r.postings || r.separations) throw new Error(`${r.id}: has postings/separations — refusing`);
    if (!TEST_NAME_RE.test(String(r.test_name ?? ""))) throw new Error(`${r.id}: audit name "${r.test_name}" is not a test driver — refusing`);
  }
  const b0 = await banking();
  if (COMMIT) {
    await c.query(`INSERT INTO _system.purge_authorized_rows (auth_id, table_name, row_pk, reason)
                   SELECT $1, 'accounting.escrow_accounts', unnest($2::text[]), $3 ON CONFLICT (auth_id, table_name, row_pk) DO NOTHING`, [AUTH, TARGETS, REASON]);
    await c.query(`SELECT accounting._purge_rows_cascade('accounting','escrow_accounts',$1::uuid[],$2::uuid,$3,$4::uuid,$5)`,
      [TARGETS, CO, AUTH, OWNER_USER_ID, REASON]);
    const left = Number((await c.query(`SELECT count(*) n FROM accounting.escrow_accounts WHERE id = ANY($1::uuid[])`, [TARGETS])).rows[0].n);
    if (left) throw new Error(`${left} still present after purge`);
    out.remaining = 0;
    out.deletions_recorded = Number((await c.query(`SELECT count(*) n FROM audit.record_deletions WHERE auth_id = $1`, [AUTH])).rows[0].n);
  }
  const b1 = await banking();
  out.banking_before = b0; out.banking_after = b1;
  if (JSON.stringify(b0) !== JSON.stringify(b1)) throw new Error("BANKING CHANGED — refusing");
  await c.query(COMMIT ? "COMMIT" : "ROLLBACK");
  out.status = COMMIT ? "COMMITTED" : "DRY_RUN_ROLLED_BACK";
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  out.status = "ROLLED_BACK"; out.error = (e as Error).message;
  console.log(JSON.stringify(out, null, 2)); await c.end(); process.exit(1);
}
console.log(JSON.stringify(out, null, 2));
await c.end();
