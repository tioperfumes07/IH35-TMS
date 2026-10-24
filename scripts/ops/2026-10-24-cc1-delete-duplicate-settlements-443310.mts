/**
 * 443.310 — DELETE the 3 duplicate $0 load-bookended settlements through the purge engine.
 *
 * OWNER ORDER (2026-10-24 10:26 AM CT): "completely deleted yes I follow your recommendation
 * fix the engine." These rows are pure engine artifacts: 0 lines, $0, NULL created_by, created
 * in the same millisecond as a tour-close re-fire. They posted nothing (TB unchanged). Delete,
 * not void.
 *
 * PURGE LAW: USMCA only. Banking (JEs, postings, expenses, bank_transactions) is verified
 * unchanged before COMMIT. Rows flow through accounting._purge_rows_cascade which writes
 * audit.record_deletions. Dry run by default; --apply + OWNER_AUTH_ID=AUTH-NNN to commit.
 *
 * Duplicate settlement IDs (verified prod 2026-10-24, bypass lucia):
 *   6aeb40a5-... P-0123 Carlos Pena     — duplicate of P-0117 (load 13691, closed 10-21)
 *   72e621a6-... P-0124 Jose Vicente    — duplicate of P-0113 (loads 13687+13696)
 *   5c3a9f3c-... P-0125 Angel Sosa      — duplicate of P-0119 (load 13697)
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-24-cc1-delete-duplicate-settlements-443310.mts
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-NNN npx tsx scripts/ops/2026-10-24-cc1-delete-duplicate-settlements-443310.mts --apply
 */
import pg from "pg";

const USMCA_CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--apply");
const AUTH = process.env.OWNER_AUTH_ID ?? "";
const REASON = "443.310: duplicate $0 load-bookended settlement — tour-close engine re-fired on already-settled load; owner order 2026-10-24";

