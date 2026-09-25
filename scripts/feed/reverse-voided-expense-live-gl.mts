#!/usr/bin/env tsx
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { reversePostedSourceTransactionInClientTx } from "../../apps/backend/src/accounting/posting-engine.service.js";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("E11_LEAD_AUTH=1");

const ids = await withCurrentUser(OWNER, async (c) => {
  await setScopedCompanyContext(c, OWNER, USMCA);
  const rows = await c.query<{ expense_id: string }>(
    `SELECT DISTINCT e.id::text AS expense_id
       FROM accounting.expenses e
       JOIN accounting.journal_entry_postings p
         ON p.source_transaction_id = e.id::text AND p.source_transaction_type = 'expense'
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE e.operating_company_id = $1::uuid
        AND e.voided_at IS NOT NULL
        AND je.status <> 'voided'
        AND coalesce(je.is_sample_data,false) = false`,
    [USMCA]
  );
  return rows.rows.map((r) => r.expense_id);
});
console.log(`voided_with_live_gl=${ids.length} apply=${APPLY}`);
if (!APPLY) process.exit(0);

let n = 0;
for (const expense_id of ids) {
  try {
    await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      await c.query("BEGIN");
      try {
        await c.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
        await reversePostedSourceTransactionInClientTx(
          c as never,
          {
            operating_company_id: USMCA,
            source_transaction_type: "expense",
            source_transaction_id: expense_id,
          },
          { userId: OWNER },
          companyBusinessDate()
        );
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    });
    n++;
    if (n % 25 === 0) console.log(`reversed ${n}/${ids.length}`);
  } catch (e) {
    console.error(`FAIL ${expense_id}`, (e as Error).message.slice(0, 120));
  }
}
console.log(`DONE reversed=${n}`);
