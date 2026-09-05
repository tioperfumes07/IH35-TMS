// C6-MONEY-JE-EXEMPT: driver_finance.settlement_lines rows here are settlement-scoped LINE items,
// not independent cash movements — the settlement HEADER posts one aggregate balanced JE at
// finalize via settlement-payrun-close.service.ts's closeSettlementPayRun (createJournalEntry) -- CORRECTED 2026-09-02: postSettlementToGl was RETIRED (SET-01, 2026-07-26), never live in prod (verified 2026-09-02, GO-23 C6).
import type { TeamSplitMethod } from "../mdata/driver-team.service.js";
import { normalizeShares } from "../mdata/driver-team.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { computeCappedEscrowContributionCents, readDriverEscrowBalanceCents } from "./escrow-resolver.service.js";

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
      FOR UPDATE
    `,
    [input.settlementId, input.operatingCompanyId]
  );
  const settlement = settlementRes.rows[0];
  if (!settlement) return;

  const billRes = await client.query<{
    id: string;
    gross_amount_cents: number | string | null;
    load_number: string | null;
    loaded_pay_cents: number | string | null;
    deadhead_pay_cents: number | string | null;
  }>(
    `
      SELECT id, gross_amount_cents, load_number, loaded_pay_cents, deadhead_pay_cents
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

  const loadLabel = String(bill.load_number ?? input.loadId);

  // MILES SPEC (owner 2026-09-02) — "Two lines on the settlement, always": loaded miles and empty
  // (deadhead) miles are never folded into one earnings number. loaded_pay_cents/deadhead_pay_cents
  // are the breakdown driver_bills now snapshots at mint time (book-load.service.ts); a bill minted
  // before this spec (or the fallback resolver path) leaves them NULL, in which case the loaded line
  // carries the bill's whole gross_amount_cents and there is no deadhead line — same behavior as before.
  const grossCents = Math.round(Number(bill.gross_amount_cents ?? 0));
  const loadedCents =
    bill.loaded_pay_cents !== null && bill.loaded_pay_cents !== undefined
      ? Math.round(Number(bill.loaded_pay_cents))
      : grossCents;
  const deadheadCents =
    bill.deadhead_pay_cents !== null && bill.deadhead_pay_cents !== undefined
      ? Math.round(Number(bill.deadhead_pay_cents))
      : 0;
  const hasDeadheadLine = bill.loaded_pay_cents !== null && bill.loaded_pay_cents !== undefined;

  const lineEntries: Array<{ lineType: string; description: string; dollars: number }> = [
    {
      lineType: input.lineType ?? "earnings",
      description: hasDeadheadLine ? `Load ${loadLabel} — Loaded Miles` : `Load ${loadLabel}`,
      dollars: loadedCents / 100,
    },
  ];
  if (hasDeadheadLine) {
    lineEntries.push({
      lineType: "deadhead_pay",
      description: `Load ${loadLabel} — Empty Miles`,
      dollars: deadheadCents / 100,
    });
  }

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

  const loadCols = hasLoadCol.rows[0]?.ok ? [", load_id"] : [];
  const loadColPlaceholder = (n: number) => (hasLoadCol.rows[0]?.ok ? [`,$${n}::uuid`] : []);
  const loadParam = hasLoadCol.rows[0]?.ok ? [input.loadId] : [];

  for (const entry of lineEntries) {
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
            -- MILES SPEC (202613510001) widened this to (source_driver_bill_id, line_type) so a bill
            -- can carry BOTH an 'earnings'/team-split line and a 'deadhead_pay' line without the second
            -- silently dropping.
            ON CONFLICT (source_driver_bill_id, line_type) WHERE source_driver_bill_id IS NOT NULL DO NOTHING
          `,
          [input.settlementId, entry.lineType, entry.description, entry.dollars, input.teamId ?? null, bill.id, ...loadParam, settlement.is_sample_data]
        );
        continue;
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
          ON CONFLICT (source_driver_bill_id, line_type) WHERE source_driver_bill_id IS NOT NULL DO NOTHING
        `,
        [input.settlementId, entry.lineType, entry.description, entry.dollars, bill.id, ...loadParam, settlement.is_sample_data]
      );
      continue;
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
        [input.settlementId, entry.lineType, entry.description, entry.dollars, input.teamId ?? null, ...loadParam, settlement.is_sample_data]
      );
      continue;
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
      [input.settlementId, entry.lineType, entry.description, entry.dollars, ...loadParam, settlement.is_sample_data]
    );
  }
}

