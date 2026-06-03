#!/usr/bin/env node
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
  const res = await pool.query(
    `
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

  console.log("[verify-equipment-types-no-collision] OK");
} finally {
  await pool.end();
}
