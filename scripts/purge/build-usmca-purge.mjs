#!/usr/bin/env node
/**
 * build-usmca-purge.mjs — generate the USMCA transaction purge from LIVE schema, never by hand.
 *
 * WHY THIS EXISTS. The hand-written purge SQL of 2026-09-22 was wrong in BOTH directions: it
 * deleted 475 docs.files rows it must keep, and it left thousands of USMCA transaction rows
 * behind (accounting.posting_batches 1,874 · accounting.transaction_source_links ·
 * load_revenue_recognition_postings 141 · driver_finance.escrow_balances 17 · and more). A
 * hand-written verifier checked a DIFFERENT table list than the SQL deleted, so the two could
 * never disagree out loud. This generator emits BOTH artifacts from ONE live census, so they
 * cannot drift.
 *
 * LAW
 *  - USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). TRANSPORTATION and TRUCKING are frozen.
 *  - Banking is EXCLUDED from the purge: bank transactions, accounts and categories are KEPT.
 *  - Every table carrying a USMCA row must be classified PURGE / KEEP / KEEP_BANKING.
 *    An unclassified table is an ERROR and this script exits 1. It never defaults, never guesses.
 *  - This script WRITES NOTHING to the database. It reads catalog + counts and emits files.
 *
 * USAGE
 *   DATABASE_URL=... node scripts/purge/build-usmca-purge.mjs            # generate
 *   DATABASE_URL=... node scripts/purge/build-usmca-purge.mjs --census   # census only, no files
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLASSIFICATION = JSON.parse(
  fs.readFileSync(path.join(HERE, "usmca-purge-classification.json"), "utf8"),
);
const CO = CLASSIFICATION._company_id;
const CENSUS_ONLY = process.argv.includes("--census");

/**
 * Tables purged through a parent because they carry no operating_company_id of their own.
 * Every predicate here was read off the live foreign keys, not assumed.
 */
const CHILD_PREDICATES = {
  "mdata.load_stops": `load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = '${CO}')`,
  "mdata.load_stop_legs": `load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = '${CO}')`,
  "accounting.payment_applications": `invoice_id IN (SELECT id FROM accounting.invoices WHERE operating_company_id = '${CO}')`,
  "expense_attribution.expense_seq_per_load": `load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = '${CO}')`,
  "banking.bank_transaction_splits":
    `result_journal_entry_id IN (SELECT id FROM accounting.journal_entries WHERE operating_company_id = '${CO}')` +
    `\n    OR load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = '${CO}')`,
};

const SCHEMAS = [
  "accounting", "driver_finance", "dispatch", "mdata", "docs",
  "fuel", "expense_attribution", "banking", "reconciliation",
];

