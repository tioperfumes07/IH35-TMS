#!/usr/bin/env tsx
/** One-shot: backfill load_id on deduction/reimbursement settlement_lines that name a load. */
import pg from "pg";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const c = await pool.connect();
  try {
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const res = await c.query<{ id: string; description: string; operating_company_id: string }>(
      `SELECT sl.id::text, sl.description, sl.operating_company_id::text
         FROM driver_finance.settlement_lines sl
        WHERE sl.load_id IS NULL AND sl.line_type IN ('reimbursement','deduction') AND sl.is_active = true
          AND sl.description ~ 'load \\d+'`
    );
    console.log("to_backfill", res.rows.length);
    let ok = 0;
    let skip = 0;
    for (const row of res.rows) {
      const m = row.description.match(/load\s+(\d+)/i);
      if (!m) {
        skip += 1;
        continue;
      }
      const ln = m[1]!;
      const load = await c.query<{ id: string }>(
        `SELECT id::text FROM mdata.loads
          WHERE operating_company_id = $1::uuid AND load_number = $2 AND soft_deleted_at IS NULL`,
        [row.operating_company_id, ln]
      );
      if (load.rows.length !== 1) {
        console.log("ambiguous", ln, load.rows.length);
        skip += 1;
        continue;
      }
      await c.query(
        `UPDATE driver_finance.settlement_lines SET load_id = $1::uuid WHERE id = $2::uuid AND load_id IS NULL`,
        [load.rows[0]!.id, row.id]
      );
      ok += 1;
    }
    console.log({ ok, skip });
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
