#!/usr/bin/env tsx
/**
 * Reverse live AP GL on draft/unposted expenses (healthz ledger.ap_tieout).
 * 60 draft expenses carried AP credits with no accounting.bills row — reverse via
 * reversePostedSourceTransactionInClientTx (void-not-delete).
 *
 * Usage:
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/reverse-draft-expense-ap-gl.mts
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/reverse-draft-expense-ap-gl.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { reversePostedSourceTransactionInClientTx } from "../../apps/backend/src/accounting/posting-engine.service.js";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const AP = "34d5f1f7-385f-450c-b324-927fff09d31f";
const APPLY = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("set E11_LEAD_AUTH=1");

async function main() {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const rows = await c.query<{ expense_id: string; expense_number: string | null }>(
      `SELECT DISTINCT e.id::text AS expense_id, e.expense_number
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
         JOIN accounting.expenses e ON e.id = p.source_transaction_id::uuid
        WHERE p.operating_company_id = $1::uuid
          AND p.account_id = $2::uuid
          AND p.source_transaction_type = 'expense'
          AND p.debit_or_credit = 'credit'
          AND je.status <> 'voided'
          AND COALESCE(je.is_sample_data, false) = false
          AND e.status = 'draft'
          AND e.posting_status = 'unposted'`,
      [USMCA, AP]
    );
    console.log(`draft AP expenses: ${rows.rows.length} apply=${APPLY}`);
    if (!APPLY) {
      for (const r of rows.rows.slice(0, 10)) console.log(`  DRY ${r.expense_number}`);
      return;
    }
    let n = 0;
    for (const r of rows.rows) {
      await c.query("BEGIN");
      try {
        await c.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
        const rev = await reversePostedSourceTransactionInClientTx(
          c as never,
          {
            operating_company_id: USMCA,
            source_transaction_type: "expense",
            source_transaction_id: r.expense_id,
          },
          { userId: OWNER },
          companyBusinessDate()
        );
        await c.query("COMMIT");
        n++;
        console.log(`reversed ${r.expense_number} je=${rev.journal_entry_id}`);
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`FAIL ${r.expense_number}`, e);
        throw e;
      }
    }
    console.log(`reversed ${n}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
