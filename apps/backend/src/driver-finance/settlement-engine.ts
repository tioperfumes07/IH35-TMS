import type { TeamSplitMethod } from "../mdata/driver-team.service.js";
import { normalizeShares } from "../mdata/driver-team.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

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
        AND operating_company_id = $2::uuid
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
        AND operating_company_id = $2::uuid
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
    operatingCompanyId: string;
    driverId: string;
    loadId: string;
    teamId?: string | null;
    lineType?: "earnings" | "team_split_primary" | "team_split_secondary";
    /** ACCT-F206 — real actor for the skip audit; an actor-less audit row is its own defect. */
    actorUserId?: string | null;
  }
): Promise<void> {
  const reg = await client.query<{ ok: boolean }>(`SELECT to_regclass('driver_finance.settlement_lines') IS NOT NULL AS ok`);
  if (!reg.rows[0]?.ok) return;

  // SETL-F10164 — the settlement is the canonical real-vs-sample parent. Derive the child flag from
  // that row under the same company scope; accepting a caller boolean would let a sample settlement
  // mint a line that reports as real money (the exact live failure this closes).
  const settlementRes = await client.query<{ is_sample_data: boolean }>(
    `
      SELECT is_sample_data
      FROM driver_finance.driver_settlements
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.settlementId, input.operatingCompanyId]
  );
  const settlement = settlementRes.rows[0];
  if (!settlement) return;

  const billRes = await client.query<{ id: string; gross_amount_cents: number | string | null; load_number: string | null }>(
    `
      SELECT id, gross_amount_cents, load_number
      FROM driver_finance.driver_bills
      WHERE load_id = $1
        AND driver_id = $2
        -- ACCT-F206: a VOIDED payable must never become a driver's earnings line. Without this the
        -- newest bill wins regardless of status, and voiding is a status flip that does not move
        -- created_at -- so as soon as the most recent bill for a load is voided and not replaced,
        -- this would pay the driver from a payable the company revoked. Today's three double-billed
        -- loads happen to have the void one FIRST, so the ordering saves it by accident; that is not
        -- a control.
        AND status <> 'void'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.loadId, input.driverId]
  );
  const bill = billRes.rows[0];
  if (!bill?.id) {
    // ACCT-F206: RECORD THE SKIP -- do not return silently.
    //
    // This is the leg that decides whether the driver is paid at all, and it was the ONLY silent one
    // in this close path: settlements-load-bookended.service.ts explicitly calls recordPostingFlagSkip
    // on both the contract-terms and the deduction legs "so the settlement close is never a silent
    // no-op on this leg". The earnings leg had a bare `return`.
    //
    // The consequence is measured on prod: settlements d3ff8ea3 and c7422acc are both status='closed'
    // with ZERO settlement_lines, for loads that never got a driver bill. The driver worked the load
    // and is marked settled having been paid nothing, and there is no record anywhere saying why.
    // A $0 settlement must be COUNTABLE, not invisible.
    await appendCrudAudit(
      client as never,
      String(input.actorUserId ?? ""),
      "driver_finance.settlement_line.skipped_no_eligible_driver_bill",
      {
        resource_type: "driver_finance.settlement_lines",
        settlement_id: input.settlementId,
        driver_id: input.driverId,
        load_id: input.loadId,
        reason:
          "no non-voided driver_bills row for this driver/load, so the settlement has no earnings " +
          "line to append. The settlement still closes; this records that it closes EMPTY for this " +
          "load rather than leaving a $0 settlement unexplained.",
      },
      "warning",
      "ACCT-F206"
    );
    return;
  }

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
  // P36 — settlement_lines.load_id (202607430000) sat unwritten by every INSERT site. This is the
  // earnings-line site: the load is already known (it is how the eligible driver_bills row was found),
  // so there is no excuse for the FK to be NULL. Feature-detected like the two checks above rather than
  // assumed, so this function keeps working against a DB that predates the column.
  const hasLoadCol = await client.query<{ ok: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'driver_finance'
          AND table_name = 'settlement_lines'
          AND column_name = 'load_id'
      ) AS ok
    `
  );

  const lineType = input.lineType ?? "earnings";
  const loadCols = hasLoadCol.rows[0]?.ok ? [", load_id"] : [];
  const loadColPlaceholder = (n: number) => (hasLoadCol.rows[0]?.ok ? [`,$${n}::uuid`] : []);
  const loadParam = hasLoadCol.rows[0]?.ok ? [input.loadId] : [];

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
            source_driver_bill_id${loadCols.join("")}, is_sample_data
          )
          VALUES ($1,$2,$3,$4,$5::uuid,$6::uuid${loadColPlaceholder(7).join("")},$${hasLoadCol.rows[0]?.ok ? 8 : 7}::boolean)
          ON CONFLICT (source_driver_bill_id) WHERE source_driver_bill_id IS NOT NULL DO NOTHING
        `,
        [input.settlementId, lineType, description, dollars, input.teamId ?? null, bill.id, ...loadParam, settlement.is_sample_data]
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
          source_driver_bill_id${loadCols.join("")}, is_sample_data
        )
        VALUES ($1,$2,$3,$4,$5::uuid${loadColPlaceholder(6).join("")},$${hasLoadCol.rows[0]?.ok ? 7 : 6}::boolean)
        ON CONFLICT (source_driver_bill_id) WHERE source_driver_bill_id IS NOT NULL DO NOTHING
      `,
      [input.settlementId, lineType, description, dollars, bill.id, ...loadParam, settlement.is_sample_data]
    );
    return;
  }

  if (hasTeamCol.rows[0]?.ok) {
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount, team_id${loadCols.join("")}, is_sample_data)
        SELECT $1,$2,$3,$4,$5::uuid${loadColPlaceholder(6).join("")},$${hasLoadCol.rows[0]?.ok ? 7 : 6}::boolean
        WHERE NOT EXISTS (
          SELECT 1
          FROM driver_finance.settlement_lines sl
          WHERE sl.settlement_id = $1::uuid
            AND sl.description = $3
            AND sl.line_type = $2
        )
      `,
      [input.settlementId, lineType, description, dollars, input.teamId ?? null, ...loadParam, settlement.is_sample_data]
    );
    return;
  }

  await client.query(
    `
      INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount${loadCols.join("")}, is_sample_data)
      SELECT $1,$2,$3,$4${loadColPlaceholder(5).join("")},$${hasLoadCol.rows[0]?.ok ? 6 : 5}::boolean
      WHERE NOT EXISTS (
        SELECT 1
        FROM driver_finance.settlement_lines sl
        WHERE sl.settlement_id = $1::uuid
          AND sl.description = $3
          AND sl.line_type = $2
      )
    `,
    [input.settlementId, lineType, description, dollars, ...loadParam, settlement.is_sample_data]
  );
}
