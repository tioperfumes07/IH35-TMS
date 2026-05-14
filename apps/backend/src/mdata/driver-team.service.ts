import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";

export type TeamSplitMethod = "50_50" | "60_40" | "70_30" | "mileage_prorated" | "hours_prorated" | "custom";

type TeamRow = {
  id: string;
  operating_company_id: string;
  team_name: string;
  primary_driver_id: string;
  secondary_driver_id: string;
  split_method: TeamSplitMethod;
  primary_share_pct: string | number;
  co_share_pct: string | number;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
};

type Queryable = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const ACTIVE_LOAD_STATUSES = [
  "assigned_not_dispatched",
  "dispatched",
  "in_transit",
  "at_pickup",
  "at_delivery",
  "delivered_pending_docs",
];

function roundMoneyCents(value: number): number {
  return Math.max(0, Math.round(value));
}

export function normalizeShares(splitMethod: TeamSplitMethod, primaryPct?: number, coPct?: number) {
  if (splitMethod === "50_50") return { primary: 50, co: 50 };
  if (splitMethod === "60_40") return { primary: 60, co: 40 };
  if (splitMethod === "70_30") return { primary: 70, co: 30 };
  const p = Number(primaryPct ?? 50);
  const c = Number(coPct ?? 50);
  if (!Number.isFinite(p) || !Number.isFinite(c)) throw new Error("E_INVALID_SPLIT_PERCENTAGES");
  if (Math.round((p + c) * 100) !== 10000) throw new Error("E_SPLIT_PERCENTAGES_MUST_EQUAL_100");
  if (p < 0 || p > 100 || c < 0 || c > 100) throw new Error("E_INVALID_SPLIT_PERCENTAGES");
  return { primary: p, co: c };
}

