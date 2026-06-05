type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type ApplyAutoDeductionInput = {
  operatingCompanyId: string;
  driverId: string;
  settlementId: string;
  deductionAccountId: string;
};

export type AppliedAutoDeductionLine = {
  policy_id: string;
  amount_cents: number;
  description: string;
};

export async function applyAutoDeductionsForSettlement(client: DbClient, input: ApplyAutoDeductionInput) {
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

  const applied: AppliedAutoDeductionLine[] = [];
  let totalDeducted = 0;

  for (const policy of policies.rows) {
    const remaining = Number(policy.total_owed_cents) - Number(policy.deducted_so_far_cents);
    if (remaining <= 0) continue;
    const deductCents = Math.min(Number(policy.max_per_settlement_cents), remaining);
    if (deductCents <= 0) continue;

    const description = `Auto-deduction (${policy.deduction_type})${policy.memo ? `: ${policy.memo}` : ""}`;
    await client.query(
      `
        INSERT INTO payroll.driver_settlement_line_items (
          settlement_id,
          operating_company_id,
          line_type,
          load_id,
          description,
          amount_cents,
          posting_account_id,
          auto_deduction_policy_id
        )
        VALUES ($1::uuid,$2::uuid,'auto_deduction',NULL,$3,$4::bigint,$5::uuid,$6::uuid)
      `,
      [input.settlementId, input.operatingCompanyId, description, -deductCents, input.deductionAccountId, policy.id]
    );

    const newDeducted = Number(policy.deducted_so_far_cents) + deductCents;
    const completed = newDeducted >= Number(policy.total_owed_cents);
    await client.query(
      `
        UPDATE driver_finance.auto_deduction_policies
        SET deducted_so_far_cents = $2::bigint,
            status = CASE WHEN $3::boolean THEN 'completed' ELSE status END,
            completed_at = CASE WHEN $3::boolean THEN now() ELSE completed_at END,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [policy.id, newDeducted, completed]
    );

    applied.push({ policy_id: policy.id, amount_cents: deductCents, description });
    totalDeducted += deductCents;
  }

  if (totalDeducted > 0) {
    await client.query(
      `
        UPDATE payroll.driver_settlements
        SET deductions_cents = deductions_cents + $2::bigint,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [input.settlementId, totalDeducted]
    );
  }

  return { applied, total_deducted_cents: totalDeducted };
}

/** driver_finance settlement create path (driver-finance/settlements.routes). */
export async function applyAutoDeductionsToSettlement(
  client: DbClient,
  input: { settlementId: string; driverId: string; operatingCompanyId: string }
) {
  const reg = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('driver_finance.settlement_lines') IS NOT NULL AS ok`
  );
  if (!reg.rows[0]?.ok) return { applied: [] as AppliedAutoDeductionLine[], total_deducted_cents: 0 };

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

  const applied: AppliedAutoDeductionLine[] = [];
  let totalDeductedCents = 0;

  for (const policy of policies.rows) {
    const remaining = Number(policy.total_owed_cents) - Number(policy.deducted_so_far_cents);
    if (remaining <= 0) continue;
    const deductCents = Math.min(Number(policy.max_per_settlement_cents), remaining);
    if (deductCents <= 0) continue;

    const description = `Auto-deduction (${policy.deduction_type})${policy.memo ? `: ${policy.memo}` : ""}`;
    const amountDollars = -(deductCents / 100);
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount, auto_deduction_policy_id)
        VALUES ($1::uuid, 'auto_deduction', $2, $3, $4::uuid)
      `,
      [input.settlementId, description, amountDollars, policy.id]
    );

    const newDeducted = Number(policy.deducted_so_far_cents) + deductCents;
    const completed = newDeducted >= Number(policy.total_owed_cents);
    await client.query(
      `
        UPDATE driver_finance.auto_deduction_policies
        SET deducted_so_far_cents = $2::bigint,
            status = CASE WHEN $3::boolean THEN 'completed' ELSE status END,
            completed_at = CASE WHEN $3::boolean THEN now() ELSE completed_at END,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [policy.id, newDeducted, completed]
    );

    applied.push({ policy_id: policy.id, amount_cents: deductCents, description });
    totalDeductedCents += deductCents;
  }

  if (totalDeductedCents > 0) {
    const deductDollars = totalDeductedCents / 100;
    await client.query(
      `
        UPDATE driver_finance.driver_settlements
        SET deductions_total = COALESCE(deductions_total, 0) + $2,
            net_pay = COALESCE(net_pay, 0) - $2,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [input.settlementId, deductDollars]
    );
  }

  return { applied, total_deducted_cents: totalDeductedCents };
}
