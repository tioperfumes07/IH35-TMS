import { appendCrudAudit } from "../audit/crud-audit.js";

type Client = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/** Marker writer only. Domain callers retain their financial unwind/refusal checks.
 * openOnly preserves correction paths' race refusal; every UPDATE is company-scoped.
 */
export async function stampDriverBillVoidedInClientTx(client: Client, input: {
  operatingCompanyId: string; driverBillId: string; userId: string; reason: string; openOnly?: boolean;
}): Promise<boolean> {
  if (!input.reason.trim()) throw new Error("driver_bill_void_reason_required");
  const result = await client.query<{ id: string }>(
    `UPDATE driver_finance.driver_bills
        SET status = 'void', voided_at = COALESCE(voided_at, now()),
            void_reason = COALESCE(void_reason, $3),
            voided_by_user_id = COALESCE(voided_by_user_id, $4::uuid), updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
        AND (status NOT IN ('void','voided') OR voided_at IS NULL)
        AND ($5::boolean = false OR (status = 'open' AND voided_at IS NULL))
      RETURNING id::text`,
    [input.driverBillId, input.operatingCompanyId, input.reason, input.userId, input.openOnly === true],
  );
  if (!result.rows[0]) return false;
  await appendCrudAudit(client, input.userId, "driver_finance.driver_bill.void_state_completed", {
    operating_company_id: input.operatingCompanyId, resource_id: input.driverBillId, reason: input.reason,
  }, "warning", "ROUND-443.213");
  return true;
}
