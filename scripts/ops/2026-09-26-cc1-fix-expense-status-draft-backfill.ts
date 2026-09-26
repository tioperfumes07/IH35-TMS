/**
 * AUTH-047 — data correction for the 15 live accounting.expenses (USMCA) rows found stuck at
 * status='draft' despite carrying a real, live, posted GL journal entry. Root cause fixed in the
 * writer under ACCT-F2026092595 (4 independent posting writers now flip `status` alongside
 * `posting_status` on every successful post); this script corrects the rows that were already wrong
 * before that fix landed.
 *
 * Ground truth is journal_entry_postings (source_transaction_type='expense'), NOT
 * accounting.expenses.journal_entry_id — 2 of the 15 rows (this session's own AUTH-046 items a/b,
 * created before the writer fix) had journal_entry_id itself wrongly NULL despite a real posted JE
 * existing. Each row is refused unless it matches exactly one of two expected pre-states:
 *   (A) status='draft', posting_status='posted', journal_entry_id already correct -> flip status only.
 *   (B) status='draft', posting_status='unposted', journal_entry_id NULL, but a live posted JE exists
 *       via journal_entry_postings -> flip status + posting_status + posted_at + journal_entry_id.
 * No JE is created, reversed, or reposted — pure header metadata, matching the money exactly as it
 * already stands.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

      const rows = await client.query<{
        id: string; status: string; posting_status: string; journal_entry_id: string | null; real_je_id: string;
      }>(
        `
          SELECT DISTINCT e.id::text, e.status, e.posting_status, e.journal_entry_id::text, jep.journal_entry_uuid::text AS real_je_id
            FROM accounting.expenses e
            JOIN accounting.journal_entry_postings jep
              ON jep.source_transaction_type = 'expense' AND jep.source_transaction_id::text = e.id::text
            JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
           WHERE e.operating_company_id = $1::uuid AND e.status = 'draft' AND je.status = 'posted'
           ORDER BY e.id
        `,
        [USMCA_ID]
      );

      if (rows.rows.length !== 15) {
        throw new Error(`STOP: expected exactly 15 draft-with-posted-JE rows, found ${rows.rows.length}`);
      }

      for (const row of rows.rows) {
        if (row.posting_status === "posted" && row.journal_entry_id === row.real_je_id) {
          // shape (A): flip status only.
          const upd = await client.query(
            `UPDATE accounting.expenses SET status='posted', updated_at=now() WHERE id=$1::uuid AND operating_company_id=$2::uuid AND status='draft'`,
            [row.id, USMCA_ID]
          );
          if (upd.rowCount !== 1) throw new Error(`STOP: ${row.id} shape-A UPDATE affected ${upd.rowCount} rows, expected 1`);
          results.push({ id: row.id, shape: "A", journal_entry_id: row.real_je_id });
        } else if (row.posting_status === "unposted" && row.journal_entry_id === null) {
          // shape (B): flip status + posting_status + posted_at + journal_entry_id.
          const upd = await client.query(
            `UPDATE accounting.expenses
                SET status='posted', posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, updated_at=now()
              WHERE id=$1::uuid AND operating_company_id=$3::uuid AND status='draft' AND posting_status='unposted' AND journal_entry_id IS NULL`,
            [row.id, row.real_je_id, USMCA_ID]
          );
          if (upd.rowCount !== 1) throw new Error(`STOP: ${row.id} shape-B UPDATE affected ${upd.rowCount} rows, expected 1`);
          results.push({ id: row.id, shape: "B", journal_entry_id: row.real_je_id });
        } else {
          throw new Error(`STOP: ${row.id} matches neither expected shape (status=${row.status}, posting_status=${row.posting_status}, journal_entry_id=${row.journal_entry_id}, real_je_id=${row.real_je_id})`);
        }
      }

      // Post-write proof.
      const after = await client.query<{ status: string; n: string }>(
        `SELECT status, count(*)::text AS n FROM accounting.expenses WHERE operating_company_id=$1::uuid GROUP BY status ORDER BY status`,
        [USMCA_ID]
      );
      const stillDraftWithJe = await client.query<{ n: string }>(
        `
          SELECT count(DISTINCT e.id)::text AS n
            FROM accounting.expenses e
            JOIN accounting.journal_entry_postings jep
              ON jep.source_transaction_type = 'expense' AND jep.source_transaction_id::text = e.id::text
            JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
           WHERE e.operating_company_id = $1::uuid AND e.status = 'draft' AND je.status = 'posted'
        `,
        [USMCA_ID]
      );
      if (Number(stillDraftWithJe.rows[0]?.n ?? -1) !== 0) {
        throw new Error(`STOP: ${stillDraftWithJe.rows[0]?.n} rows still draft-with-posted-JE after the fix -- do not commit`);
      }

      await client.query("COMMIT");
      console.log(JSON.stringify({ corrected: results, status_counts_after: after.rows }, null, 2));
      console.log("COMMITTED.");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
