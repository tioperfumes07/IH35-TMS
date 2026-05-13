import type { TeamSplitMethod } from "../mdata/driver-team.service.js";
import { normalizeShares } from "../mdata/driver-team.service.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export function splitTotalCents(totalCents: number, primaryPct: number, secondaryPct: number): { primaryCents: number; secondaryCents: number } {
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  const p = Number(primaryPct);
  const s = Number(secondaryPct);
  if (!Number.isFinite(p) || !Number.isFinite(s)) return { primaryCents: 0, secondaryCents: total };
  const primaryCents = Math.round((total * p) / 100);
  const secondaryCents = Math.max(0, total - primaryCents);
  return { primaryCents, secondaryCents };
}

export function effectiveTeamPercentsFromRow(team: {
  split_method: TeamSplitMethod | string;
  primary_share_pct: string | number | null | undefined;
  co_share_pct: string | number | null | undefined;
}): { primaryPct: number; secondaryPct: number } {
  const shares = normalizeShares(team.split_method as TeamSplitMethod, Number(team.primary_share_pct ?? 50), Number(team.co_share_pct ?? 50));
  return { primaryPct: shares.primary, secondaryPct: shares.co };
}

export async function fetchTeamDriversForLoad(
  client: DbClient,
  input: { operatingCompanyId: string; loadId: string }
): Promise<
  | {
      teamId: string;
      primaryDriverId: string;
      secondaryDriverId: string;
      primaryPct: number;
      secondaryPct: number;
    }
  | null
> {
  const loadRes = await client.query<{ team_id: string | null }>(
    `
      SELECT team_id
      FROM mdata.loads
      WHERE id = $1
        AND operating_company_id = $2
        AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [input.loadId, input.operatingCompanyId]
  );
  const teamId = loadRes.rows[0]?.team_id ? String(loadRes.rows[0].team_id) : "";
  if (!teamId) return null;

  const teamRes = await client.query<{
    id: string;
    primary_driver_id: string;
    secondary_driver_id: string;
    split_method: string;
    primary_share_pct: string | number | null;
    co_share_pct: string | number | null;
    is_active: boolean;
  }>(
    `
      SELECT id, primary_driver_id, secondary_driver_id, split_method::text, primary_share_pct, co_share_pct, is_active
      FROM mdata.driver_teams
      WHERE id = $1
        AND operating_company_id = $2
      LIMIT 1
    `,
    [teamId, input.operatingCompanyId]
  );
  const team = teamRes.rows[0];
  if (!team?.primary_driver_id || !team.secondary_driver_id) return null;
  if (team.is_active === false) return null;

  const { primaryPct, secondaryPct } = effectiveTeamPercentsFromRow(team);
  return {
    teamId: String(team.id),
    primaryDriverId: String(team.primary_driver_id),
    secondaryDriverId: String(team.secondary_driver_id),
    primaryPct,
    secondaryPct,
  };
}

export async function appendSettlementLineFromDriverBillIfMissing(
  client: DbClient,
  input: {
    settlementId: string;
    driverId: string;
    loadId: string;
    teamId?: string | null;
    lineType?: "earnings" | "team_split_primary" | "team_split_secondary";
  }
): Promise<void> {
  const reg = await client.query<{ ok: boolean }>(`SELECT to_regclass('driver_finance.settlement_lines') IS NOT NULL AS ok`);
  if (!reg.rows[0]?.ok) return;

  const billRes = await client.query<{ id: string; gross_amount_cents: number | string | null; load_number: string | null }>(
    `
      SELECT id, gross_amount_cents, load_number
      FROM driver_finance.driver_bills
      WHERE load_id = $1
        AND driver_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.loadId, input.driverId]
  );
  const bill = billRes.rows[0];
  if (!bill?.id) return;

  const cents = Math.round(Number(bill.gross_amount_cents ?? 0));
  const dollars = cents / 100;
  const loadLabel = String(bill.load_number ?? input.loadId);
  const description = `Load ${loadLabel}`;

  const hasSourceCol = await client.query<{ ok: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'driver_finance'
          AND table_name = 'settlement_lines'
          AND column_name = 'source_driver_bill_id'
      ) AS ok
    `
  );
  const hasTeamCol = await client.query<{ ok: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'driver_finance'
          AND table_name = 'settlement_lines'
          AND column_name = 'team_id'
      ) AS ok
    `
  );

  const lineType = input.lineType ?? "earnings";

  if (hasSourceCol.rows[0]?.ok) {
    if (hasTeamCol.rows[0]?.ok) {
      await client.query(
        `
          INSERT INTO driver_finance.settlement_lines (
            settlement_id,
            line_type,
            description,
            amount,
            team_id,
            source_driver_bill_id
          )
          VALUES ($1,$2,$3,$4,$5::uuid,$6::uuid)
          ON CONFLICT (source_driver_bill_id) WHERE source_driver_bill_id IS NOT NULL DO NOTHING
        `,
        [input.settlementId, lineType, description, dollars, input.teamId ?? null, bill.id]
      );
      return;
    }

    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (
          settlement_id,
          line_type,
          description,
          amount,
          source_driver_bill_id
        )
        VALUES ($1,$2,$3,$4,$5::uuid)
        ON CONFLICT (source_driver_bill_id) WHERE source_driver_bill_id IS NOT NULL DO NOTHING
      `,
      [input.settlementId, lineType, description, dollars, bill.id]
    );
    return;
  }

  if (hasTeamCol.rows[0]?.ok) {
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount, team_id)
        SELECT $1,$2,$3,$4,$5::uuid
        WHERE NOT EXISTS (
          SELECT 1
          FROM driver_finance.settlement_lines sl
          WHERE sl.settlement_id = $1::uuid
            AND sl.description = $3
            AND sl.line_type = $2
        )
      `,
      [input.settlementId, lineType, description, dollars, input.teamId ?? null]
    );
    return;
  }

  await client.query(
    `
      INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
      SELECT $1,$2,$3,$4
      WHERE NOT EXISTS (
        SELECT 1
        FROM driver_finance.settlement_lines sl
        WHERE sl.settlement_id = $1::uuid
          AND sl.description = $3
          AND sl.line_type = $2
      )
    `,
    [input.settlementId, lineType, description, dollars]
  );
}
