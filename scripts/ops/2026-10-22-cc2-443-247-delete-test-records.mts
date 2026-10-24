/**
 * LEAD 443.247 (CC-2) — PERMANENTLY DELETE THE PROVABLY TEST RECORDS FROM USMCA.
 * OWNER, verbatim 2026-10-22 3:36 PM CT: "test recrods shuold be deleted permanently".
 *
 * WHAT IS DELETED: exactly the rows in scripts/ops/data/2026-10-22-443-247-test-record-ids.json (table -> ids), and
 * nothing else. The list was built from a full USMCA sweep (every table with operating_company_id; markers TEST /
 * SAMPLE / CODEX / CC3- / CASCADE / LIVE-GATE / ZZ-SAMPLE / "TEST DATA" / TESTMT / FIXTURE, or is_sample_data), then
 * every candidate was checked by hand: anything a real load, settlement, bill, invoice, bank line or driver points to,
 * anything Samsara-sourced, and anything not PROVABLY test was taken OFF the list and put on the owner question list
 * (kept in the Lead channel, not here — it names real people). The list holds ids only.
 *
 * HOW: the ONE purge engine, accounting._purge_rows_cascade (SECURITY DEFINER), under the owner-listed arm (ARM L):
 *   1. every listed row is written to _system.purge_authorized_rows for the AUTH (the append-only / WORM triggers admit
 *      a DELETE only for a row listed there — 202615410200, 202616170700);
 *   2. the engine deletes children first (FK-discovered) and writes ONE audit.record_deletions row per deleted row:
 *      who (owner user id + role), when, the owner quote as reason, and the full row as row_data. No soft-delete flag.
 * REFUSES (the whole run rolls back) when:
 *   - a listed row belongs to another company (TRANSPORTATION / TRUCKING are never touched);
 *   - any row OUTSIDE the list references a listed row — the engine would delete or detach it (closure check);
 *   - the USMCA trial balance or posting count moves (no listed row carries GL; TB must be 0 before and after);
 *   - the engine deletes a different number of listed rows than the list holds (beyond rows already gone).
 * Modes: default DRY RUN (rolled back) · --fork-commit (assertNotProduction) · --apply (assertIsIntendedProduction).
 * Usage: OWNER_AUTH_ID=AUTH-451 DATABASE_URL=<target> node --import tsx scripts/ops/2026-10-22-cc2-443-247-delete-test-records.mts [--fork-commit | --apply]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const OWNER_QUOTE = 'LEAD 443.247 · OWNER 2026-10-22 3:36 PM CT: "test recrods shuold be deleted permanently" — provably test/sample USMCA row';
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
const AUTH_ID = (process.env.OWNER_AUTH_ID ?? "").trim();
if (!/^AUTH-\d+$/.test(AUTH_ID)) throw new Error("OWNER_AUTH_ID=AUTH-<n> is required (the OPEN owner authorization this delete runs under).");
// verify-owner-authorization: LEAD 443.247 — owner 2026-10-22 3:36 PM CT "test recrods shuold be deleted permanently".
if (APPLY) execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });

const data = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/ops/data/2026-10-22-443-247-test-record-ids.json"), "utf8"));
const rows: Record<string, string[]> = data.rows;
const listed = new Map(Object.entries(rows).map(([t, ids]) => [t, new Set(ids)]));
const isListed = (t: string, id: string) => listed.get(t)?.has(id) ?? false;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
if (APPLY) await assertIsIntendedProduction(c as never, { label: "443.247 delete test records" });
else if (FORK) await assertNotProduction(c as never, { label: "443.247 delete test records (fork)" });
await c.query("BEGIN");
await c.query("SET LOCAL ROLE neondb_owner");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SET LOCAL lock_timeout = '5s'");
await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);

const tb = async () =>
  (
    await c.query<{ net: string; n: string }>(
      `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS net, count(*)::text AS n
         FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`,
      [USMCA]
    )
  ).rows[0];
const tbBefore = await tb();
if (tbBefore.net !== "0") throw new Error(`REFUSED: USMCA trial balance is ${tbBefore.net} before the run (must be 0)`);

// LEAD 443.253 #3 — rows the owner's rule KEEPS but whose test residue must go (real people / real money are never test).
// Each is a one-column correction, asserted against its measured value first, with one audit event per row.
// `done` = the corrected state: a rerun finds the row already corrected and skips it (idempotent), never refuses.
const CORRECTIONS: Array<{ table: string; id: string; set: string; where: string; done: string; why: string }> = [
  // the real driver keeps his row; the TEST visa placeholder is cleared (empty = amber "missing", never a blocker)
  { table: "mdata.drivers", id: "49427973-e93e-4ea7-a2eb-eb9eefa7f331", set: "visa_number = NULL", where: "visa_number = 'TEST-124567890'", done: "visa_number IS NULL", why: "TEST visa-number placeholder on a real driver cleared" },
  // a real state value: keep it, drop the test description
  { table: "catalogs.expensive_states", id: "a390b9d2-88f8-4699-bb04-527acdbe7736", set: "description = NULL", where: "description ~ 'TEST'", done: "description IS NULL", why: "test description removed from a real state value" },
  // a real person's identity documents: keep the files (linked to that driver), drop the test label
  ...["7f304725-b8c8-4b03-88e6-1371e522d46c", "17d9064d-27e2-4935-878a-ac89aacbcff3", "b0cb79aa-4296-4c0a-9f4e-e1d555dc1b93"].map((id) => ({
    table: "docs.files", id, set: "description = regexp_replace(description, '^SAMPLE/TEST BATTERY - ', '')", where: "description LIKE 'SAMPLE/TEST BATTERY - %'", done: "description NOT LIKE 'SAMPLE/TEST BATTERY - %'",
    why: "test label removed from a real identity document (kept, linked to its driver)",
  })),
];
const FARO_VENDOR_ID = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4";

const problems: string[] = [];
const present: Record<string, string[]> = {};
const pkOf = async (t: string) =>
  (await c.query<{ a: string }>(`SELECT a.attname AS a FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = $1::regclass AND i.indisprimary`, [t])).rows[0]?.a ?? "id";
const pendingCorrections: typeof CORRECTIONS = [];
for (const k of CORRECTIONS) {
  const r = await c.query(`SELECT 1 FROM ${k.table} WHERE id = $1::uuid AND operating_company_id = $2::uuid AND ${k.where}`, [k.id, USMCA]);
  if (r.rowCount) { pendingCorrections.push(k); continue; }
  const done = await c.query(`SELECT 1 FROM ${k.table} WHERE id = $1::uuid AND operating_company_id = $2::uuid AND ${k.done}`, [k.id, USMCA]);
  if (!done.rowCount) problems.push(`${k.table} ${k.id}: neither in its measured state (${k.where}) nor already corrected (${k.done}) — nothing corrected`);
}
for (const [t, ids] of Object.entries(rows)) {
  const [s, n] = t.split(".");
  const hasCompany = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = 'operating_company_id'`, [s, n])).rowCount;
  const pk = await pkOf(t);
  const r = await c.query<{ id: string; co: string | null }>(
    `SELECT ${pk}::text AS id, ${hasCompany ? "operating_company_id::text" : "NULL::text"} AS co FROM ${t} WHERE ${pk}::text = ANY($1::text[])`,
    [ids]
  );
  for (const x of r.rows) if (x.co && x.co !== USMCA) problems.push(`${t} ${x.id} belongs to company ${x.co} — USMCA only`);
  present[t] = r.rows.map((x) => x.id);
}

// Closure: every row that references a listed row through a foreign key must itself be listed (or be a no-id child of
// a listed row, which the engine removes by its FK). Anything else would be deleted or detached by the engine — refuse.
const fks = (
  await c.query<{ child: string; col: string; parent: string; has_id: boolean }>(
    `SELECT cn.nspname || '.' || cl.relname AS child, ca.attname AS col, pn.nspname || '.' || pl.relname AS parent,
            EXISTS (SELECT 1 FROM pg_attribute ia WHERE ia.attrelid = cl.oid AND ia.attname = 'id' AND ia.attnum > 0 AND NOT ia.attisdropped) AS has_id
       FROM pg_constraint k
       JOIN pg_class cl ON cl.oid = k.conrelid JOIN pg_namespace cn ON cn.oid = cl.relnamespace
       JOIN pg_class pl ON pl.oid = k.confrelid JOIN pg_namespace pn ON pn.oid = pl.relnamespace
       JOIN pg_attribute pa ON pa.attrelid = k.confrelid AND pa.attname = 'id'
       JOIN LATERAL (SELECT k.conkey[i] AS an FROM generate_subscripts(k.confkey, 1) i WHERE k.confkey[i] = pa.attnum LIMIT 1) m ON true
       JOIN pg_attribute ca ON ca.attrelid = k.conrelid AND ca.attnum = m.an
      WHERE k.contype = 'f' AND ca.atttypid = 'uuid'::regtype`
  )
).rows;
const noIdChildren: string[] = [];
for (const fk of fks) {
  const ids = present[fk.parent];
  if (!ids?.length) continue;
  if (fk.has_id) {
    const r = await c.query<{ id: string }>(`SELECT id::text AS id FROM ${fk.child} WHERE ${fk.col} = ANY($1::uuid[])`, [ids]);
    for (const x of r.rows) if (!isListed(fk.child, x.id)) problems.push(`${fk.child}.${fk.col} row ${x.id} references a listed ${fk.parent} row but is not on the list`);
  } else {
    // a child keyed by another primary key (e.g. "uuid") is a row the engine removes too: it must be listed by that key.
    const realPk = (await c.query<{ a: string }>(`SELECT a.attname AS a FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = $1::regclass AND i.indisprimary`, [fk.child])).rows[0]?.a;
    if (realPk) {
      const r = await c.query<{ id: string }>(`SELECT ${realPk}::text AS id FROM ${fk.child} WHERE ${fk.col} = ANY($1::uuid[])`, [ids]);
      for (const x of r.rows) if (!isListed(fk.child, x.id)) problems.push(`${fk.child}.${fk.col} row ${x.id} references a listed ${fk.parent} row but is not on the list`);
    } else {
      const r = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${fk.child} WHERE ${fk.col} = ANY($1::uuid[])`, [ids]);
      if (r.rows[0].n !== "0") noIdChildren.push(`${fk.child}.${fk.col} ${r.rows[0].n} row(s) under listed ${fk.parent}`);
    }
  }
}
if (problems.length) {
  await c.query("ROLLBACK");
  await c.end();
  console.error(`REFUSED — ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

// List every row for the AUTH (ARM L), then run the one engine table by table.
for (const [t, ids] of Object.entries(present)) {
  for (const id of ids) {
    await c.query(
      `INSERT INTO _system.purge_authorized_rows (auth_id, table_name, row_pk, reason) VALUES ($1, $2, $3, $4) ON CONFLICT (auth_id, table_name, row_pk) DO NOTHING`,
      [AUTH_ID, t, id, OWNER_QUOTE]
    );
  }
}
await c.query("SELECT set_config('app.purge_auth_id', $1, true)", [AUTH_ID]);

// Corrections (443.253 #3) before the deletes: one audit event per row (rows already corrected are skipped).
for (const k of pendingCorrections) {
  const r = await c.query(`UPDATE ${k.table} SET ${k.set} WHERE id = $1::uuid AND operating_company_id = $2::uuid AND ${k.where}`, [k.id, USMCA]);
  if (r.rowCount !== 1) throw new Error(`REFUSED: correction ${k.table} ${k.id} changed ${r.rowCount} rows`);
  await c.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
    "owner_test_residue_corrected_443_253", "info", JSON.stringify({ table: k.table, id: k.id, change: k.set, why: k.why, order: OWNER_QUOTE, auth_id: AUTH_ID }), OWNER_USER, "LEAD 443.253",
  ]);
}
// Faro Factoring: its only classification was a TEST row (deleted below); its real class is a factoring company.
const factoringType = (
  await c.query<{ id: string }>(
    `WITH ins AS (
       INSERT INTO catalogs.vendor_types (operating_company_id, vendor_type_name, vendor_type_code, code, display_name, description, is_system, is_active, sort_order, created_by_user_id)
       SELECT $1::uuid, 'Factoring Company', 'FACTORING', 'FACTORING', 'Factoring Company', 'Buys the company''s customer invoices (factoring)', false, true, 60, $2::uuid
        WHERE NOT EXISTS (SELECT 1 FROM catalogs.vendor_types WHERE operating_company_id = $1::uuid AND code = 'FACTORING')
       RETURNING id::text)
     SELECT id FROM ins UNION ALL SELECT id::text FROM catalogs.vendor_types WHERE operating_company_id = $1::uuid AND code = 'FACTORING'`,
    [USMCA, OWNER_USER]
  )
).rows[0].id;
const faro = await c.query(
  `UPDATE mdata.vendors SET vendor_type = 'Factoring Company', vendor_type_id = $3::uuid, updated_at = now(), updated_by_user_id = $4::uuid
    WHERE id = $1::uuid AND operating_company_id = $2::uuid AND vendor_type = 'Other'`,
  [FARO_VENDOR_ID, USMCA, factoringType, OWNER_USER]
);
const faroDone = faro.rowCount === 0 && ((await c.query(
  `SELECT 1 FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid AND vendor_type = 'Factoring Company' AND vendor_type_id = $3::uuid`,
  [FARO_VENDOR_ID, USMCA, factoringType])).rowCount ?? 0) === 1; // a rerun: already corrected — skipped, no second audit event
if (faro.rowCount !== 1 && !faroDone) throw new Error("REFUSED: Faro Factoring was neither the measured 'Other' vendor type nor already corrected");
if (faro.rowCount === 1) await c.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
  "owner_test_residue_corrected_443_253", "info",
  JSON.stringify({ table: "mdata.vendors", id: FARO_VENDOR_ID, change: "vendor_type Other -> Factoring Company", vendor_type_id: factoringType, why: "its only classification was a TEST row; real class = factoring company (Lead 443.253 #3)", order: OWNER_QUOTE, auth_id: AUTH_ID }),
  OWNER_USER, "LEAD 443.253",
]);

// Listed rows that point at EACH OTHER (accident report <-> claim, claim <-> lawsuit) form loops the engine's recursion
// cannot leave (depth limit). Only a link from one LISTED row to another LISTED row, on a nullable column, is cleared;
// every cleared value is written to one audit event BEFORE the first delete, so the record of the links survives.
const unlinked: Array<{ table: string; id: string; column: string; was: string }> = [];
for (const fk of fks) {
  const childIds = present[fk.child];
  const parentIds = present[fk.parent];
  if (!childIds?.length || !parentIds?.length || !fk.has_id) continue;
  const nn = (await c.query(`SELECT a.attnotnull FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attname = $2`, [fk.child, fk.col])).rows[0]?.attnotnull;
  if (nn) continue;
  const hit = await c.query<{ id: string; was: string }>(
    `SELECT id::text AS id, ${fk.col}::text AS was FROM ${fk.child} WHERE id::text = ANY($1::text[]) AND ${fk.col}::text = ANY($2::text[]) AND ${fk.child === fk.parent ? `${fk.col}::text <> id::text` : "true"}`,
    [childIds, parentIds]
  );
  if (!hit.rowCount || fk.child === fk.parent) continue;
  // a loop only: the parent row points back at this child row through some FK
  const back = fks.filter((b) => b.child === fk.parent && b.parent === fk.child && b.has_id);
  const looped: Array<{ id: string; was: string }> = [];
  for (const x of hit.rows) {
    for (const b of back) {
      const r = await c.query(`SELECT 1 FROM ${b.child} WHERE id::text = $1 AND ${b.col}::text = $2`, [x.was, x.id]);
      if (r.rowCount) { looped.push(x); break; }
    }
  }
  if (!looped.length) continue;
  await c.query(`UPDATE ${fk.child} SET ${fk.col} = NULL WHERE id::text = ANY($1::text[])`, [looped.map((x) => x.id)]);
  for (const x of looped) unlinked.push({ table: fk.child, id: x.id, column: fk.col, was: x.was });
}
await c.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
  "owner_delete_test_records_443_247",
  "warning",
  JSON.stringify({ order: OWNER_QUOTE, auth_id: AUTH_ID, company: USMCA, listed_rows: Object.values(present).reduce((a, x) => a + x.length, 0), links_between_listed_rows_cleared: unlinked }),
  OWNER_USER,
  "LEAD 443.247",
]);
const counts: Array<{ table: string; listed: number; present: number; after: number }> = [];
let engineTotal = 0;
// The engine recurses with uuid[] ids; legal.matter_events and legal.contract_audit_log key on bigint, so their listed
// rows (children of listed matters / contracts) go first, through the engine's own statement shape: DELETE ... RETURNING
// into audit.record_deletions, one row each, same route / auth / reason / actor. Still listed-row-gated by ARM L.
// the engine keys on a uuid column named "id"; any other key (bigint id, a pk named "uuid") goes through the same
// DELETE ... RETURNING -> audit.record_deletions shape here, keyed on the table's real primary key.
const idType = async (t: string) =>
  (await c.query<{ ty: string }>(`SELECT format_type(a.atttypid, a.atttypmod) AS ty FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attname = 'id'`, [t])).rows[0]?.ty;
const nonUuid = new Set<string>();
for (const [t, ids] of Object.entries(present)) {
  const pk = await pkOf(t);
  if (!ids.length || (pk === "id" && (await idType(t)) === "uuid")) continue;
  nonUuid.add(t);
  const r = await c.query(
    `WITH d AS (DELETE FROM ${t} WHERE ${pk}::text = ANY($1::text[]) RETURNING *)
     INSERT INTO audit.record_deletions (operating_company_id, deletion_route, auth_id, table_name, row_pk, reason, row_data, deleted_by_user_id)
     SELECT $2::uuid, 'auth_purge', $3::text, $4::text, to_jsonb(d.*) ->> '${pk}', $5::text, to_jsonb(d.*), $6::uuid FROM d`,
    [ids, USMCA, AUTH_ID, t, OWNER_QUOTE, OWNER_USER]
  );
  engineTotal += r.rowCount ?? 0;
}
for (const [t, ids] of Object.entries(present)) {
  if (!ids.length || nonUuid.has(t)) continue;
  const [s, n] = t.split(".");
  const r = await c.query<{ n: string }>(
    `SELECT accounting._purge_rows_cascade($1, $2, $3::uuid[], $4::uuid, $5, $6::uuid, $7)::text AS n`,
    [s, n, ids, USMCA, AUTH_ID, OWNER_USER, OWNER_QUOTE]
  );
  engineTotal += Number(r.rows[0].n);
}
for (const [t, ids] of Object.entries(rows)) {
  const after = (await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t} WHERE ${await pkOf(t)}::text = ANY($1::text[])`, [ids])).rows[0].n;
  counts.push({ table: t, listed: ids.length, present: present[t].length, after: Number(after) });
}
const left = counts.filter((x) => x.after > 0);
const presentTotal = counts.reduce((a, x) => a + x.present, 0);
const audited = (
  await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM audit.record_deletions WHERE auth_id = $1 AND operating_company_id = $2::uuid`, [AUTH_ID, USMCA])
).rows[0].n;
const tbAfter = await tb();
// every row the engine removed, by table, against the list — an UNLISTED row removed by the cascade is named here.
const deletedByTable = (await c.query<{ t: string; n: string }>(
  `SELECT table_name AS t, count(*)::text AS n FROM audit.record_deletions WHERE auth_id = $1 AND operating_company_id = $2::uuid GROUP BY 1 ORDER BY 1`,
  [AUTH_ID, USMCA])).rows.map((r) => ({ table: r.t, deleted: Number(r.n), listed: rows[r.t]?.length ?? 0 }));
// LEAD 443.247 scope: AUTH-451 covers EXACTLY the listed rows — any row the cascade removed beyond the list refuses the run.
if (deletedByTable.some((x) => x.deleted > x.listed)) {
  await c.query("ROLLBACK");
  throw new Error(`REFUSED — the engine removed rows that are not on the list: ${JSON.stringify(deletedByTable.filter((x) => x.deleted > x.listed))}`);
}
const out = {
  auth: AUTH_ID,
  listed_rows: counts.reduce((a, x) => a + x.listed, 0),
  present_rows: presentTotal,
  engine_deleted: engineTotal,
  unlisted_deleted: deletedByTable.filter((x) => x.deleted > x.listed),
  audit_rows: Number(audited),
  no_id_children: noIdChildren,
  left_after: left,
  tb_before: tbBefore,
  tb_after: tbAfter,
  per_table: counts,
};
console.log(JSON.stringify(out, null, 1));
const bad: string[] = [];
if (left.length) bad.push(`${left.length} table(s) still hold listed rows`);
if (tbAfter.net !== "0" || tbAfter.n !== tbBefore.n) bad.push(`trial balance moved: ${tbBefore.net}/${tbBefore.n} -> ${tbAfter.net}/${tbAfter.n}`);
if (Number(audited) < engineTotal) bad.push(`audit rows ${audited} < engine-deleted ${engineTotal}`);
if (engineTotal < presentTotal) bad.push(`engine deleted ${engineTotal} < listed rows present ${presentTotal}`);
if (bad.length) {
  await c.query("ROLLBACK");
  await c.end();
  console.error(`REFUSED — ${bad.join("; ")}`);
  process.exit(1);
}
if (APPLY || FORK) {
  await c.query("COMMIT");
  console.log(APPLY ? "APPLIED — COMMITTED" : "FORK COMMITTED");
} else {
  await c.query("ROLLBACK");
  console.log("DRY RUN — ROLLED BACK");
}
await c.end();
