#!/usr/bin/env node
import pg from "pg";

const { Pool } = pg;

function deriveRevenueCode(input) {
  const lineType = String(input ?? "").toLowerCase().trim();
  if (lineType === "linehaul") return "linehaul";
  if (lineType === "fsc") return "fuel_surcharge";
  if (lineType === "detention") return "detention";
  if (lineType === "layover") return "layover";
  if (lineType === "lumper") return "lumper";
  return "accessorial";
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
    const lines = await client.query(
      `
        SELECT
          id::text AS line_id,
          operating_company_id::text AS operating_company_id,
          line_type,
          revenue_code
        FROM accounting.invoice_lines
        WHERE account_id IS NULL
        ORDER BY created_at ASC
      `
    );

    for (const line of lines.rows) {
      const revenueCode = String(line.revenue_code ?? "").trim() || deriveRevenueCode(line.line_type);
      const mapping = await client.query(
        `
          SELECT account_id::text AS account_id
          FROM accounting.expense_category_account_map
          WHERE operating_company_id = $1::uuid
            AND category_kind = 'revenue'
            AND category_code = $2
            AND is_active = true
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [line.operating_company_id, revenueCode]
      );
      const accountId = mapping.rows[0]?.account_id;
      if (!accountId) {
        unresolved += 1;
        console.log(
          JSON.stringify({
            line_id: line.line_id,
            operating_company_id: line.operating_company_id,
            unresolved_revenue_code: revenueCode,
          })
        );
        continue;
      }

      await client.query(
        `
          UPDATE accounting.invoice_lines
          SET account_id = $2::uuid,
              revenue_code = COALESCE(NULLIF(revenue_code, ''), $3)
          WHERE id = $1::uuid
            AND account_id IS NULL
        `,
        [line.line_id, accountId, revenueCode]
      );
      updated += 1;
    }

    await client.query("COMMIT");
    console.log(
      JSON.stringify({
        event: "backfill_invoice_lines_account_id_complete",
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
