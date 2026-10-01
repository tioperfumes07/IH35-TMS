/**
 * Fuel fraud -> recovery chain (CC-2, owner law 2026-10-01). A CONFIRMED fraud alert opens the recovery
 * of its purchase through the FUEL-03 overage engine — the same event table, the same approve route, the
 * same contract-authority gate and the same receivable poster (Dr fuel_overage_receivable / Cr fuel
 * expense). Confirming never posts: the chargeback reaches the driver only after an approver approves it
 * (owner C5: driver-caused, with approval). No new GL math.
 *
 * One live recovery per purchase (uq_fuel_card_overage_events_active_txn). Several alerts on the same
 * purchase share it; an open cap-overage recovery on the purchase is named and refused, never doubled.
 */
import { resolveFuelOverageContractAuthority } from "./fuel-card-overage-contract.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type FraudRecoveryOutcome =
  | { outcome: "opened" | "reused"; recovery_event_id: string; status: string; recover_cents: number; total_cents: number; review_reason: string }
  | { outcome: "refused"; reason: string };

/** Pure: how much to recover. Defaults to the whole purchase; never more than it, never zero. */
export function decideRecoverCents(totalCents: number, requested: number | null | undefined): { cents: number } | { refused: string } {
  if (!(totalCents > 0)) return { refused: "purchase has no positive amount — nothing to recover" };
  if (requested == null) return { cents: totalCents };
  if (!Number.isInteger(requested) || requested <= 0) return { refused: "recover amount must be a positive whole number of cents" };
  if (requested > totalCents) return { refused: `recover amount ${requested} exceeds the purchase total ${totalCents}` };
  return { cents: requested };
}

/**
 * Called inside the confirm-fraud transaction, after the alert row is set to confirmed_fraud.
 * Returns what happened; the caller stores the link and reports a refusal without undoing the confirmation.
 */
export async function openFraudRecoveryForAlert(
  client: DbClient,
  input: { operating_company_id: string; alert_uuid: string; actor_user_id: string; recover_cents?: number | null }
): Promise<FraudRecoveryOutcome> {
  const alert = (
    await client.query<{ fuel_transaction_uuid: string | null; rule_id: string }>(
      `SELECT fuel_transaction_uuid::text, rule_id FROM fuel.fraud_alerts WHERE uuid = $1::uuid AND operating_company_id = $2::uuid`,
      [input.alert_uuid, input.operating_company_id]
    )
  ).rows[0];
  if (!alert?.fuel_transaction_uuid) return { outcome: "refused", reason: "alert names no fuel purchase" };

  const fuel = (
    await client.query<{ driver_id: string | null; unit_id: string | null; total_cents: string | null; voided_at: string | null }>(
      `SELECT driver_id::text, unit_id::text, round(total_cost * 100)::bigint::text AS total_cents, voided_at::text
         FROM fuel.fuel_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [alert.fuel_transaction_uuid, input.operating_company_id]
    )
  ).rows[0];
  if (!fuel) return { outcome: "refused", reason: "fuel purchase not found in this company" };
  if (fuel.voided_at) return { outcome: "refused", reason: "fuel purchase is voided — nothing to recover" };
  if (!fuel.driver_id) return { outcome: "refused", reason: "purchase has no driver — a company loss, not a driver recovery" };

  const totalCents = Number(fuel.total_cents ?? 0);
  const amount = decideRecoverCents(totalCents, input.recover_cents);
  if ("refused" in amount) return { outcome: "refused", reason: amount.refused };

  const existing = (
    await client.query<{ id: string; overage_rule: string; status: string; overage_cents: string }>(
      `SELECT id::text, overage_rule, status, overage_cents::text FROM fuel.fuel_card_overage_events
        WHERE operating_company_id = $1::uuid AND fuel_transaction_id = $2::uuid AND voided_at IS NULL
        FOR UPDATE`,
      [input.operating_company_id, alert.fuel_transaction_uuid]
    )
  ).rows[0];
  if (existing) {
    if (existing.overage_rule === "confirmed_fraud") {
      return { outcome: "reused", recovery_event_id: existing.id, status: existing.status, recover_cents: Number(existing.overage_cents), total_cents: totalCents, review_reason: "another confirmed alert on this purchase already opened its recovery" };
    }
    return {
      outcome: "refused",
      reason: `a ${existing.overage_rule} recovery (${existing.status}, event ${existing.id}) is already open on this purchase — resolve or void it before recovering it as fraud`,
    };
  }

  const contract = await resolveFuelOverageContractAuthority(client as never, {
    driverId: fuel.driver_id,
    operatingCompanyId: input.operating_company_id,
  });
  // Same rule as a cap overage: without signed contract authority the loss stays with the company and
  // is recorded as company_variance — never charged to the driver.
  const status = contract.hasContractAuthority ? "pending_review" : "company_variance";
  const reviewReason = contract.hasContractAuthority
    ? `confirmed fuel fraud (alert ${input.alert_uuid}, rule ${alert.rule_id}): recover ${amount.cents} of ${totalCents} cents — awaiting approval`
    : contract.denialReason ?? "Missing contract authority for driver recovery";

  const ins = await client.query<{ id: string }>(
    `INSERT INTO fuel.fuel_card_overage_events (
       operating_company_id, fuel_transaction_id, driver_id, unit_id, policy_id, overage_cents, total_cents,
       overage_rule, status, review_reason, has_contract_authority, created_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, NULL, $5::bigint, $6::bigint, 'confirmed_fraud', $7, $8, $9, $10::uuid)
     RETURNING id::text`,
    [input.operating_company_id, alert.fuel_transaction_uuid, fuel.driver_id, fuel.unit_id, amount.cents, totalCents, status, reviewReason, contract.hasContractAuthority, input.actor_user_id]
  );
  return { outcome: "opened", recovery_event_id: ins.rows[0]!.id, status, recover_cents: amount.cents, total_cents: totalCents, review_reason: reviewReason };
}

/** After the receivable posts: every confirmed alert linked to that event is recovered. */
export async function markFraudAlertsRecovered(client: DbClient, operatingCompanyId: string, recoveryEventId: string): Promise<number> {
  const res = await client.query<{ uuid: string }>(
    `UPDATE fuel.fraud_alerts SET status = 'recovered'
      WHERE operating_company_id = $1::uuid AND recovery_event_id = $2::uuid AND status = 'confirmed_fraud'
      RETURNING uuid::text`,
    [operatingCompanyId, recoveryEventId]
  );
  return res.rows.length;
}
