#!/usr/bin/env node
/**
 * faro-vendor-dedupe-diagnostic — READ-ONLY (owner decision #7).
 *
 * Faro Factoring exists twice in mdata.vendors: a canonical QBO-linked row (id ~3585f27e…) and a duplicate
 * (id ~6dd1f7f5…). Decision #7: keep the canonical row, merge any terms from the duplicate, REPOINT every
 * FK that references the duplicate to the canonical row, then VOID (never delete) the duplicate.
 *
 * This script CHANGES NOTHING. It runs inside a READ ONLY transaction and ROLLs BACK. It exists so the exact
 * merge/repoint/void plan is built from the LIVE foreign-key graph — not guessed — before Jorge executes it
 * by hand (§1.5/§1.6: prod data moves are owner-only). It:
 *   1. prints current_database() + server address (so you can prove which DB you're on),
 *   2. resolves both Faro vendor rows (by id-prefix + name), showing the columns that matter for a merge,
 *   3. enumerates EVERY foreign key in the database that references mdata.vendors,
 *   4. counts, per referencing (table.column), how many rows currently point at the DUPLICATE.
 *
 * Usage (owner, against a gated read connection — NEVER commit a prod URL):
 *   DATABASE_URL=<read-conn> node scripts/faro-vendor-dedupe-diagnostic.mjs \
 *     [--canonical <uuid>] [--dup <uuid>]
 * If ids are omitted it matches id::text LIKE '3585f27e%' / '6dd1f7f5%' AND vendor_name ILIKE '%faro%'.
 *
 * Gate-neutral: this is a .mjs diagnostic (not a .sql migration) per the hold-merge-gate rule.
 */
import pg from "pg";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

const CANONICAL = arg("canonical"); // full uuid, optional
const DUP = arg("dup"); // full uuid, optional
const CANON_PREFIX = "3585f27e";
const DUP_PREFIX = "6dd1f7f5";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set. Provide a gated READ connection (never a committed prod URL).");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();
  // Safety proof: which database + host are we actually on?
  const who = await client.query(
    `SELECT current_database() AS db, inet_server_addr()::text AS host, current_user AS usr`,
  );
  console.log("=== connection ===");
  console.table(who.rows);

  await client.query("BEGIN");
  await client.query("SET TRANSACTION READ ONLY");
  try {
    // 1. Resolve both Faro rows.
    const canonWhere = CANONICAL ? `id = $1::uuid` : `id::text LIKE '${CANON_PREFIX}%' AND vendor_name ILIKE '%faro%'`;
    const dupWhere = DUP ? `id = $1::uuid` : `id::text LIKE '${DUP_PREFIX}%' AND vendor_name ILIKE '%faro%'`;
    const cols = `id::text, vendor_name, qbo_vendor_id, operating_company_id::text, is_active, deactivated_at::text, created_at::text`;

    const canon = await client.query(`SELECT ${cols} FROM mdata.vendors WHERE ${canonWhere}`, CANONICAL ? [CANONICAL] : []);
    const dup = await client.query(`SELECT ${cols} FROM mdata.vendors WHERE ${dupWhere}`, DUP ? [DUP] : []);
    console.log("\n=== canonical Faro row (keep) ===");
    console.table(canon.rows);
    console.log("=== duplicate Faro row (merge terms → void) ===");
    console.table(dup.rows);

    if (dup.rows.length !== 1) {
      console.log(`\n! Expected exactly 1 duplicate row, found ${dup.rows.length}. Resolve ids explicitly with --dup before proceeding.`);
    }
    const dupId = dup.rows[0]?.id ?? null;

    // 2. Every FK referencing mdata.vendors.
    const fks = await client.query(`
      SELECT
        con.conname                                   AS constraint_name,
        (ns.nspname || '.' || rel.relname)            AS referencing_table,
        att.attname                                   AS referencing_column
      FROM pg_constraint con
      JOIN pg_class rel        ON rel.oid = con.conrelid
      JOIN pg_namespace ns     ON ns.oid = rel.relnamespace
      JOIN pg_class fref       ON fref.oid = con.confrelid
      JOIN pg_namespace frefns ON frefns.oid = fref.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      WHERE con.contype = 'f'
        AND frefns.nspname = 'mdata'
        AND fref.relname = 'vendors'
      ORDER BY referencing_table, referencing_column
    `);
    console.log(`\n=== ${fks.rowCount} foreign key(s) reference mdata.vendors ===`);
    console.table(fks.rows);

    // 3. Per referencing column, how many rows point at the DUPLICATE (these are what the merge repoints).
    if (dupId) {
      console.log("\n=== rows referencing the DUPLICATE (to be repointed to canonical) ===");
      const counts = [];
      for (const fk of fks.rows) {
        const sql = `SELECT count(*)::int AS n FROM ${fk.referencing_table} WHERE ${fk.referencing_column} = $1::uuid`;
        try {
          const r = await client.query(sql, [dupId]);
          counts.push({ table: fk.referencing_table, column: fk.referencing_column, rows_on_duplicate: r.rows[0].n });
        } catch (e) {
          counts.push({ table: fk.referencing_table, column: fk.referencing_column, rows_on_duplicate: `ERR: ${String(e.message).slice(0, 60)}` });
        }
      }
      console.table(counts);
      const total = counts.reduce((s, c) => s + (typeof c.rows_on_duplicate === "number" ? c.rows_on_duplicate : 0), 0);
      console.log(`\nTotal rows to repoint from duplicate → canonical: ${total}`);
      console.log("Repoint order = the tables above; then set the duplicate is_active=false + deactivated_at=now() (VOID, never DELETE).");
    }
  } finally {
    await client.query("ROLLBACK");
  }
  await client.end();
  console.log("\n(READ ONLY — transaction rolled back, nothing changed.)");
}

main().catch((e) => {
  console.error("diagnostic failed:", e.message);
  process.exit(1);
});