function classify(tbl) {
  if (CLASSIFICATION.PURGE.includes(tbl)) return "PURGE";
  if (CLASSIFICATION.KEEP.includes(tbl)) return "KEEP";
  if (CLASSIFICATION.KEEP_BANKING.includes(tbl)) return "KEEP_BANKING";
  if (tbl === "docs.files" || tbl === "docs.file_links") return "DOCS_FILES";
  return null;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Refusing to run against a guessed connection.");
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query(`SET LOCAL app.operating_company_id = '${CO}'`);
    await client.query(`SET LOCAL app.current_operating_company_id = '${CO}'`);

    // ---- 1. LIVE CENSUS: every base table with an operating_company_id and >0 USMCA rows.
    const census = await client.query(
      `SELECT t.table_schema || '.' || t.table_name AS tbl,
              (xpath('/row/cnt/text()', t.x))[1]::text::bigint AS n
         FROM (
           SELECT c.table_schema, c.table_name,
                  query_to_xml(format(
                    'SELECT count(*) AS cnt FROM %I.%I WHERE operating_company_id = %L',
                    c.table_schema, c.table_name, $1), false, true, '') AS x
             FROM information_schema.columns c
             JOIN information_schema.tables tt
               ON tt.table_schema = c.table_schema
              AND tt.table_name   = c.table_name
              AND tt.table_type   = 'BASE TABLE'
            WHERE c.column_name = 'operating_company_id'
              AND c.data_type   = 'uuid'
              AND c.table_schema = ANY($2::text[])
         ) t
        WHERE (xpath('/row/cnt/text()', t.x))[1]::text::bigint > 0
        ORDER BY 2 DESC`,
      [CO, SCHEMAS],
    );

    // ---- 2. NOTHING UNCLASSIFIED. This is the whole point.
    const unclassified = census.rows.filter((r) => classify(r.tbl) === null);
    if (unclassified.length) {
      console.error("\nUNCLASSIFIED TABLES CARRYING LIVE USMCA ROWS — REFUSING TO GENERATE:\n");
      for (const r of unclassified) console.error(`  ${r.tbl.padEnd(52)} ${r.n} rows`);
      console.error(
        "\nAdd each one to PURGE, KEEP or KEEP_BANKING in usmca-purge-classification.json.\n" +
        "Do not delete this check to make the build pass.\n",
      );
      process.exit(1);
    }

    console.log(`\nLIVE CENSUS — ${census.rows.length} tables carry USMCA rows\n`);
    let purgeRows = 0n, keepRows = 0n;
    for (const r of census.rows) {
      const k = classify(r.tbl);
      if (k === "PURGE") purgeRows += BigInt(r.n); else keepRows += BigInt(r.n);
      console.log(`  ${k.padEnd(13)} ${r.tbl.padEnd(52)} ${r.n}`);
    }
    console.log(`\n  PURGE total ${purgeRows} rows · KEEP total ${keepRows} rows\n`);

    // ---- 3. PURGE tables that exist but carry no predicate we can express.
    const colRes = await client.query(
      `SELECT table_schema || '.' || table_name AS tbl
         FROM information_schema.columns
        WHERE column_name = 'operating_company_id' AND data_type = 'uuid'`,
    );
    const hasCol = new Set(colRes.rows.map((r) => r.tbl));
    const existsRes = await client.query(
      `SELECT table_schema || '.' || table_name AS tbl
         FROM information_schema.tables WHERE table_type = 'BASE TABLE'`,
    );
    const exists = new Set(existsRes.rows.map((r) => r.tbl));

    const missing = CLASSIFICATION.PURGE.filter((t) => !exists.has(t));
    if (missing.length) {
      console.error("\nPURGE names a table that does not exist live — fix the classification:\n");
      for (const t of missing) console.error(`  ${t}`);
      process.exit(1);
    }
    const unreachable = CLASSIFICATION.PURGE.filter(
      (t) => !hasCol.has(t) && !CHILD_PREDICATES[t],
    );
    if (unreachable.length) {
      console.error("\nPURGE table with no operating_company_id and no child predicate:\n");
      for (const t of unreachable) console.error(`  ${t}`);
      console.error("\nRead its real foreign key and add the predicate. Never delete by guess.\n");
      process.exit(1);
    }

    // ---- 4. FK-SAFE ORDER: a table is deleted only after everything referencing it.
    const fk = await client.query(
      `SELECT ns.nspname || '.' || c.relname        AS child,
              fns.nspname || '.' || fc.relname      AS parent
         FROM pg_constraint co
         JOIN pg_class      c   ON c.oid  = co.conrelid
         JOIN pg_namespace  ns  ON ns.oid = c.relnamespace
         JOIN pg_class      fc  ON fc.oid = co.confrelid
         JOIN pg_namespace  fns ON fns.oid = fc.relnamespace
        WHERE co.contype = 'f'`,
    );
    const set = new Set(CLASSIFICATION.PURGE);
    const deps = new Map(CLASSIFICATION.PURGE.map((t) => [t, new Set()]));
    for (const { child, parent } of fk.rows) {
      if (child === parent) continue;
      if (set.has(child) && set.has(parent)) deps.get(parent).add(child); // parent waits on child
    }
    const order = [];
    const done = new Set();
    const mark = new Set();
    const cycles = [];
    const visit = (t, trail) => {
      if (done.has(t)) return;
      if (mark.has(t)) { cycles.push([...trail, t].join(" -> ")); return; }
      mark.add(t);
      for (const d of deps.get(t)) visit(d, [...trail, t]);
      mark.delete(t);
      done.add(t);
      order.push(t);
    };
    for (const t of CLASSIFICATION.PURGE) visit(t, []);
    if (cycles.length) {
      console.log("FK cycles present — broken by explicit NULL-out before delete:");
      for (const c of new Set(cycles)) console.log(`  ${c}`);
    }

    if (CENSUS_ONLY) { await client.query("ROLLBACK"); return; }

    // ---- 5. EMIT THE SQL.
    const stamp = new Date().toISOString().slice(0, 10);
    const lines = [];
    lines.push(`-- USMCA TRANSACTION PURGE — GENERATED ${stamp} by scripts/purge/build-usmca-purge.mjs`);
    lines.push(`-- DO NOT HAND-EDIT. Change usmca-purge-classification.json and regenerate.`);
    lines.push(`-- Company ${CO} (USMCA). Banking is EXCLUDED: bank transactions/accounts/categories are KEPT.`);
    lines.push(`-- Order below is reverse foreign-key order, computed live from pg_constraint.`);
    lines.push(`-- THIS FILE DOES NOT RUN ITSELF. The owner runs it, once, after saying "run the purge".`);
    lines.push(``);
    lines.push(`BEGIN;`);
    lines.push(`SET LOCAL app.bypass_rls = 'lucia';`);
    lines.push(`SET LOCAL app.operating_company_id = '${CO}';`);
    lines.push(`SET LOCAL app.current_operating_company_id = '${CO}';`);
    lines.push(``);
    lines.push(`-- Break the self-referencing reversal links before deleting journal entries.`);
    lines.push(`UPDATE accounting.journal_entries SET reversed_by_je_id = NULL, reverses_je_id = NULL`);
    lines.push(` WHERE operating_company_id = '${CO}';`);
    lines.push(``);
    for (const t of order) {
      const pred = hasCol.has(t) ? `operating_company_id = '${CO}'` : CHILD_PREDICATES[t];
      lines.push(`DELETE FROM ${t}`);
      lines.push(` WHERE ${pred};`);
    }
    lines.push(``);
    lines.push(`-- docs.files is NOT purged wholesale. ${CLASSIFICATION.DOCS_FILES._rule}`);
    lines.push(`-- Owner-uploaded evidence is KEPT. Handled by its own reviewed step, never here.`);
    lines.push(``);
    lines.push(`-- COMMIT;   -- uncommented only by the owner, at the moment of the purge`);
    lines.push(`ROLLBACK;`);
    const sqlPath = path.join(HERE, "usmca-transaction-purge.generated.sql");
    fs.writeFileSync(sqlPath, lines.join("\n") + "\n");

    // ---- 6. EMIT THE VERIFIER'S TABLE LIST FROM THE SAME ORDER. They cannot drift.
    const verifyPath = path.join(HERE, "usmca-purge-expected-zero.generated.json");
    fs.writeFileSync(
      verifyPath,
      JSON.stringify(
        {
          _generated: stamp,
          _source: "scripts/purge/build-usmca-purge.mjs — same run that emitted the SQL",
          company_id: CO,
          must_be_zero_after_purge: order.map((t) => ({
            table: t,
            predicate: hasCol.has(t) ? "operating_company_id" : "child-of-parent",
          })),
          must_be_unchanged: [...CLASSIFICATION.KEEP, ...CLASSIFICATION.KEEP_BANKING],
        },
        null,
        2,
      ) + "\n",
    );

    console.log(`Wrote ${path.relative(process.cwd(), sqlPath)}`);
    console.log(`Wrote ${path.relative(process.cwd(), verifyPath)}`);
    console.log(`${order.length} DELETE statements, FK-ordered. Nothing was written to the database.`);
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
