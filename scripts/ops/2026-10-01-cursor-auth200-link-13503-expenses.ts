/**
 * AUTH-200 — Link 3 USMCA expenses on load 13503 that already carry load_id but lack
 * expense_attribution.expense_load_links rows (CC-3 WRAP → Cursor B.9).
 *
 * SET-BASED: one INSERT … SELECT for all 3 ids. Never per-row HTTP.
 *
 * Usage:
 *   OWNER_AUTH_ID=AUTH-200 DATABASE_URL=… npx tsx scripts/ops/2026-10-01-cursor-auth200-link-13503-expenses.ts
 *   DRY_RUN=1 … (default) prints the rows that would insert; APPLY=1 writes.
 */
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD_ID = "2c2d9ae7-386d-4ede-9c8f-888bce2896d7";
const LOAD_NUMBER = "13503";
const EXPENSE_IDS = [
  "1c08aa97-0bde-4a02-a01c-18f75d4d1a3d", // 13503-11 $37.10
  "f267f1f1-12cc-48c5-8ef7-ce51f38b2b51", // 13503-12 $30.71
  "ef97d3af-a636-4edf-b82d-f188c98dd43f", // 13503-13 $37.24
] as const;

const AUTH = process.env.OWNER_AUTH_ID ?? "";
const APPLY = process.env.APPLY === "1" || process.env.DRY_RUN === "0";

async function main() {
  if (AUTH !== "AUTH-200") {
    console.error("Refusing: OWNER_AUTH_ID must be AUTH-200 (got %s)", AUTH || "(empty)");
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  // ROUND 363-CC3-D / 365.4: an AUTH-gated production fix refuses to run anywhere but the production branch.
  await assertIsIntendedProduction(client, { label: "auth200-link-13503-expenses" });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const pre = await client.query<{
      id: string;
      expense_number: string | null;
      load_id: string | null;
      link_count: string;
    }>(
      `SELECT e.id::text, e.expense_number, e.load_id::text,
              (SELECT COUNT(*)::text FROM expense_attribution.expense_load_links ell
                WHERE ell.expense_id = e.id) AS link_count
         FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid
          AND e.id = ANY($2::uuid[])
          AND COALESCE(e.is_sample_data, false) IS NOT TRUE
        ORDER BY e.expense_number`,
      [USMCA, EXPENSE_IDS]
    );

    console.log("PRE:", JSON.stringify(pre.rows, null, 2));
    if (pre.rows.length !== 3) {
      throw new Error(`Expected 3 expenses, got ${pre.rows.length}`);
    }
    for (const row of pre.rows) {
      if (row.load_id !== LOAD_ID) {
        throw new Error(`Expense ${row.id} load_id=${row.load_id} ≠ ${LOAD_ID}`);
      }
      if (Number(row.link_count) !== 0) {
        throw new Error(`Expense ${row.id} already has ${row.link_count} link(s)`);
      }
      if (!row.expense_number?.startsWith(`${LOAD_NUMBER}-`)) {
        throw new Error(`Expense ${row.id} expense_number=${row.expense_number} unexpected`);
      }
    }

    const sql = `
      INSERT INTO expense_attribution.expense_load_links (
        operating_company_id,
        expense_id,
        expense_source,
        load_id,
        load_number,
        expense_seq,
        expense_number,
        attribution_method,
        attribution_confidence,
        attribution_reason,
        attributed_by_user_id
      )
      SELECT
        e.operating_company_id,
        e.id,
        'accounting',
        e.load_id,
        $2::text,
        COALESCE(NULLIF(regexp_replace(e.expense_number, '^${LOAD_NUMBER}-', ''), ''), '0')::int,
        e.expense_number,
        'manual_override',
        'high',
        'AUTH-200 Cursor B.9 — CC-3 WRAP: expense already load_id-bound; mint missing expense_load_links',
        NULL
      FROM accounting.expenses e
      WHERE e.operating_company_id = $1::uuid
        AND e.id = ANY($3::uuid[])
        AND e.load_id = $4::uuid
        AND COALESCE(e.is_sample_data, false) IS NOT TRUE
        AND NOT EXISTS (
          SELECT 1 FROM expense_attribution.expense_load_links ell
           WHERE ell.expense_id = e.id
        )
      RETURNING id::text, expense_id::text, expense_number, expense_seq
    `;

    if (!APPLY) {
      console.log("DRY_RUN — would INSERT 3 expense_load_links. Set APPLY=1 to write.");
      await client.query("ROLLBACK");
      return;
    }

    const inserted = await client.query(sql, [USMCA, LOAD_NUMBER, EXPENSE_IDS, LOAD_ID]);
    console.log("INSERTED:", JSON.stringify(inserted.rows, null, 2));
    if (inserted.rowCount !== 3) {
      throw new Error(`Expected 3 inserts, got ${inserted.rowCount}`);
    }

    const post = await client.query<{ expense_number: string; link_count: string }>(
      `SELECT e.expense_number,
              (SELECT COUNT(*)::text FROM expense_attribution.expense_load_links ell
                WHERE ell.expense_id = e.id) AS link_count
         FROM accounting.expenses e
        WHERE e.id = ANY($1::uuid[])
        ORDER BY e.expense_number`,
      [EXPENSE_IDS]
    );
    console.log("POST:", JSON.stringify(post.rows, null, 2));
    for (const row of post.rows) {
      if (Number(row.link_count) !== 1) {
        throw new Error(`Post-check fail: ${row.expense_number} link_count=${row.link_count}`);
      }
    }

    await client.query("COMMIT");
    console.log("AUTH-200 CONSUMED — 3 expense_load_links written for load 13503");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
