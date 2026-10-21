import { appendCrudAudit } from "../audit/crud-audit.js";
import { releaseBankLinesNamingDocument } from "../accounting/void.service.js";

type Client = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/** The single settlement dead-state writer, AFTER the caller's financial unwind.
 * Does not reverse money or release children. Releases bank links before the state change.
 * Runs in the caller's transaction, including audit.
 * repairCancelledOnly is the explicit metadata-repair mode: never cancels a live settlement.
 */
export async function stampSettlementVoidedInClientTx(
  client: Client,
  input: { operatingCompanyId: string; settlementId: string; userId: string; reason: string; repairCancelledOnly?: boolean },
): Promise<{ changed: boolean; voidedAt: string }> {
  if (!input.reason.trim()) throw new Error("settlement_void_reason_required");
  const values = [input.settlementId, input.operatingCompanyId, input.userId, input.reason];
  const prior = await client.query<{ status: string; voided_at: string | null; reversed_at: string | null }>(
    `SELECT status::text, voided_at::text, reversed_at::text FROM driver_finance.driver_settlements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`, values.slice(0, 2),
  );
  const row = prior.rows[0];
  if (!row) throw new Error("settlement_not_found");
  if (row.status === "paid") throw new Error("settlement_reverse_blocked_paid");
  if (input.repairCancelledOnly && row.status !== "cancelled") throw new Error("settlement_marker_repair_requires_cancelled");
  if (row.status === "cancelled" && row.voided_at && row.reversed_at) {
    return { changed: false, voidedAt: row.voided_at };
  }
  // Historical marker completion is explicitly not a financial/bank reversal.
  // All normal void callers share this release, including bulk reverse.
  if (!input.repairCancelledOnly) {
    await releaseBankLinesNamingDocument(client, {
      operatingCompanyId: input.operatingCompanyId,
      pointerColumn: "matched_settlement_id", documentId: input.settlementId,
    }, { userId: input.userId, reason: input.reason });
  }
  const updated = await client.query<{ voided_at: string }>(
    `UPDATE driver_finance.driver_settlements
        SET status = 'cancelled',
            voided_at = COALESCE(voided_at, reversed_at, now()),
            reversed_at = COALESCE(reversed_at, voided_at, now()),
            voided_by_user_id = COALESCE(voided_by_user_id, $3::uuid),
            reversed_by_user_id = COALESCE(reversed_by_user_id, $3::uuid),
            void_reason = COALESCE(void_reason, $4),
            reversal_reason = COALESCE(reversal_reason, $4), updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      RETURNING voided_at::text`, values,
  );
  if (!updated.rows[0]) throw new Error("settlement_void_state_update_failed");
  await appendCrudAudit(client, input.userId, "driver_finance.driver_settlement.void_state_completed", {
    operating_company_id: input.operatingCompanyId, resource_id: input.settlementId,
    reason: input.reason, repair_cancelled_only: input.repairCancelledOnly === true,
    before: row, after: { status: "cancelled", voided_at: updated.rows[0].voided_at },
  }, "warning", "ROUND-443.213");
  return { changed: true, voidedAt: updated.rows[0].voided_at };
}
