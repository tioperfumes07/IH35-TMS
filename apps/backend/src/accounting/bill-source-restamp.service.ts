/**
 * LEAD 443.184 item 2 re-stamp — a bill created before every writer named itself takes its source from evidence ALREADY
 * on record, never from memo text: a bill the settlement AP chain linked (driver_finance.driver_settlement_gl_bills with
 * the chain's own pay_basis, bill not posted at delivery) is a 'settlement_driver_bill'. Fill-null only; a bill with no
 * such evidence is left for the list. No money: amounts, accounts and postings are not touched. One audit event per bill.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export async function restampBillSourceFromEvidence(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; billIds: string[] }
): Promise<Array<{ bill_id: string; source: string }>> {
  if (!input.billIds.length) return [];
  const res = await client.query<{ bill_id: string; source: string }>(
    `UPDATE accounting.bills b
        SET source = 'settlement_driver_bill', updated_at = now()
      WHERE b.operating_company_id = $1::uuid
        AND b.id = ANY($2::uuid[])
        AND b.source IS NULL
        AND EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_bills g
                     WHERE g.accounting_bill_id = b.id AND g.operating_company_id = b.operating_company_id
                       AND g.pay_basis IS NOT NULL AND g.bill_posted_at_delivery IS NOT TRUE)
        AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_bills g
                         WHERE g.accounting_bill_id = b.id AND (g.pay_basis IS NULL OR g.bill_posted_at_delivery IS TRUE))
      RETURNING b.id::text AS bill_id, b.source`,
    [input.operatingCompanyId, input.billIds]
  );
  for (const row of res.rows) {
    await appendCrudAudit(
      client,
      input.actorUserId,
      "bill.source_restamped_from_evidence",
      { ...row, operating_company_id: input.operatingCompanyId, evidence: "driver_finance.driver_settlement_gl_bills (settlement AP chain: pay_basis set, not posted at delivery)", round: "LEAD 443.184" },
      "info",
      "LEAD-443-184"
    );
  }
  return res.rows;
}
