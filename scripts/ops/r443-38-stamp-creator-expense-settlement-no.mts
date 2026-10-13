/**
 * ROUND 443.38 one-shot (Lead order 2026-10-11): stamp accounting.expenses.settlement_no on the Settlement Creator
 * settlements posted before the Creator stamped it (5769 repair + 5771/5773/5774/5776/5777/5779), through the SAME function the
 * Creator post now calls (stampCreatorExpenseSettlementNo): only the expense ids in each settlement's own
 * driver_finance.settlement_creator.posted audit, only where settlement_no is empty, audited. Idempotent. --dry-run rolls back.
 * Usage: DATABASE_URL=... npx tsx scripts/ops/r443-38-stamp-creator-expense-settlement-no.mts [--dry-run] <settlement_no>...
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { stampCreatorExpenseSettlementNo } from "../../apps/backend/src/driver-finance/settlement-creator-expense-settlement-no.js";

const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const dry = process.argv.includes("--dry-run");
const nos = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
for (const no of nos) {
  try {
    const n = await withCurrentUser(OWNER, async (c) => {
      await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
      const s = (await c.query<{ id: string }>(
        `SELECT id::text FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid AND source_document_ref = $2 AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`,
        [USMCA, no],
      )).rows[0];
      if (!s) throw new Error(`settlement ${no} not found`);
      const ids = (await c.query<{ id: string }>(
        `SELECT jsonb_array_elements_text(payload->'expense_ids') AS id FROM audit.audit_events
          WHERE event_class = 'driver_finance.settlement_creator.posted' AND payload->>'resource_id' = $1`,
        [s.id],
      )).rows.map((r) => r.id);
      const stamped = await stampCreatorExpenseSettlementNo(c as never, { operatingCompanyId: USMCA, settlementId: s.id, settlementNo: no, expenseIds: ids, actorUserId: OWNER });
      if (dry) throw Object.assign(new Error("DRY-RUN"), { stamped, ids: ids.length });
      return { stamped, ids: ids.length };
    });
    console.log(no, "STAMPED", JSON.stringify(n));
  } catch (e) {
    const x = e as Error & { stamped?: number; ids?: number };
    console.log(no, x.message === "DRY-RUN" ? `DRY-RUN would stamp ${x.stamped} of ${x.ids}` : `FAILED ${x.message}`);
  }
}
process.exit(0);