/**
 * M.3 — PER-LOAD escrow accrual (owner order 2026-09-05, transferred CC-1 → CC-3). REUSE-AND-EXTEND
 * (escrow-resolver.service.ts's own header law): reuses readDriverEscrowBalanceCents +
 * computeCappedEscrowContributionCents unchanged — this only changes WHEN and how OFTEN the
 * contribution is computed, never the cap math itself.
 *
 * Every real settlement PDF this session (settlements 5773-5782, seeded live) prints escrow as its
 * own $25.00 line PER LOAD, not one flat charge per settlement — DEFAULT_ESCROW_PER_SETTLEMENT_
 * CONTRIBUTION_CENTS (settlement-payrun-close.service.ts's $250.00 flat-per-close amount) never
 * matched that. This appends one 'escrow_contribution' settlement_lines row per load, capped at
 * $2,500 total (ESCROW_CAP_CENTS) same as the flat path, computed against the driver's POSTED escrow
 * balance PLUS whatever this same still-open settlement has already accrued (so three loads in one
 * settlement correctly taper off near the cap instead of each independently re-checking only the
 * posted balance and over-committing). Idempotent per driver_bills row via the same
 * (source_driver_bill_id, line_type) unique constraint appendSettlementLineFromDriverBillIfMissing's
 * own INSERT relies on above — calling this twice for the same load is always a no-op the second
 * time. Contributes $0 (skips the insert) once the cap is reached; never a negative line, never a
 * release. settlement-payrun-close.service.ts's closeSettlementPayRun reads the SUM of these lines
 * as the load_bookended settlement's real escrow contribution at final close, instead of applying
 * its own flat DEFAULT_ESCROW_PER_SETTLEMENT_CONTRIBUTION_CENTS on top (which would double-count) —
 * that constant stays live, unchanged, for the OTHER settlement model that never accrues per load.
 */
export const ESCROW_PER_LOAD_CONTRIBUTION_CENTS = 2_500;

export async function appendEscrowContributionLineIfMissing(
  client: DbClient,
  input: {
    settlementId: string;
    operatingCompanyId: string;
    driverId: string;
    loadId: string;
    actorUserId?: string | null;
  }
): Promise<void> {
  const reg = await client.query<{ ok: boolean }>(`SELECT to_regclass('driver_finance.settlement_lines') IS NOT NULL AS ok`);
  if (!reg.rows[0]?.ok) return;

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

  const billRes = await client.query<{ id: string; load_number: string | null }>(
    `
      SELECT id, load_number
      FROM driver_finance.driver_bills
      WHERE load_id = $1
        AND driver_id = $2
        AND status <> 'void'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.loadId, input.driverId]
  );
  const bill = billRes.rows[0];
  // Mirrors ACCT-F206 above: no eligible driver_bills row means no earnings line either, so there is
  // nothing to accrue escrow against yet. Not an error — the earnings-line append already records the
  // skip; escrow simply has nothing to hang off of until a bill exists.
  if (!bill?.id) return;

  // Already-accrued-but-not-yet-posted lines on THIS still-open settlement count toward the cap the
  // same as the posted balance -- otherwise three loads in one settlement would each independently
  // see the same pre-settlement posted balance and all three would contribute the full $25, blowing
  // past the cap the moment the settlement finally closes and posts the real GL entry.
  const alreadyAccruedRes = await client.query<{ total: string | number | null }>(
    `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM driver_finance.settlement_lines
      WHERE settlement_id = $1::uuid
        AND line_type = 'escrow_contribution'
        AND is_active = true
    `,
    [input.settlementId]
  );
  const alreadyAccruedCents = Math.round(Number(alreadyAccruedRes.rows[0]?.total ?? 0) * 100);

  const postedBalanceCents = await readDriverEscrowBalanceCents(client, input.operatingCompanyId, input.driverId);
  const contributionCents = computeCappedEscrowContributionCents({
    currentBalanceCents: postedBalanceCents + alreadyAccruedCents,
    standardPerSettlementContributionCents: ESCROW_PER_LOAD_CONTRIBUTION_CENTS,
  });
  if (contributionCents <= 0 && input.actorUserId) {
    await appendCrudAudit(
      client as never,
      input.actorUserId,
      "driver_finance.settlement_line.escrow_contribution_skipped_at_cap",
      {
        resource_type: "driver_finance.settlement_lines",
        settlement_id: input.settlementId,
        driver_id: input.driverId,
        load_id: input.loadId,
        posted_balance_cents: postedBalanceCents,
        already_accrued_this_settlement_cents: alreadyAccruedCents,
      },
      "info",
      "M3-ESCROW-PER-LOAD"
    );
  }
  if (contributionCents <= 0) return;

  const loadLabel = String(bill.load_number ?? input.loadId);
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
  const loadCols = hasLoadCol.rows[0]?.ok ? ", load_id" : "";
  const loadColPlaceholder = hasLoadCol.rows[0]?.ok ? ",$6::uuid" : "";
  const loadParam = hasLoadCol.rows[0]?.ok ? [input.loadId] : [];

  await client.query(
    `
      INSERT INTO driver_finance.settlement_lines (
        settlement_id, line_type, description, amount, source_driver_bill_id${loadCols}, is_sample_data
      )
      VALUES ($1,$2,$3,$4,$5::uuid${loadColPlaceholder},$${hasLoadCol.rows[0]?.ok ? 7 : 6}::boolean)
      -- Same (source_driver_bill_id, line_type) uniqueness the earnings/deadhead lines rely on above
      -- (MILES SPEC 202613510001) — a re-run for a load whose escrow line already landed is a no-op.
      ON CONFLICT (source_driver_bill_id, line_type) WHERE source_driver_bill_id IS NOT NULL DO NOTHING
    `,
    [input.settlementId, "escrow_contribution", `Load ${loadLabel} — Escrow Contribution`, contributionCents / 100, bill.id, ...loadParam, settlement.is_sample_data]
  );
}
