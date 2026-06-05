type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type TeamSplitResolution = {
  primary_driver_id: string;
  secondary_driver_id: string;
  primary_ratio: number;
  secondary_ratio: number;
  source: "load_override" | "config";
  config_id?: string;
};

export type AppliedTeamSplitLine = {
  driver_id: string;
  split_partner_driver_id: string;
  amount_cents: number;
  line_type: "team_split_primary" | "team_split_secondary";
  description: string;
};

export type ApplyTeamSplitInput = {
  operatingCompanyId: string;
  settlementId: string;
  loadId: string;
  assignedDriverId: string;
  grossAmountCents: number;
  loadNumber?: string | null;
};

function splitAmountCents(totalCents: number, primaryRatio: number, secondaryRatio: number) {
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  const primaryCents = Math.round(total * Number(primaryRatio));
  const secondaryCents = Math.max(0, total - primaryCents);
  return { primaryCents, secondaryCents };
}

export async function resolveTeamSplitForLoad(
  client: DbClient,
  input: { operatingCompanyId: string; loadId: string; assignedDriverId: string }
): Promise<TeamSplitResolution | null> {
  const overrideRes = await client.query<{
    primary_driver_id: string;
    secondary_driver_id: string;
    primary_ratio: string | number;
    secondary_ratio: string | number;
  }>(
    `
      SELECT primary_driver_id::text, secondary_driver_id::text, primary_ratio, secondary_ratio
      FROM settlements.team_split_load_overrides
      WHERE operating_company_id = $1::uuid
        AND load_id = $2::uuid
      LIMIT 1
    `,
    [input.operatingCompanyId, input.loadId]
  );
  const override = overrideRes.rows[0];
  if (override) {
    const primaryId = String(override.primary_driver_id);
    const secondaryId = String(override.secondary_driver_id);
    if (input.assignedDriverId !== primaryId && input.assignedDriverId !== secondaryId) return null;
    return {
      primary_driver_id: primaryId,
      secondary_driver_id: secondaryId,
      primary_ratio: Number(override.primary_ratio),
      secondary_ratio: Number(override.secondary_ratio),
      source: "load_override",
    };
  }

  const configRes = await client.query<{
    id: string;
    primary_driver_id: string;
    secondary_driver_id: string;
    primary_ratio: string | number;
    secondary_ratio: string | number;
  }>(
    `
      SELECT id::text, primary_driver_id::text, secondary_driver_id::text, primary_ratio, secondary_ratio
      FROM settlements.team_split_configs
      WHERE operating_company_id = $1::uuid
        AND status = 'active'
        AND effective_from_date <= CURRENT_DATE
        AND (effective_to_date IS NULL OR effective_to_date >= CURRENT_DATE)
        AND (
          (primary_driver_id = $2::uuid AND secondary_driver_id IS NOT NULL)
          OR secondary_driver_id = $2::uuid
        )
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.operatingCompanyId, input.assignedDriverId]
  );
  const config = configRes.rows[0];
  if (!config) return null;

  const primaryId = String(config.primary_driver_id);
  const secondaryId = String(config.secondary_driver_id);
  if (input.assignedDriverId !== primaryId && input.assignedDriverId !== secondaryId) return null;

  return {
    primary_driver_id: primaryId,
    secondary_driver_id: secondaryId,
    primary_ratio: Number(config.primary_ratio),
    secondary_ratio: Number(config.secondary_ratio),
    source: "config",
    config_id: String(config.id),
  };
}

export async function applyTeamSplitsForSettlement(client: DbClient, input: ApplyTeamSplitInput) {
  const split = await resolveTeamSplitForLoad(client, {
    operatingCompanyId: input.operatingCompanyId,
    loadId: input.loadId,
    assignedDriverId: input.assignedDriverId,
  });
  if (!split) return { applied: [] as AppliedTeamSplitLine[], total_split_cents: 0 };

  const { primaryCents, secondaryCents } = splitAmountCents(
    input.grossAmountCents,
    split.primary_ratio,
    split.secondary_ratio
  );
  const loadLabel = input.loadNumber ? String(input.loadNumber) : input.loadId;
  const applied: AppliedTeamSplitLine[] = [];

  const reg = await client.query<{ ok: boolean }>(`SELECT to_regclass('driver_finance.settlement_lines') IS NOT NULL AS ok`);
  const useSettlementLines = Boolean(reg.rows[0]?.ok);

  const primaryLine: AppliedTeamSplitLine = {
    driver_id: split.primary_driver_id,
    split_partner_driver_id: split.secondary_driver_id,
    amount_cents: primaryCents,
    line_type: "team_split_primary",
    description: `Team split primary (${Math.round(split.primary_ratio * 100)}%) — Load ${loadLabel}`,
  };
  const secondaryLine: AppliedTeamSplitLine = {
    driver_id: split.secondary_driver_id,
    split_partner_driver_id: split.primary_driver_id,
    amount_cents: secondaryCents,
    line_type: "team_split_secondary",
    description: `Team split secondary (${Math.round(split.secondary_ratio * 100)}%) — Load ${loadLabel}`,
  };

  if (useSettlementLines) {
    for (const line of [primaryLine, secondaryLine]) {
      await client.query(
        `
          INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount, split_partner_driver_id)
          VALUES ($1::uuid, $2, $3, $4::numeric, $5::uuid)
        `,
        [input.settlementId, line.line_type, line.description, line.amount_cents / 100, line.split_partner_driver_id]
      );
    }
  } else {
    for (const line of [primaryLine, secondaryLine]) {
      await client.query(
        `
          INSERT INTO payroll.driver_settlement_line_items (
            settlement_id,
            operating_company_id,
            line_type,
            load_id,
            description,
            amount_cents,
            split_partner_driver_id
          )
          VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6::bigint, $7::uuid)
        `,
        [
          input.settlementId,
          input.operatingCompanyId,
          line.line_type,
          input.loadId,
          line.description,
          line.amount_cents,
          line.split_partner_driver_id,
        ]
      );
    }
  }

  applied.push(primaryLine, secondaryLine);
  return { applied, total_split_cents: primaryCents + secondaryCents, split };
}

/** driver_finance settlement create path — mirrors auto-deduction hook shape. */
export async function applyTeamSplitsToSettlement(
  client: DbClient,
  input: {
    settlementId: string;
    operatingCompanyId: string;
    driverId: string;
    loadId: string;
    grossAmountCents: number;
    loadNumber?: string | null;
  }
) {
  return applyTeamSplitsForSettlement(client, {
    operatingCompanyId: input.operatingCompanyId,
    settlementId: input.settlementId,
    loadId: input.loadId,
    assignedDriverId: input.driverId,
    grossAmountCents: input.grossAmountCents,
    loadNumber: input.loadNumber,
  });
}
