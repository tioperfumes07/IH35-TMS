#!/usr/bin/env tsx
// docs.files PURGE-SCOPE CLEANUP (owner ruling, 2026-09-23:
// ~/Downloads/09-23-2026-CC-3-DOCS-FILES-PURGE-SCOPE-MEASURED.md, superseding the Lead's earlier
// "keep all 212 non-load-linked rows" ruling). The Lead's own words on the earlier ruling: "I
// measured that 212 files were not load-linked and concluded they were all compliance documents
// WITHOUT OPENING THE LIST." This script implements the corrected, content-measured rule.
//
// THIS RUNS BEFORE THE PURGE, NOT AS PART OF IT -- it is a live-data hygiene pass on the docs.*
// tables, which are MASTERS that survive the purge (files hang off drivers/units/vendors, not
// off transaction rows), so cleaning them now is real, in-scope work under Round 86 ("SURVIVES
// THE PURGE and is therefore real work"). No load/invoice/bill/settlement/expense row is touched.
//
// THREE DELETE RULES, exactly as ruled, applied in this order so a row that matches an earlier
// rule is never double-counted by a later one:
//   1. original_filename ~* '^driver-instructions-'   -- app-generated from the load, regenerable
//   2. original_filename ~* '(test|sample|demo|dummy|smoke|fixture)', excluding rule 1's rows
//      -- confirmed live: exactly 3 distinct filenames, 14 rows (TEST-CC3-POD-20260824.pdf x1,
//      TEST-Carrier_Rate_Confirmation_U6505932    .pdf x6, test load-1.pdf x7) -- no false
//      positives, each one is a real test-named upload.
//   3. duplicate rows by (operating_company_id, sha256_hash) among what remains -- keep the
//      EARLIEST created_at per hash, void the rest. NULL sha256_hash rows are never deduped
//      against each other (several real compliance docs -- ID cards, medical exam, Jorge's own
//      federal license -- predate hash computation and legitimately share NULL; SQL's own
//      NULL <> NULL semantics already exclude them from this rule, not special-cased here).
//
// EVERYTHING ELSE SURVIVES BY DEFAULT -- the delete list is enumerated, not a keep-allowlist. This
// deliberately does NOT try to individually classify every surviving file (driver PDFs, the COI,
// rate confirmations, trailer ID cards, form-425c) -- the three rules above are the only filter,
// matching the ruling's own words: "DELETE: 1/2/3 ... KEEP -- these are the owner's real
// evidence."
//
// Mirrors the real routes exactly:
//   DELETE /api/v1/docs/files/:file_id            (files.routes.ts) -- deleted_at/deleted_by_
//     user_id/delete_reason, void-not-delete.
//   DELETE /api/v1/docs/files/:file_id/links/:link_id (files.routes.ts) -- same shape on
//     docs.file_links. Applied to every non-deleted link whose file_id is one of the purged
//     files -- "drop the link to a purged document, keep the link to a surviving master."
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);

  // ---- measurement (both dry-run and execute) ----
  const before = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM docs.files WHERE operating_company_id = $1::uuid AND deleted_at IS NULL`,
    [USMCA_COMPANY_ID]
  );
  const targetIds = await client.query<{ id: string; rule: string }>(
    `
      WITH base AS (
        SELECT id, original_filename, sha256_hash, created_at,
               (original_filename ~* '^driver-instructions-') AS is_instr,
               (original_filename ~* '(test|sample|demo|dummy|smoke|fixture)'
                AND original_filename !~* '^driver-instructions-') AS is_test
          FROM docs.files
         WHERE operating_company_id = $1::uuid AND deleted_at IS NULL
      ),
      ranked AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY sha256_hash ORDER BY created_at ASC) AS rn
          FROM base
         WHERE NOT is_instr AND NOT is_test AND sha256_hash IS NOT NULL
      )
      SELECT id::text, 'driver_instructions' AS rule FROM base WHERE is_instr
      UNION ALL
      SELECT id::text, 'test_sample' AS rule FROM base WHERE is_test
      UNION ALL
      SELECT id::text, 'duplicate_sha256' AS rule FROM ranked WHERE rn > 1
    `,
    [USMCA_COMPANY_ID]
  );
  const byRule = new Map<string, number>();
  for (const r of targetIds.rows) byRule.set(r.rule, (byRule.get(r.rule) ?? 0) + 1);
  console.log(`Live active docs.files for USMCA: ${before.rows[0]!.n}`);
  console.log(`Rule 1 (driver-instructions): ${byRule.get("driver_instructions") ?? 0}`);
  console.log(`Rule 2 (test/sample):         ${byRule.get("test_sample") ?? 0}`);
  console.log(`Rule 3 (duplicate sha256):    ${byRule.get("duplicate_sha256") ?? 0}`);
  console.log(`Total to void:                ${targetIds.rowCount}`);
  console.log(`Expected to survive:          ${Number(before.rows[0]!.n) - targetIds.rowCount}`);

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made.");
    return;
  }

  const ids = targetIds.rows.map((r) => r.id);

  // ---- void the file_links pointing at any of these files first (drop the link) ----
  const links = await client.query<{ id: string }>(
    `
      UPDATE docs.file_links
      SET deleted_at = now(), deleted_by_user_id = $2::uuid
      WHERE file_id = ANY($1::uuid[]) AND deleted_at IS NULL
      RETURNING id::text
    `,
    [ids, OWNER_USER_ID]
  );
  console.log(`Voided ${links.rowCount} docs.file_links row(s) pointing at purged files.`);

  // ---- void the files themselves, mirroring DELETE /api/v1/docs/files/:file_id exactly ----
  const files = await client.query<{ id: string }>(
    `
      UPDATE docs.files
      SET deleted_at = now(), deleted_by_user_id = $2::uuid,
          delete_reason = 'E13-B docs.files purge-scope cleanup, 2026-09-23 (owner-measured rule): app-generated driver-instructions / test-sample / duplicate-sha256',
          updated_at = now()
      WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
      RETURNING id::text
    `,
    [ids, OWNER_USER_ID]
  );
  console.log(`Voided ${files.rowCount} docs.files row(s).`);

  const after = await client.query<{ n: string; distinct_sha: string }>(
    `
      SELECT count(*)::text AS n,
             count(DISTINCT sha256_hash) FILTER (WHERE sha256_hash IS NOT NULL)::text AS distinct_sha
        FROM docs.files
       WHERE operating_company_id = $1::uuid AND deleted_at IS NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`\nAfter: docs.files active = ${after.rows[0]!.n}, distinct non-null sha256 among them = ${after.rows[0]!.distinct_sha}.`);
  const stillDupe = await client.query<{ n: string }>(
    `
      SELECT count(*)::text AS n FROM (
        SELECT sha256_hash FROM docs.files
         WHERE operating_company_id = $1::uuid AND deleted_at IS NULL AND sha256_hash IS NOT NULL
         GROUP BY sha256_hash HAVING count(*) > 1
      ) d
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Remaining duplicate-sha256 groups among active rows: ${stillDupe.rows[0]!.n} (expect 0).`);

  client.release();
  await pool.end();
  console.log("\nDone.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
