#!/usr/bin/env tsx
/**
 * Backfill expense_attribution.expense_load_links for USMCA accounting.expenses that already
 * carry load_id but have no link row (createExpenseFromFuelTransaction and some feed paths
 * wrote the expense without the attribution row).
 *
 * Fuel-backed expenses (source_fuel_transaction_id set) are skipped — they belong to the FUEL
 * dimension; verify-alwaystrack-parity excludes them from EXPENSES and treats fuel.load_id as
 * the fuel attribution.
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/backfill-expense-load-links.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/backfill-expense-load-links.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("set E11_LEAD_AUTH=1");

async function main() {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const missing = await c.query<{
      expense_id: string;
      load_id: string;
      load_number: string;
      expense_number: string | null;
    }>(
      `SELECT e.id::text AS expense_id, e.load_id::text, l.load_number,
              COALESCE(e.expense_number, l.load_number) AS expense_number
         FROM accounting.expenses e
         JOIN mdata.loads l ON l.id = e.load_id AND l.operating_company_id = e.operating_company_id
         LEFT JOIN expense_attribution.expense_load_links ell
           ON ell.expense_source = 'accounting' AND ell.expense_id = e.id AND ell.load_id = e.load_id
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NULL
          AND e.load_id IS NOT NULL
          AND e.source_fuel_transaction_id IS NULL
          AND ell.id IS NULL`,
      [USMCA]
    );
    console.log(`missing links: ${missing.rows.length} apply=${APPLY}`);
    if (!APPLY) {
      for (const r of missing.rows.slice(0, 20)) {
        console.log(`  DRY ${r.expense_id} load ${r.load_number}`);
      }
      return;
    }
    let n = 0;
    for (const r of missing.rows) {
      const seq = await c.query<{ last_seq: number }>(
        `INSERT INTO expense_attribution.expense_seq_per_load (load_id, last_seq)
         VALUES ($1::uuid, 1)
         ON CONFLICT (load_id) DO UPDATE
           SET last_seq = expense_attribution.expense_seq_per_load.last_seq + 1, updated_at = now()
         RETURNING last_seq`,
        [r.load_id]
      );
      await c.query(
        `INSERT INTO expense_attribution.expense_load_links (
           operating_company_id, expense_id, expense_source, load_id, load_number, expense_seq,
           expense_number, attribution_method, attribution_confidence, attributed_by_user_id,
           attribution_reason
         )
         VALUES ($1::uuid, $2::uuid, 'accounting', $3::uuid, $4, $5, $6, 'manual_override', 'high', $7::uuid,
                 'ACCT-F20260924 backfill — expense already carried load_id')
         ON CONFLICT DO NOTHING`,
        [USMCA, r.expense_id, r.load_id, r.load_number, seq.rows[0]!.last_seq, r.expense_number, OWNER]
      );
      n++;
    }
    console.log(`inserted ${n} expense_load_links`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
