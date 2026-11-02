#!/usr/bin/env npx tsx
/**
 * ENG-12 — read-only note for the two historical applied deductions on CLOSED settlements
 * (P-0065 Fine, P-0045 I-94). Forward path is fixed by migrations 202616301200/1201; these
 * rows are NOT auto-rewritten (closed settlement WORM). Lead decides reclass JE if needed.
 *
 *   DATABASE_URL="$(head -1 ~/Downloads/lead-tmp/.prod)" npx tsx scripts/ops/2026-10-26-eng-12-fine-i94-historical-note.mts
 */
import pg from "pg";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL app.bypass_rls='lucia'");
    const { rows } = await c.query(
      `SELECT d.id::text, d.deduction_type, d.status, d.amount_cents, left(d.reason,100) AS reason,
              s.display_id AS settlement, s.status AS settlement_status
         FROM driver_finance.driver_settlement_deductions d
         JOIN driver_finance.driver_settlements s ON s.id = d.applied_to_settlement_id
        WHERE d.operating_company_id = $1::uuid AND d.voided_at IS NULL AND d.deduction_type = 'other'
          AND d.reason ~* '(Fine|I-94|Permit)' AND d.reason !~* '^Admin fee'
        ORDER BY d.reason`,
      [USMCA]
    );
    console.log(JSON.stringify({ dry_run: true, engine: "ENG-12", historical_other_fine_permit: rows, action: "LEAVE_ON_CLOSED_SETTLEMENT — forward items rebound off 7200" }, null, 2));
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
