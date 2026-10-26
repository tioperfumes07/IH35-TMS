/**
 * CC-3 ENG-26 + ENG-27 — backfill load_id on existing USMCA journal_entry_postings.
 *
 * ROOT CAUSE:
 *  ENG-26: 991 postings without load_id — factoring (155), settlement (105), fuel (27),
 *          expense (24), invoice (4). Posted before migration 202615350500 added the
 *          load_id column + accounting.posting_source_load_id() resolver.
 *  ENG-27: 458 bank_categorization postings created before 2026-10-17 without a load.
 *          banking.bank_transactions.categorization_load_id was NULL at post time;
 *          if users have since updated categorizations WITH a load, those can be backfilled.
 *          If not, load_id stays NULL — by design for pre-load categorizations.
 *
 * FIX: run accounting.posting_source_load_id(type, id, line, reversal_of) against every
 *      USMCA posting with load_id IS NULL. Update rows where the resolver returns a load.
 *      Fuel (27) / expense (24) / invoice (4) rows carry NULL by design (doc has no load).
 *
 * DRY RUN by default (prints counts by type). --apply commits.
 * AUTH: AUTH-ENG26-BACKFILL-POSTING-LOADS (owner must issue before --apply).
 */
import pg from "pg";
import path from "node:path";
import { execFileSync } from "node:child_process";

const USMCA_CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-ENG26-BACKFILL-POSTING-LOADS";

if (APPLY) {
  const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
  } catch {
    process.exit(1);
  }
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

try {
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query(`SET app.operating_company_id = '${USMCA_CO}'`);

  // Count total postings without load_id, grouped by source type.
  const countRes = await c.query<{ source_transaction_type: string; n: string }>(`
    SELECT source_transaction_type, count(*) AS n
      FROM accounting.journal_entry_postings
     WHERE operating_company_id = $1::uuid
       AND load_id IS NULL
     GROUP BY source_transaction_type
     ORDER BY count(*) DESC
  `, [USMCA_CO]);

  const total = countRes.rows.reduce((s, r) => s + Number(r.n), 0);
  console.log(`Total USMCA postings with load_id IS NULL: ${total}`);
  for (const r of countRes.rows) {
    console.log(`  ${r.source_transaction_type}: ${r.n}`);
  }

  // Find postings where the resolver now returns a load.
  const resolveRes = await c.query<{ id: string; source_transaction_type: string; resolved_load_id: string }>(`
    SELECT p.id::text,
           p.source_transaction_type,
           accounting.posting_source_load_id(
             p.source_transaction_type,
             p.source_transaction_id::text,
             p.source_transaction_line_id::text,
             p.reversal_of_line_id
           )::text AS resolved_load_id
      FROM accounting.journal_entry_postings p
     WHERE p.operating_company_id = $1::uuid
       AND p.load_id IS NULL
  `, [USMCA_CO]);

  const resolvable = resolveRes.rows.filter(r => r.resolved_load_id != null);

  // Group resolvable by type.
  const byType: Record<string, number> = {};
  for (const r of resolvable) {
    byType[r.source_transaction_type] = (byType[r.source_transaction_type] ?? 0) + 1;
  }
  console.log(`\nResolvable (posting_source_load_id returns a load): ${resolvable.length}`);
  for (const [type, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${n}`);
  }

  const unresolvable = total - resolvable.length;
  console.log(`Unresolvable (load_id stays NULL by design): ${unresolvable}`);

  if (resolvable.length === 0) {
    console.log("Nothing to backfill.");
    await c.query("ROLLBACK");
    process.exit(0);
  }

  if (!APPLY) {
    await c.query("ROLLBACK");
    console.log("\nDRY RUN (no writes) — re-run with --apply after AUTH-ENG26-BACKFILL-POSTING-LOADS is issued.");
    process.exit(0);
  }

  // Apply: UPDATE in batches of 200.
  let updated = 0;
  const BATCH = 200;
  for (let i = 0; i < resolvable.length; i += BATCH) {
    const batch = resolvable.slice(i, i + BATCH);
    // Each update sets load_id to the pre-resolved value (avoids re-running the function per row).
    // Use a VALUES list for the batch. $1 = opco; ids and load_ids follow in pairs.
    const values: unknown[] = [USMCA_CO];
    const pairs = batch.map((r) => {
      const idIdx = values.push(r.id);
      const loadIdx = values.push(r.resolved_load_id);
      return `($${idIdx}::uuid, $${loadIdx}::uuid)`;
    });
    const sql = `
      UPDATE accounting.journal_entry_postings p
         SET load_id = v.load_id
        FROM (VALUES ${pairs.join(", ")}) AS v(id, load_id)
       WHERE p.id = v.id
         AND p.operating_company_id = $1::uuid
         AND p.load_id IS NULL
    `;
    const r = await c.query(sql, values);
    updated += r.rowCount ?? 0;
    console.log(`Batch ${Math.floor(i / BATCH) + 1}: updated ${r.rowCount ?? 0}`);
  }

  await c.query("COMMIT");
  console.log(`\nCOMMIT OK — ${updated} postings stamped with load_id`);
} catch (err) {
  await c.query("ROLLBACK");
  console.error("ERROR:", err);
  process.exit(1);
} finally {
  await c.end();
}
