#!/usr/bin/env node
/**
 * Equipment types must not collide on normalized code/name *within one entity*.
 * After the per-entity catalog ruling (202607910000), the same code is intentionally
 * copied to every active company — cross-entity duplicates are NOT collisions.
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[verify-equipment-types-no-collision] DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({ connectionString });

try {
  const col = await pool.query(`
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'catalogs'
       AND table_name = 'equipment_types'
       AND column_name = 'operating_company_id'
     LIMIT 1
  `);
  const perEntity = col.rowCount > 0;

  const res = await pool.query(
    perEntity
      ? `
      WITH active AS (
        SELECT
          id,
          operating_company_id,
          code,
          name,
          regexp_replace(
            lower(trim(replace(replace(code, '_', '-'), '  ', ' '))),
            'd$',
            ''
          ) AS norm_code,
          regexp_replace(
            lower(trim(replace(replace(name, '_', '-'), '  ', ' '))),
            'd$',
            ''
          ) AS norm_name
        FROM catalogs.equipment_types
        WHERE deactivated_at IS NULL
      ),
      code_dupes AS (
        SELECT operating_company_id, norm_code, count(*)::int AS row_count, array_agg(code ORDER BY code) AS codes
        FROM active
        GROUP BY operating_company_id, norm_code
        HAVING count(*) > 1
      ),
      name_dupes AS (
        SELECT operating_company_id, norm_name, count(*)::int AS row_count, array_agg(code ORDER BY code) AS codes
        FROM active
        GROUP BY operating_company_id, norm_name
        HAVING count(*) > 1
      )
      SELECT 'code' AS kind, norm_code AS key, row_count, codes FROM code_dupes
      UNION ALL
      SELECT 'name' AS kind, norm_name AS key, row_count, codes FROM name_dupes
    `
      : `
      WITH active AS (
        SELECT
          id,
          code,
          name,
          regexp_replace(
            lower(trim(replace(replace(code, '_', '-'), '  ', ' '))),
            'd$',
            ''
          ) AS norm_code,
          regexp_replace(
            lower(trim(replace(replace(name, '_', '-'), '  ', ' '))),
            'd$',
            ''
          ) AS norm_name
        FROM catalogs.equipment_types
        WHERE deactivated_at IS NULL
      ),
      code_dupes AS (
        SELECT norm_code, count(*)::int AS row_count, array_agg(code ORDER BY code) AS codes
        FROM active
        GROUP BY norm_code
        HAVING count(*) > 1
      ),
      name_dupes AS (
        SELECT norm_name, count(*)::int AS row_count, array_agg(code ORDER BY code) AS codes
        FROM active
        GROUP BY norm_name
        HAVING count(*) > 1
      )
      SELECT 'code' AS kind, norm_code AS key, row_count, codes FROM code_dupes
      UNION ALL
      SELECT 'name' AS kind, norm_name AS key, row_count, codes FROM name_dupes
    `
  );

  if (res.rows.length > 0) {
    console.error("[verify-equipment-types-no-collision] FAILED — duplicate normalized keys:");
    for (const row of res.rows) {
      console.error(`  ${row.kind}=${row.key} count=${row.row_count} codes=${row.codes.join(",")}`);
    }
    process.exit(1);
  }

  console.log(
    `[verify-equipment-types-no-collision] OK${perEntity ? " (per-entity scope)" : " (global scope)"}`
  );
} finally {
  await pool.end();
}
