import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { reverseSettlementPayRunInClientTx } from "./settlement-payrun-reverse.service.js";

type Client = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }> };

/** Owner REG-040: reverse posted history before reopening the SAME settlement for its next leg.
 * Caller owns the transaction. Reposting remains the existing human-confirmed pay-run close after
 * the added load's bill exists; booking never fabricates driver pay for an undelivered load.
 */
export async function reopenSettlementForContinuationInClientTx(client: Client, input: {
  operatingCompanyId: string; settlementId: string; loadId: string; actorUserId: string;
}): Promise<boolean> {
  const result = await client.query<{ status: string; trip_closed_at: string | null; voided_at: string | null; snapshot: Record<string, unknown> }>(`
    SELECT status::text, trip_closed_at::text, voided_at::text, to_jsonb(s) AS snapshot
    FROM driver_finance.driver_settlements s
    WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE
  `, [input.settlementId, input.operatingCompanyId]);
  const row = result.rows[0];
  if (!row || row.voided_at || !["open", "closed", "locked", "approved", "paid", "final"].includes(row.status)) {
    throw new Error("Settlement cannot continue: missing, voided or cancelled");
  }
  if (row.status === "open" && !row.trip_closed_at) return false;
  const otherPoster = await client.query<{ id: string }>(`
    SELECT id FROM driver_finance.driver_settlement_gl_runs
    WHERE settlement_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'posted'
    LIMIT 1
  `, [input.settlementId, input.operatingCompanyId]);
  if (otherPoster.rows.length) throw new Error("Settlement continuation requires the bill-payment reversal workflow");
  const reversal = await reverseSettlementPayRunInClientTx(client, {
    operatingCompanyId: input.operatingCompanyId, settlementId: input.settlementId,
    reason: `REG-040 resettlement continuation for load ${input.loadId}`,
  }, { userId: input.actorUserId }, companyBusinessDate());
  if (row.snapshot.posted_at && reversal.result !== "reversed") {
    throw new Error("Posted settlement continuation has no reversible pay-run journal");
  }
  const companyRows = await client.query<{ id: string; snapshot: Record<string, unknown> }>(`
    SELECT cs.id::text, to_jsonb(cs) AS snapshot FROM accounting.company_settlements cs
    JOIN accounting.company_settlement_driver_settlements link ON link.company_settlement_id = cs.id
    WHERE link.driver_settlement_id = $1::uuid AND cs.operating_company_id = $2::uuid
    FOR UPDATE OF cs
  `, [input.settlementId, input.operatingCompanyId]);
  for (const company of companyRows.rows) {
    if (company.snapshot.voided_at) throw new Error("Voided company settlement cannot continue");
    await client.query(`UPDATE accounting.company_settlements
      SET status = 'open', closed_at = NULL, closed_by_user_id = NULL, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [company.id, input.operatingCompanyId]);
    await appendCrudAudit(client, input.actorUserId, "accounting.company_settlement.resettlement_continued", {
      resource_type: "accounting.company_settlements", resource_id: company.id,
      operating_company_id: input.operatingCompanyId, driver_settlement_id: input.settlementId,
      previous_company_settlement: company.snapshot,
    }, "warning", "REG-040");
  }
  await client.query(`
    UPDATE driver_finance.driver_settlements
    SET status = 'open', trip_closed_at = NULL, locked_at = NULL, updated_at = now()
    WHERE id = $1::uuid AND operating_company_id = $2::uuid
  `, [input.settlementId, input.operatingCompanyId]);
  await appendCrudAudit(client, input.actorUserId, "driver_finance.settlement.resettlement_continued", {
    resource_type: "driver_finance.driver_settlements", resource_id: input.settlementId,
    operating_company_id: input.operatingCompanyId, load_id: input.loadId,
    previous_settlement: row.snapshot, reversal,
    next_action: "Existing delivery aggregation then human-confirmed pay-run close recomputes and reposts the same settlement",
  }, "warning", "REG-040");
  return true;
}
