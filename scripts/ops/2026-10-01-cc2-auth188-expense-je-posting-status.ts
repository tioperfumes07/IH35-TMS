/**
 * AUTH-188 — repair the 94 USMCA accounting.expenses rows that carry a LIVE journal entry while
 * posting_status = 'unposted' (measured 2026-10-01; 5 fuel documents + 89 settlement-feed documents).
 * The expense void route reverses only posting_status = 'posted', so each of these would void with
 * its entry still on the books.
 *
 * Writes ONLY posting_status = 'posted' and posted_at = the journal entry's own entry_date (when
 * posted_at is null). No amount, no account, no journal entry is touched; no GL math runs.
 *
 * Refuses unless every target is USMCA, not voided, status = 'posted', and its journal entry is live
 * (not voided, not reversed). An expense whose entry is reversed is NOT in scope.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-cc2-auth188-expense-je-posting-status.ts [--apply]
 * (dry run by default; --apply gated by verify-owner-authorization.mjs AUTH-188; one audit row)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-188";
const EXPECTED = 94;

const TARGETS_SQL = `
  SELECT e.id::text, e.status, e.voided_at, e.posted_at, je.entry_date::text AS entry_date,
         (je.voided_at IS NULL AND je.reversed_by_je_id IS NULL) AS je_live,
         (e.source_fuel_transaction_id IS NOT NULL) AS fuel_doc, e.total_amount_cents::bigint AS cents
    FROM accounting.expenses e
    JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
   WHERE e.operating_company_id = $1::uuid
     AND e.journal_entry_id IS NOT NULL
     AND e.posting_status = 'unposted'
   FOR UPDATE OF e`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (APPLY) await assertIsIntendedProduction(client);
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const rows = (await client.query<{ id: string; status: string; voided_at: string | null; posted_at: string | null; entry_date: string; je_live: boolean; fuel_doc: boolean; cents: string }>(TARGETS_SQL, [USMCA])).rows;
    const problems: string[] = [];
    if (rows.length !== EXPECTED) problems.push(`expected ${EXPECTED} targets, found ${rows.length} — the population moved; re-measure before writing`);
    for (const r of rows) {
      if (r.voided_at) problems.push(`${r.id}: voided`);
      if (r.status !== "posted") problems.push(`${r.id}: status ${r.status}, not posted`);
      if (!r.je_live) problems.push(`${r.id}: its journal entry is voided or reversed — not in scope`);
    }
    const fuel = rows.filter((r) => r.fuel_doc).length;
    const usd = rows.reduce((a, r) => a + Number(r.cents), 0) / 100;
    console.log(`targets: ${rows.length} (${fuel} fuel documents, ${rows.length - fuel} other), $${usd.toFixed(2)}`);
    if (problems.length) {
      await client.query("ROLLBACK");
      console.error(`REFUSED: ${problems.slice(0, 10).join("; ")}`);
      process.exit(1);
    }
    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log(`DRY RUN: would set posting_status='posted' (posted_at = entry_date where null) on ${rows.length} expense(s). Re-run with --apply.`);
      return;
    }
    const ids = rows.map((r) => r.id);
    const upd = await client.query(
      `UPDATE accounting.expenses e
          SET posting_status = 'posted',
              posted_at = COALESCE(e.posted_at, je.entry_date::timestamptz),
              updated_at = now()
         FROM accounting.journal_entries je
        WHERE je.id = e.journal_entry_id
          AND e.id = ANY($1::uuid[]) AND e.operating_company_id = $2::uuid
          AND e.posting_status = 'unposted' AND e.voided_at IS NULL
          AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL`,
      [ids, USMCA]
    );
    if (upd.rowCount !== rows.length) {
      await client.query("ROLLBACK");
      throw new Error(`expected ${rows.length} rows, updated ${upd.rowCount} — rolled back`);
    }
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "accounting.expense_posting_status_repaired",
      "info",
      JSON.stringify({ auth: AUTH_ID, operating_company_id: USMCA, rows: rows.length, fuel_documents: fuel, total_usd: usd.toFixed(2), expense_ids: ids }),
      `CC-2-${AUTH_ID}`,
    ]);
    const left = await client.query(`SELECT count(*)::int n FROM accounting.expenses WHERE operating_company_id = $1::uuid AND journal_entry_id IS NOT NULL AND posting_status = 'unposted'`, [USMCA]);
    await client.query("COMMIT");
    console.log(`APPLIED under ${AUTH_ID}: ${upd.rowCount} expense(s) now posting_status='posted'; violators left in USMCA: ${left.rows[0]!.n}; 1 audit row (source CC-2-${AUTH_ID}).`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

await main();
