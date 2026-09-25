#!/usr/bin/env tsx
/**
 * Reverse live JE postings still attached to voided expenses (void-not-delete).
 * One connection; commit per expense. ~few sec each.
 *
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/reverse-voided-expense-live-gl.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { reversePostedSourceTransactionInClientTx } from "../../apps/backend/src/accounting/posting-engine.service.js";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) : Infinity;
})();

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("E11_LEAD_AUTH=1");

async function main() {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    const rows = await c.query<{ expense_id: string }>(
      // Same liveness as verify-no-voided-doc-has-live-postings: original lines
      // with neither reversal_of_line_id nor reversed_by_line_id. JE status stays
      // 'posted' after reverse (WORM — reverse is a new JE), so status<>voided
      // falsely re-lists already-reversed expenses.
      `SELECT DISTINCT e.id::text AS expense_id
         FROM accounting.expenses e
         JOIN accounting.journal_entry_postings p
           ON p.source_transaction_id = e.id::text AND p.source_transaction_type = 'expense'
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NOT NULL
          AND coalesce(e.is_sample_data,false) = false
          AND p.reversal_of_line_id IS NULL
          AND p.reversed_by_line_id IS NULL
        ORDER BY 1`,
      [USMCA]
    );
    const ids = rows.rows.map((r) => r.expense_id).slice(0, LIMIT);
    console.log(`voided_with_live_gl=${ids.length} apply=${APPLY}`);
    if (!APPLY) return;

    let n = 0;
    let fail = 0;
    const biz = companyBusinessDate();
    for (const expense_id of ids) {
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
          biz
        );
        await c.query("COMMIT");
        n++;
        if (n % 25 === 0) console.log(`reversed ${n}/${ids.length}`);
      } catch (e) {
        await c.query("ROLLBACK");
        fail++;
        console.error(`FAIL ${expense_id} ${(e as Error).message.slice(0, 160)}`);
      }
    }
    console.log(`DONE reversed=${n} fail=${fail}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
