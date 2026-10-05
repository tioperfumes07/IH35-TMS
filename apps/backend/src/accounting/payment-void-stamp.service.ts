/**
 * The ONE writer of a customer payment's void stamp (accounting.payments voided_at / voided_by_user_id / void_reason) and of
 * its applications' archive (payment_applications.unapplied_*). Shared by the governed void executor
 * (governance/void-cancel-executors.ts executeCustomerPayment) and voidDocument('customer_payment').
 *
 * AUTH-400 (2026-10-04): voidDocument reversed a customer payment's GL and never stamped the payment — the bank-line undo
 * path (banking/bank-line-state-machine.service.ts) called it alone, so every such void was a SILENT void (ledger dead,
 * header live; verify-void-is-whole Direction 1). The stamp now lives in one function both doors call.
 *
 * Idempotent: an already-voided payment is left as it is (its first stamp stands) and reported already_voided.
 */
type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export async function stampCustomerPaymentVoided(
  client: Q,
  input: { operatingCompanyId: string; paymentId: string; userId: string; reason: string }
): Promise<{ already_voided: boolean }> {
  const u = await client.query(
    `UPDATE accounting.payments SET voided_at = now(), voided_by_user_id = $2::uuid, void_reason = $3
      WHERE id = $1::uuid AND operating_company_id = $4::uuid AND voided_at IS NULL`,
    [input.paymentId, input.userId, input.reason, input.operatingCompanyId]
  );
  if (!u.rowCount) return { already_voided: true };
  // INV-2: void-never-delete — archive all applications when voiding; never hard-delete.
  await client.query(
    `UPDATE accounting.payment_applications SET unapplied_at = now(), unapplied_by_user_id = $2 WHERE payment_id = $1 AND unapplied_at IS NULL`,
    [input.paymentId, input.userId]
  );
  return { already_voided: false };
}
