/**
 * ROUND 443.9 — PURGE REMNANTS. Removes, through the purge engine, every USMCA row whose parent document (load,
 * invoice, settlement, driver bill, fuel transaction, expense) no longer exists. Owner 2026-10-10: "there should be
 * nothing from before that is why we deleted and purged" · "delete anything related to the purge. Not any banking
 * transactions."
 *
 * ENGINE, NOT AD-HOC SQL. The tables and their "parent is gone" predicates live in usmca-purge-classification.json
 * (ORPHANS) — the same file the purge generator reads, so the guard, this executor and the next purge share one list.
 * Each orphan row is listed in _system.purge_authorized_rows for the owner's AUTH and deleted by
 * accounting._purge_rows_cascade (FK-graph order, hubs detached, audit.record_deletions written per row). WORM
 * triggers still decide permission on every DELETE; no trigger is disabled.
 *
 * LAW: USMCA only. Banking is never touched: the run fails closed if journal entries, postings, bank transactions or
 * expenses change. Dry run by default (ROLLBACK); --commit needs OWNER_AUTH_ID=AUTH-NNN.
 *
 * Usage: DATABASE_URL=… [OWNER_AUTH_ID=AUTH-NNN] npx tsx scripts/purge/purge-orphans-of-purged-documents.mts [--commit]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLASS = JSON.parse(fs.readFileSync(path.join(HERE, "usmca-purge-classification.json"), "utf8"));
const CO: string = CLASS._company_id;
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--commit");
const AUTH = process.env.OWNER_AUTH_ID ?? "";
const REASON = "ROUND 443.9 purge remnants: parent document no longer exists (owner 2026-10-10)";
const ORPHANS: Record<string, { parent: string; where: string; scope?: string }> = Object.fromEntries(
  Object.entries(CLASS.ORPHANS).filter(([k]) => !k.startsWith("_")),
) as never;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (COMMIT && !/^AUTH-[0-9]+$/.test(AUTH)) throw new Error("--commit needs OWNER_AUTH_ID=AUTH-NNN (docs/bus/OWNER-AUTHORIZATIONS.md)");
if (Object.keys(ORPHANS).some((t) => t.startsWith("banking."))) throw new Error("banking is never purged");

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const banking = async () =>
  (await c.query(
    `SELECT (SELECT count(*) FROM accounting.journal_entries WHERE operating_company_id = $1::uuid)::int journal_entries,
            (SELECT count(*) FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid WHERE j.operating_company_id = $1::uuid)::int postings,
            (SELECT count(*) FROM banking.bank_transactions WHERE operating_company_id = $1::uuid)::int bank_transactions,
            (SELECT count(*) FROM accounting.expenses WHERE operating_company_id = $1::uuid)::int expenses`,
    [CO],
  )).rows[0];
const out: Record<string, unknown> = { mode: COMMIT ? `COMMIT ${AUTH}` : "DRY RUN (rolled back)" };
try {
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  await c.query("SELECT set_config('app.operating_company_id', $1, true)", [CO]);
  await c.query("SELECT set_config('app.current_user_id', $1, true)", [OWNER]);
  if (AUTH) await c.query("SELECT set_config('app.purge_auth_id', $1, true)", [AUTH]);
  const bank0 = await banking();
  const rows: Record<string, { before: number; orphans: number; kept: number; after_orphans?: number }> = {};
  // Snapshot every table's orphans first: a generated file is recognised by its dead links, which this run deletes.
  const plan: Array<{ table: string; ids: string[] }> = [];
  for (const [table, def] of Object.entries(ORPHANS)) {
    const total = Number((await c.query(`SELECT count(*) n FROM ${table} t WHERE ${def.scope ?? "t.operating_company_id = $1::uuid"}`, [CO])).rows[0].n);
    const ids = (await c.query(`SELECT t.id::text id FROM ${table} t WHERE ${def.where}`, [CO])).rows.map((r) => r.id as string);
    rows[table] = { before: total, orphans: ids.length, kept: total - ids.length };
    plan.push({ table, ids });
  }
  for (const { table, ids } of plan) {
    if (ids.length === 0 || !AUTH) continue;
    await c.query(
      `INSERT INTO _system.purge_authorized_rows (auth_id, table_name, row_pk, reason)
       SELECT $1, $2, unnest($3::text[]), $4 ON CONFLICT (auth_id, table_name, row_pk) DO NOTHING`,
      [AUTH, table, ids, REASON],
    );
    const [schema, name] = table.split(".");
    await c.query(`SELECT accounting._purge_rows_cascade($1, $2, $3::uuid[], $4::uuid, $5, $6::uuid, $7)`, [schema, name, ids, CO, AUTH, OWNER, REASON]);
  }
  for (const [table, def] of Object.entries(ORPHANS)) {
    rows[table].after_orphans = Number((await c.query(`SELECT count(*) n FROM ${table} t WHERE ${def.where}`, [CO])).rows[0].n);
  }
  const bank1 = await banking();
  out.tables = rows;
  out.banking_before = bank0;
  out.banking_after = bank1;
  if (JSON.stringify(bank0) !== JSON.stringify(bank1)) throw new Error(`banking changed: ${JSON.stringify(bank0)} -> ${JSON.stringify(bank1)}`);
  if (AUTH && Object.values(rows).some((r) => (r.after_orphans ?? 0) > 0)) throw new Error("orphans remain after the engine ran");
  if (AUTH) for (const { table, ids } of plan) if (ids.length) {
    const left = Number((await c.query(`SELECT count(*) n FROM ${table} WHERE id = ANY($1::uuid[])`, [ids])).rows[0].n);
    if (left) throw new Error(`${table}: ${left} planned row(s) still present`);
  }
  out.deletions_recorded = AUTH
    ? Number((await c.query(`SELECT count(*) n FROM audit.record_deletions WHERE auth_id = $1`, [AUTH])).rows[0].n)
    : 0;
  await c.query(COMMIT ? "COMMIT" : "ROLLBACK");
} catch (e) {
  await c.query("ROLLBACK").catch(() => undefined);
  out.error = (e as Error).message;
  process.exitCode = 1;
} finally {
  await c.end();
}
console.log(JSON.stringify(out, null, 1));
