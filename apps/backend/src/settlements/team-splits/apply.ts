/**
 * P2b/P2f team-split convergence (owner ruling DECISION 2, Option A — 2026-07-21).
 *
 * Splits resolve from canonical System A only:
 *   1. per-load override — additive `team_split_override_*` columns on mdata.loads
 *      (written by the plural facade POST /api/v1/loads/:id/team-split);
 *   2. the active mdata.driver_teams row for the assigned driver (preferring the
 *      load's own team_id link), with percentages via the SAME normalizeShares/
 *      effectiveTeamPercentsFromRow math the live settlement close path uses.
 *
 * The RETIRE settlements-namespace team-split config/override tables have ZERO references
 * here (guard: scripts/verify-no-settlements-team-split-refs.mjs).
 */
import { effectiveTeamPercentsFromRow } from "../../driver-finance/settlement-engine.js";

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

type TeamRowForResolution = {
  id: string;
  primary_driver_id: string;
  secondary_driver_id: string;
  split_method: string;
  primary_share_pct: string | number | null;
  co_share_pct: string | number | null;
};

const ACTIVE_TEAM_PREDICATE = `
  is_active = true
  AND effective_from <= CURRENT_DATE
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
`;

export async function resolveTeamSplitForLoad(
  client: DbClient,
  input: { operatingCompanyId: string; loadId: string; assignedDriverId: string }
): Promise<TeamSplitResolution | null> {
  const loadRes = await client.query<{
    team_id: string | null;
    override_primary_driver_id: string | null;
    override_secondary_driver_id: string | null;
    override_primary_ratio: string | number | null;
    override_secondary_ratio: string | number | null;
  }>(
    `
      SELECT
        team_id::text,
        team_split_override_primary_driver_id::text AS override_primary_driver_id,
        team_split_override_secondary_driver_id::text AS override_secondary_driver_id,
        team_split_override_primary_ratio AS override_primary_ratio,
        team_split_override_secondary_ratio AS override_secondary_ratio
      FROM mdata.loads
      WHERE id = $2::uuid
        AND operating_company_id = $1::uuid
        AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [input.operatingCompanyId, input.loadId]
  );
  const load = loadRes.rows[0];
  if (!load) return null;

  if (load.override_primary_driver_id && load.override_secondary_driver_id && load.override_primary_ratio != null) {
    const primaryId = String(load.override_primary_driver_id);
    const secondaryId = String(load.override_secondary_driver_id);
    if (input.assignedDriverId !== primaryId && input.assignedDriverId !== secondaryId) return null;
    const primaryRatio = Number(load.override_primary_ratio);
    const secondaryRatio =
      load.override_secondary_ratio != null ? Number(load.override_secondary_ratio) : Math.max(0, 1 - primaryRatio);
    return {
      primary_driver_id: primaryId,
      secondary_driver_id: secondaryId,
      primary_ratio: primaryRatio,
      secondary_ratio: secondaryRatio,
      source: "load_override",
    };
  }

  // Prefer the load's own team link (matches the live close path), then fall back to the
  // assigned driver's active team (the plural contract's driver-keyed "config" lookup).
  let team: TeamRowForResolution | undefined;
  if (load.team_id) {
    const byLoadTeam = await client.query<TeamRowForResolution>(
      `
        SELECT id::text, primary_driver_id::text, secondary_driver_id::text,
               split_method::text, primary_share_pct, co_share_pct
        FROM mdata.driver_teams
        WHERE id = $2::uuid
          AND operating_company_id = $1::uuid
          AND ${ACTIVE_TEAM_PREDICATE}
        LIMIT 1
      `,
      [input.operatingCompanyId, load.team_id]
    );
    team = byLoadTeam.rows[0];
  }
  if (!team) {
    const byDriver = await client.query<TeamRowForResolution>(
      `
        SELECT id::text, primary_driver_id::text, secondary_driver_id::text,
               split_method::text, primary_share_pct, co_share_pct
        FROM mdata.driver_teams
        WHERE operating_company_id = $1::uuid
          AND ${ACTIVE_TEAM_PREDICATE}
          AND (primary_driver_id = $2::uuid OR secondary_driver_id = $2::uuid)
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [input.operatingCompanyId, input.assignedDriverId]
    );
    team = byDriver.rows[0];
  }
  if (!team) return null;

  const primaryId = String(team.primary_driver_id);
  const secondaryId = String(team.secondary_driver_id);
  if (input.assignedDriverId !== primaryId && input.assignedDriverId !== secondaryId) return null;

  const { primaryPct, secondaryPct } = effectiveTeamPercentsFromRow(team);
  return {
    primary_driver_id: primaryId,
    secondary_driver_id: secondaryId,
    primary_ratio: primaryPct / 100,
    secondary_ratio: secondaryPct / 100,
    source: "config",
    config_id: String(team.id),
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

  // STEP 3: never fall back to RETIRE payroll.driver_settlement_line_items.
  if (!useSettlementLines) {
    return { applied: [] as AppliedTeamSplitLine[], total_split_cents: 0 };
  }

  for (const line of [primaryLine, secondaryLine]) {
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount, split_partner_driver_id)
        VALUES ($1::uuid, $2, $3, $4::numeric, $5::uuid)
      `,
      [input.settlementId, line.line_type, line.description, line.amount_cents / 100, line.split_partner_driver_id]
    );
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
