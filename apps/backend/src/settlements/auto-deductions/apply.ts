type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type MaterializedAutoDeductionTranche = {
  policy_id: string;
  deduction_id: string;
  amount_cents: number;
  reason: string;
};

export type ApplyAutoDeductionsResult = {
  materialized: MaterializedAutoDeductionTranche[];
  total_materialized_cents: number;
  /** false = table/linkage column not present yet (migration 202607650000 not applied) → no-op. */
  schema_ready: boolean;
};

/**
 * P2a MATERIALIZER (owner DECISION 1, 2026-07-21 — Option A, blueprint-conform):
 * auto-deductions are sub-ledger rows in driver_finance.driver_settlement_deductions (cents,
 * net-floor-cap-visible), NEVER negative driver_finance.settlement_lines and NEVER a manual
 * patch of settlement totals.
 *
 * For each ACTIVE policy with remaining balance (row-locked FOR UPDATE), this materializes at most
 * ONE open tranche: amount = min(max_per_settlement_cents, remaining). Idempotency is enforced by
 * the partial unique index driver_settlement_deductions_open_auto_tranche_uq
 * (ON (source_auto_deduction_policy_id) WHERE applied_to_settlement_id IS NULL) via
 * ON CONFLICT DO NOTHING — a re-run while a prior tranche is still pending inserts nothing and
 * does NOT advance the policy counter.
 *
 * deducted_so_far_cents advances at MATERIALIZATION: the sub-ledger row now carries the
 * receivable. If the net-floor cap applier (applyPendingDeductionsToSettlementWithNetFloor)
 * defers the tranche over the cap, the row stays open (applied_to_settlement_id IS NULL) and
 * rolls to the next settlement automatically — the policy is not re-materialized meanwhile.
 *
 * This function does NOT insert settlement_lines and does NOT touch settlement totals — the
 * existing cap applier + aggregateSettlementTotals own that. NO NEW GL MATH.
 */
export async function applyAutoDeductionsToSettlement(
  client: DbClient,
  input: { settlementId: string; driverId: string; operatingCompanyId: string; actorUserId?: string | null }
): Promise<ApplyAutoDeductionsResult> {
  const empty: ApplyAutoDeductionsResult = { materialized: [], total_materialized_cents: 0, schema_ready: true };

  // Existence probe (resolveSettlementMinNet pattern): safe to run before/with migration 202607650000.
  const probe = await client.query<{ table_ok: boolean; column_ok: boolean }>(
    `
      SELECT
        to_regclass('driver_finance.driver_settlement_deductions') IS NOT NULL AS table_ok,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'driver_finance'
            AND table_name = 'driver_settlement_deductions'
            AND column_name = 'source_auto_deduction_policy_id'
        ) AS column_ok
    `
  );
  if (!probe.rows[0]?.table_ok || !probe.rows[0]?.column_ok) {
    return { ...empty, schema_ready: false };
  }

  const policies = await client.query<{
    id: string;
    deduction_type: string;
    total_owed_cents: number;
    deducted_so_far_cents: number;
    max_per_settlement_cents: number;
    memo: string | null;
  }>(
    `
      SELECT
        id::text,
        deduction_type::text,
        total_owed_cents::bigint,
        deducted_so_far_cents::bigint,
        max_per_settlement_cents::bigint,
        memo
      FROM driver_finance.auto_deduction_policies
      WHERE operating_company_id = $1::uuid
        AND driver_id = $2::uuid
        AND status = 'active'
        AND deducted_so_far_cents < total_owed_cents
      ORDER BY created_at ASC
      FOR UPDATE
    `,
    [input.operatingCompanyId, input.driverId]
  );

  const materialized: MaterializedAutoDeductionTranche[] = [];
  let totalMaterializedCents = 0;

  for (const policy of policies.rows) {
    const remaining = Number(policy.total_owed_cents) - Number(policy.deducted_so_far_cents);
    if (remaining <= 0) continue;
    const trancheCents = Math.min(Number(policy.max_per_settlement_cents), remaining);
    if (trancheCents <= 0) continue;

    const reason = `Auto-deduction (${policy.deduction_type})${policy.memo ? `: ${policy.memo}` : ""}`;

    // One open tranche per policy: the partial unique arbiter makes a re-run a no-op (RETURNING
    // yields no row on conflict → the policy counter below is NOT advanced twice).
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.driver_settlement_deductions (
          operating_company_id,
          driver_id,
          deduction_type,
          amount_cents,
          reason,
          source_auto_deduction_policy_id,
          created_by_user_id,
          remaining_balance_cents,
          status
        )
        VALUES ($1::uuid, $2::uuid, $3, $4::bigint, $5, $6::uuid, $7::uuid, $4::bigint, 'pending')
        ON CONFLICT (source_auto_deduction_policy_id) WHERE applied_to_settlement_id IS NULL
        DO NOTHING
        RETURNING id::text
      `,
      [
        input.operatingCompanyId,
        input.driverId,
        policy.deduction_type,
        trancheCents,
        reason,
        policy.id,
        input.actorUserId ?? null,
      ]
    );
    const deductionId = inserted.rows[0]?.id ? String(inserted.rows[0].id) : null;
    if (!deductionId) continue; // open tranche already exists for this policy — skip, no double-charge

    const newDeducted = Number(policy.deducted_so_far_cents) + trancheCents;
    const completed = newDeducted >= Number(policy.total_owed_cents);
    await client.query(
      `
        UPDATE driver_finance.auto_deduction_policies
        SET deducted_so_far_cents = $2::bigint,
            status = CASE WHEN $3::boolean THEN 'completed' ELSE status END,
            completed_at = CASE WHEN $3::boolean THEN now() ELSE completed_at END,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $4::uuid
      `,
      [policy.id, newDeducted, completed, input.operatingCompanyId]
    );

    materialized.push({ policy_id: policy.id, deduction_id: deductionId, amount_cents: trancheCents, reason });
    totalMaterializedCents += trancheCents;
  }

  return { materialized, total_materialized_cents: totalMaterializedCents, schema_ready: true };
}
