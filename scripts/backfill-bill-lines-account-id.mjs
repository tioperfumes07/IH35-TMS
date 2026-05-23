#!/usr/bin/env node
import pg from "pg";

const { Pool } = pg;

function deriveMaintenanceCategoryCode(input) {
  const text = String(input ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (/\btire|wheel\b/.test(text)) return "tires";
  if (/\bbrake\b/.test(text)) return "brakes";
  if (/\bengine|coolant|transmission|turbo\b/.test(text)) return "engine";
  if (/\bdot\b|\binspection\b/.test(text)) return "dot";
  if (/\bbody\b|collision|paint/.test(text)) return "body";
  if (/\belectrical\b|battery|alternator|wiring/.test(text)) return "electrical";
  if (/\bac\b|\ba\/c\b|air conditioning|hvac/.test(text)) return "ac";
  if (/\bpm\b|preventive|maintenance service/.test(text)) return "pm_preventive";
  return "misc";
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  let updated = 0;
  let unresolved = 0;
  try {
    await client.query("BEGIN");
    const rows = await client.query(
      `
        SELECT
          bl.id::text AS bill_line_id,
          b.operating_company_id::text AS operating_company_id,
          bl.description,
          bl.category_kind,
          bl.category_code
        FROM accounting.bill_lines bl
        JOIN accounting.bills b
          ON b.id = bl.bill_id
        WHERE bl.account_id IS NULL
        ORDER BY bl.created_at ASC
      `
    );

    for (const row of rows.rows) {
      const categoryKind = String(row.category_kind ?? "maintenance").trim() || "maintenance";
      const categoryCode = String(row.category_code ?? "").trim() || deriveMaintenanceCategoryCode(row.description);
      const mapping = await client.query(
        `
          SELECT account_id::text AS account_id
          FROM accounting.expense_category_account_map
          WHERE operating_company_id = $1::uuid
            AND category_kind = $2
            AND category_code = $3
            AND is_active = true
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [row.operating_company_id, categoryKind, categoryCode]
      );
      const accountId = mapping.rows[0]?.account_id;
      if (!accountId) {
        unresolved += 1;
        console.log(
          JSON.stringify({
            bill_line_id: row.bill_line_id,
            operating_company_id: row.operating_company_id,
            unresolved_kind: categoryKind,
            unresolved_code: categoryCode,
          })
        );
        continue;
      }

      await client.query(
        `
          UPDATE accounting.bill_lines
          SET account_id = $2::uuid,
              category_kind = COALESCE(NULLIF(category_kind, ''), $3),
              category_code = COALESCE(NULLIF(category_code, ''), $4)
          WHERE id = $1::uuid
            AND account_id IS NULL
        `,
        [row.bill_line_id, accountId, categoryKind, categoryCode]
      );
      updated += 1;
    }

    await client.query("COMMIT");
    console.log(
      JSON.stringify({
        event: "backfill_bill_lines_account_id_complete",
        updated,
        unresolved,
      })
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