const DUPLICATE_IDS = [
  "6aeb40a5-72bf-402a-a420-0fcaa988a04c", // P-0123 Carlos Pena, created 2026-10-23 21:49:11Z
  "72e621a6-7ae0-438a-bead-479b92c6d397", // P-0124 Jose Vicente, created 2026-10-23 21:49:12Z
  "5c3a9f3c-5d86-4c5b-a42b-46e052ac04bd", // P-0125 Angel Sosa, created 2026-10-24 05:34:04Z
];

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (COMMIT && !/^AUTH-[0-9]+$/.test(AUTH)) {
  throw new Error("--apply requires OWNER_AUTH_ID=AUTH-NNN (docs/bus/OWNER-AUTHORIZATIONS.md)");
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const bankingSnapshot = async () =>
  (await c.query(
    `SELECT
      (SELECT count(*) FROM accounting.journal_entries WHERE operating_company_id = $1::uuid)::int je,
      (SELECT count(*) FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
        WHERE j.operating_company_id = $1::uuid)::int postings,
      (SELECT count(*) FROM banking.bank_transactions WHERE operating_company_id = $1::uuid)::int bank_txns,
      (SELECT count(*) FROM accounting.expenses WHERE operating_company_id = $1::uuid)::int expenses`,
    [USMCA_CO]
  )).rows[0];

const out: Record<string, unknown> = {
  mode: COMMIT ? `COMMIT ${AUTH}` : "DRY RUN (ROLLBACK — pass --apply + OWNER_AUTH_ID=AUTH-NNN to commit)",
};

try {
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA_CO]);
  await c.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER_USER_ID]);
  if (AUTH) await c.query("SELECT set_config('app.purge_auth_id',$1,true)", [AUTH]);

  // Verify each target: must be 0 lines, $0 net_pay, not voided, USMCA
  const preCheck = await c.query(
    `SELECT
       ds.id::text,
       ds.display_id,
       ds.status,
       ds.voided_at,
       ds.net_pay,
       ds.posted_at,
       (SELECT count(*) FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = ds.id AND sl.is_active = true)::int line_count
     FROM driver_finance.driver_settlements ds
     WHERE ds.id = ANY($1::uuid[]) AND ds.operating_company_id = $2::uuid`,
    [DUPLICATE_IDS, USMCA_CO]
  );
  out.pre_check = preCheck.rows;

  for (const row of preCheck.rows) {
    if (Number(row.net_pay ?? 0) !== 0) throw new Error(`settlement ${row.id} has non-zero net_pay=${row.net_pay}; refusing to delete`);
    if (row.posted_at) throw new Error(`settlement ${row.id} has been posted (posted_at=${row.posted_at}); refusing to delete`);
    if (Number(row.line_count) > 0) throw new Error(`settlement ${row.id} has ${row.line_count} active lines; refusing to delete`);
    if (row.voided_at) throw new Error(`settlement ${row.id} is already voided; refusing to delete (void is enough)`);
  }
  if (preCheck.rows.length !== DUPLICATE_IDS.length) {
    throw new Error(`expected 3 settlements, found ${preCheck.rows.length}; some may have already been removed`);
  }

  const bank0 = await bankingSnapshot();

  // Also capture any presettlement_link_suggestions pointing at these settlements
  const sugRes = await c.query(
    `SELECT id::text FROM driver_finance.presettlement_link_suggestions
      WHERE suggested_settlement_id = ANY($1::uuid[]) AND operating_company_id = $2::uuid`,
    [DUPLICATE_IDS, USMCA_CO]
  );
  const sugIds = sugRes.rows.map((r) => r.id as string);
  out.suggestions_to_delete = sugIds.length;

  // audit.audit_events are WORM — leave them in place; do not delete

  if (COMMIT && AUTH) {
    // Register in purge_authorized_rows and cascade-delete
    for (const [table, ids] of [
      ["driver_finance.driver_settlements", DUPLICATE_IDS],
      ["driver_finance.presettlement_link_suggestions", sugIds],
    ] as [string, string[]][]) {
      if (ids.length === 0) continue;
      await c.query(
        `INSERT INTO _system.purge_authorized_rows (auth_id, table_name, row_pk, reason)
         SELECT $1, $2, unnest($3::text[]), $4 ON CONFLICT (auth_id, table_name, row_pk) DO NOTHING`,
        [AUTH, table, ids, REASON]
      );
      const [schema, name] = table.split(".");
      await c.query(
        `SELECT accounting._purge_rows_cascade($1,$2,$3::uuid[],$4::uuid,$5,$6::uuid,$7)`,
        [schema, name, ids, USMCA_CO, AUTH, OWNER_USER_ID, REASON]
      );
    }

    // Verify gone
    const goneCheck = await c.query(
      `SELECT count(*) n FROM driver_finance.driver_settlements WHERE id = ANY($1::uuid[])`,
      [DUPLICATE_IDS]
    );
    const remaining = Number(goneCheck.rows[0].n);
    if (remaining > 0) throw new Error(`${remaining} settlement(s) still present after purge`);
    out.settlements_remaining = 0;
  }

  const bank1 = await bankingSnapshot();
  out.banking_before = bank0;
  out.banking_after = bank1;
  if (JSON.stringify(bank0) !== JSON.stringify(bank1)) {
    throw new Error(`BANKING CHANGED — refusing commit: before=${JSON.stringify(bank0)} after=${JSON.stringify(bank1)}`);
  }
  out.banking_unchanged = true;

  if (COMMIT && AUTH) {
    out.deletions_recorded = Number(
      (await c.query(`SELECT count(*) n FROM audit.record_deletions WHERE auth_id = $1`, [AUTH])).rows[0].n
    );
  }

  await c.query(COMMIT ? "COMMIT" : "ROLLBACK");
  out.status = COMMIT ? "COMMITTED" : "DRY_RUN_ROLLED_BACK";
} catch (e) {
  await c.query("ROLLBACK").catch(() => undefined);
  out.error = (e as Error).message;
  out.status = "ERROR_ROLLED_BACK";
  process.exitCode = 1;
} finally {
  await c.end();
}

console.log(JSON.stringify(out, null, 2));