async function assertDriverCompany(client: Queryable, driverId: string, operatingCompanyId: string) {
  const res = await client.query(
    `
      SELECT d.id
      FROM mdata.drivers d
      JOIN org.user_company_access uca ON uca.user_id = d.identity_user_id
      WHERE d.id = $1
        AND uca.company_id = $2
        AND uca.deactivated_at IS NULL
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  if (!res.rows[0]?.id) throw new Error("E_DRIVER_NOT_IN_COMPANY");
}

async function assertNotInOtherActiveTeam(client: Queryable, driverId: string, excludeTeamId?: string) {
  const values: unknown[] = [driverId];
  let sql = `
    SELECT id
    FROM mdata.driver_teams
    WHERE is_active = true
      AND (primary_driver_id = $1 OR secondary_driver_id = $1)
  `;
  if (excludeTeamId) {
    values.push(excludeTeamId);
    sql += ` AND id <> $2`;
  }
  sql += ` LIMIT 1`;
  const res = await client.query(sql, values);
  if (res.rows[0]?.id) throw new Error("E_DRIVER_ALREADY_IN_ACTIVE_TEAM");
}

async function getTeam(client: Queryable, teamId: string, operatingCompanyId: string): Promise<TeamRow> {
  const res = await client.query(
    `
      SELECT *
      FROM mdata.driver_teams
      WHERE id = $1
        AND operating_company_id = $2
      LIMIT 1
    `,
    [teamId, operatingCompanyId]
  );
  const row = res.rows[0] as TeamRow | undefined;
  if (!row) throw new Error("E_TEAM_NOT_FOUND");
  return row;
}

export async function listDriverTeams(userId: string, operatingCompanyId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query(
      `
        SELECT
          t.*,
          concat_ws(' ', pd.first_name, pd.last_name) AS primary_driver_name,
          concat_ws(' ', cd.first_name, cd.last_name) AS co_driver_name
        FROM mdata.driver_teams t
        JOIN mdata.drivers pd ON pd.id = t.primary_driver_id
        JOIN mdata.drivers cd ON cd.id = t.secondary_driver_id
        WHERE t.operating_company_id = $1
        ORDER BY t.is_active DESC, t.created_at DESC
      `,
      [operatingCompanyId]
    );
    return res.rows;
  });
}

export async function getDriverTeam(userId: string, operatingCompanyId: string, teamId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const teamRes = await client.query(
      `
        SELECT
          t.*,
          concat_ws(' ', pd.first_name, pd.last_name) AS primary_driver_name,
          concat_ws(' ', cd.first_name, cd.last_name) AS co_driver_name
        FROM mdata.driver_teams t
        JOIN mdata.drivers pd ON pd.id = t.primary_driver_id
        JOIN mdata.drivers cd ON cd.id = t.secondary_driver_id
        WHERE t.id = $2
          AND t.operating_company_id = $1
        LIMIT 1
      `,
      [operatingCompanyId, teamId]
    );
    const team = teamRes.rows[0];
    if (!team) return null;
    const historyRes = await client.query(
      `
        SELECT *
        FROM driver_finance.team_settlement_splits
        WHERE team_id = $1
        ORDER BY computed_at DESC
        LIMIT 100
      `,
      [teamId]
    );
    return { ...team, settlement_history: historyRes.rows };
  });
}

export async function createTeam(
  userId: string,
  input: {
    operating_company_id: string;
    primary_driver_id: string;
    co_driver_id: string;
    team_name: string;
    split_method: TeamSplitMethod;
    primary_share_pct?: number;
    co_share_pct?: number;
    notes?: string;
    effective_from?: string;
  }
) {
  if (input.primary_driver_id === input.co_driver_id) throw new Error("E_PRIMARY_AND_CO_MUST_DIFFER");
  const shares = normalizeShares(input.split_method, input.primary_share_pct, input.co_share_pct);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    await assertDriverCompany(client, input.primary_driver_id, input.operating_company_id);
    await assertDriverCompany(client, input.co_driver_id, input.operating_company_id);
    await assertNotInOtherActiveTeam(client, input.primary_driver_id);
    await assertNotInOtherActiveTeam(client, input.co_driver_id);

    const inserted = await client.query(
      `
        INSERT INTO mdata.driver_teams (
          operating_company_id, team_name, primary_driver_id, secondary_driver_id,
          split_method, primary_share_pct, co_share_pct, notes, effective_from, is_active, created_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::date, CURRENT_DATE),true,$10)
        RETURNING *
      `,
      [
        input.operating_company_id,
        input.team_name.trim(),
        input.primary_driver_id,
        input.co_driver_id,
        input.split_method,
        shares.primary,
        shares.co,
        input.notes?.trim() || null,
        input.effective_from ?? null,
        userId,
      ]
    );
    const team = inserted.rows[0];
    await appendCrudAudit(
      client,
      userId,
      "mdata.driver_team.created",
      {
        resource_type: "mdata.driver_teams",
        resource_id: team.id,
        operating_company_id: input.operating_company_id,
        primary_driver_id: input.primary_driver_id,
        co_driver_id: input.co_driver_id,
        split_method: input.split_method,
        primary_share_pct: shares.primary,
        co_share_pct: shares.co,
      },
      "info",
      "P5-E3-TEAM-DRIVERS"
    );
    return team;
  });
}

export async function updateTeamSplit(
  userId: string,
  input: {
    operating_company_id: string;
    team_id: string;
    split_method: TeamSplitMethod;
    primary_share_pct?: number;
    co_share_pct?: number;
    effective_from: string;
    notes?: string;
    reactivate?: boolean;
  }
) {
  const shares = normalizeShares(input.split_method, input.primary_share_pct, input.co_share_pct);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    const current = await getTeam(client, input.team_id, input.operating_company_id);
    const inProgressRes = await client.query(
      `
        SELECT id
        FROM mdata.loads
        WHERE team_id = $1
          AND status = ANY($2::mdata.load_status_enum[])
          AND soft_deleted_at IS NULL
        LIMIT 1
      `,
      [input.team_id, ACTIVE_LOAD_STATUSES]
    );
    if (inProgressRes.rows[0]?.id) throw new Error("E_TEAM_HAS_IN_PROGRESS_LOADS");

    const newEffectiveFrom = input.effective_from;
    await client.query(
      `
        UPDATE mdata.driver_teams
        SET is_active = false,
            effective_to = ($2::date - INTERVAL '1 day')::date,
            updated_at = now()
        WHERE id = $1
      `,
      [input.team_id, newEffectiveFrom]
    );
    const inserted = await client.query(
      `
        INSERT INTO mdata.driver_teams (
          operating_company_id, team_name, primary_driver_id, secondary_driver_id,
          split_method, primary_share_pct, co_share_pct,
          effective_from, effective_to, is_active, notes, created_by_user_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,NULL,$9,$10,$11)
        RETURNING *
      `,
      [
        current.operating_company_id,
        current.team_name,
        current.primary_driver_id,
        current.secondary_driver_id,
        input.split_method,
        shares.primary,
        shares.co,
        newEffectiveFrom,
        input.reactivate !== false,
        input.notes?.trim() ?? current.notes ?? null,
        userId,
      ]
    );
    const next = inserted.rows[0];
    await appendCrudAudit(
      client,
      userId,
      "mdata.driver_team.split_changed",
      {
        resource_type: "mdata.driver_teams",
        resource_id: next.id,
        previous_team_id: current.id,
        operating_company_id: input.operating_company_id,
        split_method: input.split_method,
        primary_share_pct: shares.primary,
        co_share_pct: shares.co,
        effective_from: newEffectiveFrom,
      },
      "warning",
      "P5-E3-TEAM-DRIVERS"
    );
    return next;
  });
}

export async function deactivateTeam(
  userId: string,
  input: { operating_company_id: string; team_id: string; reason: string }
) {
  if (!input.reason?.trim()) throw new Error("E_REASON_REQUIRED");
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    await getTeam(client, input.team_id, input.operating_company_id);
    const inProgressRes = await client.query(
      `
        SELECT id
        FROM mdata.loads
        WHERE team_id = $1
          AND status = ANY($2::mdata.load_status_enum[])
          AND soft_deleted_at IS NULL
        LIMIT 1
      `,
      [input.team_id, ACTIVE_LOAD_STATUSES]
    );
    if (inProgressRes.rows[0]?.id) throw new Error("E_TEAM_HAS_IN_PROGRESS_LOADS");
    const updated = await client.query(
      `
        UPDATE mdata.driver_teams
        SET is_active = false,
            effective_to = COALESCE(effective_to, CURRENT_DATE),
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
        RETURNING *
      `,
      [input.team_id, input.operating_company_id]
    );
    const row = updated.rows[0];
    if (!row) throw new Error("E_TEAM_NOT_FOUND");
    await appendCrudAudit(
      client,
      userId,
      "mdata.driver_team.deactivated",
      {
        resource_type: "mdata.driver_teams",
        resource_id: row.id,
        operating_company_id: input.operating_company_id,
        reason: input.reason.trim(),
      },
      "warning",
      "P5-E3-TEAM-DRIVERS"
    );
    return row;
  });
}

export async function assignTeamToLoad(
  userId: string,
  input: { operating_company_id: string; load_id: string; team_id: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    const team = await getTeam(client, input.team_id, input.operating_company_id);
    if (!team.is_active) throw new Error("E_TEAM_NOT_ACTIVE");

    const loadRes = await client.query(
      `
        SELECT id, assigned_primary_driver_id, team_id
        FROM mdata.loads
        WHERE id = $1
          AND operating_company_id = $2
          AND soft_deleted_at IS NULL
        LIMIT 1
      `,
      [input.load_id, input.operating_company_id]
    );
    const load = loadRes.rows[0];
    if (!load) throw new Error("E_LOAD_NOT_FOUND");
    if (load.assigned_primary_driver_id) throw new Error("E_LOAD_ALREADY_SOLO_ASSIGNED");

    const updated = await client.query(
      `
        UPDATE mdata.loads
        SET team_id = $2,
            assigned_primary_driver_id = NULL
        WHERE id = $1
        RETURNING id, team_id
      `,
      [input.load_id, input.team_id]
    );
    return updated.rows[0];
  });
}

export async function computeTeamLoadSplit(userId: string, input: { operating_company_id: string; load_id: string }) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    const loadRes = await client.query(
      `
        SELECT id, operating_company_id, team_id, assigned_primary_driver_id, rate_total_cents
        FROM mdata.loads
        WHERE id = $1
          AND operating_company_id = $2
          AND soft_deleted_at IS NULL
        LIMIT 1
      `,
      [input.load_id, input.operating_company_id]
    );
    const load = loadRes.rows[0];
    if (!load) throw new Error("E_LOAD_NOT_FOUND");
    if (!load.team_id) throw new Error("E_LOAD_NOT_TEAM_ASSIGNED");
    if (load.assigned_primary_driver_id) throw new Error("E_LOAD_XOR_VIOLATION");

    const postedRes = await client.query(
      `
        SELECT id
        FROM driver_finance.team_settlement_splits
        WHERE load_id = $1
          AND applied_to_settlement_id IS NOT NULL
        LIMIT 1
      `,
      [input.load_id]
    );
    if (postedRes.rows[0]?.id) throw new Error("E_SETTLEMENT_POSTED_SPLIT_IMMUTABLE");

    const team = await getTeam(client, String(load.team_id), input.operating_company_id);
    const totalCents = Number(load.rate_total_cents ?? 0);
    let primaryPct = Number(team.primary_share_pct ?? 50);
    let coPct = Number(team.co_share_pct ?? 50);
    let warning: string | null = null;

    if (team.split_method === "50_50") {
      primaryPct = 50;
      coPct = 50;
    } else if (team.split_method === "60_40") {
      primaryPct = 60;
      coPct = 40;
    } else if (team.split_method === "70_30") {
      primaryPct = 70;
      coPct = 30;
    } else if (team.split_method === "mileage_prorated" || team.split_method === "hours_prorated") {
      primaryPct = 100;
      coPct = 0;
      warning = `${team.split_method}_stubbed_to_primary_100`;
    }

    const primaryPay = roundMoneyCents((totalCents * primaryPct) / 100);
    const coPay = Math.max(0, totalCents - primaryPay);

    await client.query(
      `
        INSERT INTO driver_finance.team_settlement_splits (
          operating_company_id, load_id, team_id, driver_id, pay_role,
          split_method, share_pct, total_load_pay_cents, driver_pay_cents
        ) VALUES
          ($1,$2,$3,$4,'primary',$5,$6,$7,$8),
          ($1,$2,$3,$9,'co',$5,$10,$7,$11)
        ON CONFLICT (load_id, driver_id) DO UPDATE
        SET split_method = EXCLUDED.split_method,
            share_pct = EXCLUDED.share_pct,
            total_load_pay_cents = EXCLUDED.total_load_pay_cents,
            driver_pay_cents = EXCLUDED.driver_pay_cents,
            computed_at = now()
      `,
      [
        input.operating_company_id,
        input.load_id,
        team.id,
        team.primary_driver_id,
        team.split_method,
        primaryPct,
        totalCents,
        primaryPay,
        team.secondary_driver_id,
        coPct,
        coPay,
      ]
    );

    if (warning) {
      await appendCrudAudit(
        client,
        userId,
        "mdata.driver_team.split_changed",
        {
          resource_type: "mdata.driver_teams",
          resource_id: team.id,
          operating_company_id: input.operating_company_id,
          warning,
          load_id: input.load_id,
        },
        "warning",
        "P5-E3-TEAM-DRIVERS"
      );
    }

    const rows = await client.query(
      `
        SELECT *
        FROM driver_finance.team_settlement_splits
        WHERE load_id = $1
        ORDER BY pay_role DESC
      `,
      [input.load_id]
    );
    return { load_id: input.load_id, team_id: team.id, total_load_pay_cents: totalCents, splits: rows.rows };
  });
}
