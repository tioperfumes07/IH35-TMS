/**
 * Lead order 2026-10-11 (prod audit of 5769-5779): a Settlement Creator expense names the AlwaysTrack settlement it came
 * from. accounting.expenses.settlement_no was never stamped by the Creator, so the audit (and any reader that finds a
 * settlement's fuel / company expenses by its number) saw 0 of the posted expenses. ONE function, used by the Creator post
 * and by the one-shot stamp of the settlements posted before this existed: only this company's expenses named in the
 * settlement's own posted audit (expense ids), only where settlement_no is still empty, audited.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";

type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export async function stampCreatorExpenseSettlementNo(
  client: Q,
  input: { operatingCompanyId: string; settlementId: string; settlementNo: string; expenseIds: string[]; actorUserId: string },
): Promise<number> {
  const no = String(input.settlementNo ?? "").trim();
  if (!no || !input.expenseIds.length) return 0;
  const r = await client.query<{ id: string }>(
    `UPDATE accounting.expenses
        SET settlement_no = $3, updated_at = now()
      WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[]) AND settlement_no IS NULL AND voided_at IS NULL
      RETURNING id::text`,
    [input.operatingCompanyId, input.expenseIds, no],
  );
  if (r.rows.length) {
    await appendCrudAudit(
      client as never,
      input.actorUserId,
      "driver_finance.settlement_creator.expense_settlement_no_stamped",
      { resource_type: "driver_finance.driver_settlements", resource_id: input.settlementId, operating_company_id: input.operatingCompanyId, settlement_no: no, expense_ids: r.rows.map((x) => x.id) },
      "info",
      "SETTLEMENT-CREATOR",
    );
  }
  return r.rows.length;
}
