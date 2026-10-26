/** Abandonment chargebacks applied to a settlement. Moved VERBATIM out of abandonment.service.ts (which re-exports it) to break the cycle load-transition -> settlements-load-bookended -> abandonment -> load-transition; this function never transitions a load. No behavior change. */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { resolveSettlementMinNet } from "./settlement-deduction-cap.service.js";
import { forfeitDriverEscrowOnClient } from "./escrow-forfeit.service.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type ApplyAbandonmentChargebacksResult = {
  appliedCount: number;
  appliedCents: number;
  /** Resolved via an escrow forfeiture DRAW (SAF-F01) instead of a settlement_lines deduction. */
  appliedViaEscrowCount: number;
  appliedViaEscrowCents: number;
  deferredCount: number;
  deferredCents: number;
};

/**
 * 00_LOCKED_DECISIONS 9.3 (owner direct instruction, 2026-09-02): "Walkoff/abandonment/damage
 * recoveries deduct from the driver's settlement pay first... fire a single charge per event."
 * Before this, the FULL total_chargeback_cents was applied to settlement pay with NO floor
 * protection at all — a genuine pre-existing gap (this settlement could go arbitrarily far below
 * the owner-locked net-pay floor). Now caps at the SAME floor-derived room
 * settlement-deduction-cap.service.ts computes (gross = earnings-type lines only; floor via
 * resolveSettlementMinNet) — matching that file's own locked "available = gross - floor only"
 * convention (decision C-2-A) rather than coordinating the two pools, which is that file's explicit,
 * deliberate design.
 *
 * The migration 0094 auto-escrow-proposal trigger (dispatch.trg_auto_propose_escrow_on_abandon) is
 * DROPPED in the companion migration (202613530001) — this function is now the ONE path an
 * abandonment/walkoff/no-show cost reaches a driver through, closing the double-charge the owner
 * flagged (this app-level chargeback AND the DB trigger's independent escrow proposal both firing
 * on the same event).
 *
 * ESCROW-SHORTFALL DRAW — RESOLVED 2026-09-03 (was the open question above; kept for history).
 * Live-verified on prod (bypass + n_live_tup completeness discriminator, same txn):
 * accounting.escrow_accounts (22 rows) is the table subledger-gl-control-rec.service.ts actually
 * sums for the "escrow_liability_default" GL-control reconciliation (sumEscrowSubledgerCents reads
 * FROM accounting.escrow_accounts) — that is the one authoritative, GL-reconciled escrow subledger;
 * driver_finance.escrow_balances/escrow_ledger (3 rows) is the driver-facing rollup kept in sync
 * WITH it (escrow-forfeit.service.ts's ESC-FORFEIT-SPLIT already writes both in one transaction, so
 * they never diverge). A DRAW here reuses that exact same, already-built, flag-gated
 * forfeitDriverEscrowOnClient (SAF-F01) — no new GL math. When a chargeback is over the
 * floor-protected settlement-pay room, this now tries a full-amount escrow forfeiture BEFORE
 * deferring: if the driver's escrow can fully cover it (and DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED
 * is on for the entity), the chargeback resolves immediately via escrow instead of rolling to the
 * next settlement. If escrow can't cover it (over_draw) or the flag is off, behavior is UNCHANGED —
 * falls through to the existing floor-protected defer, never partially drawn, never silently dropped.
 */
export async function applyApprovedAbandonmentChargebacksToSettlement(
  client: DbClient,
  input: { settlementId: string; driverId: string; operatingCompanyId: string; actorUserId: string }
): Promise<ApplyAbandonmentChargebacksResult> {
  const empty: ApplyAbandonmentChargebacksResult = {
    appliedCount: 0,
    appliedCents: 0,
    appliedViaEscrowCount: 0,
    appliedViaEscrowCents: 0,
    deferredCount: 0,
    deferredCents: 0,
  };
  const reg = await client.query<{ ok: boolean }>(`SELECT to_regclass('driver_finance.settlement_lines') IS NOT NULL AS ok`);
  if (!reg.rows[0]?.ok) return empty;

  // Same gross/floor shape as settlement-deduction-cap.service.ts's
  // applyPendingDeductionsToSettlementWithNetFloor — gross from earnings-type lines only.
  const grossRes = await client.query<{ gross_cents: string | number | null }>(
    `
      SELECT COALESCE(ROUND(SUM(amount) * 100), 0)::bigint AS gross_cents
      FROM driver_finance.settlement_lines
      WHERE settlement_id = $1
        AND line_type IN ('earnings', 'extra_pay', 'team_split_primary', 'team_split_secondary')
        AND is_active = true
        AND voided_at IS NULL
    `,
    [input.settlementId]
  );
  const grossCents = Math.max(0, Math.round(Number(grossRes.rows[0]?.gross_cents ?? 0)));
  const minNet = await resolveSettlementMinNet(client, input.driverId, input.operatingCompanyId);
  const floorCents = Math.max(Math.round((grossCents * minNet.pct) / 100), minNet.cents);
  let availableCents = Math.max(0, grossCents - floorCents);

  const pending = await client.query<{ id: string; total_chargeback_cents: string | number; load_id: string }>(
    `
      SELECT id, total_chargeback_cents, load_id
      FROM driver_finance.abandonment_chargebacks
      WHERE operating_company_id = $1::uuid
        AND driver_id = $2
        AND status = 'approved'
        AND applied_to_settlement_id IS NULL
      ORDER BY abandonment_event_at ASC
      FOR UPDATE
    `,
    [input.operatingCompanyId, input.driverId]
  );

  const result: ApplyAbandonmentChargebacksResult = { ...empty };
  for (const row of pending.rows) {
    const cents = Math.max(0, Math.round(Number(row.total_chargeback_cents ?? 0)));
    if (cents <= 0) continue;

    if (cents > availableCents) {
      // Over the floor-protected settlement-pay room — try an escrow DRAW (SAF-F01 forfeiture,
      // reused verbatim) before deferring. Full-amount only: a partial forfeiture would leave the
      // chargeback in an ambiguous half-applied state this table has no column to represent, so
      // anything the driver's escrow can't fully cover falls straight through to the existing defer.
      const escrowAttempt = await forfeitDriverEscrowOnClient(
        client,
        {
          operating_company_id: input.operatingCompanyId,
          driver_uuid: input.driverId,
          amount_cents: cents,
          reason: `Abandonment chargeback — load ${row.load_id}`,
        },
        { userId: input.actorUserId, role: "system" }
      );

      if (escrowAttempt.result === "posted") {
        await client.query(
          `
            UPDATE driver_finance.abandonment_chargebacks
            SET status = 'applied',
                applied_to_settlement_id = $2::uuid,
                notes = COALESCE(notes || E'\\n', '') || $3,
                updated_at = now()
            WHERE id = $1::uuid
          `,
          [
            row.id,
            input.settlementId,
            `Resolved via escrow forfeiture (SAF-F01) — journal_entry_id=${escrowAttempt.journal_entry_id}, escrow_posting_id=${escrowAttempt.escrow_posting_id}, amount_cents=${cents}. No settlement_lines row (pay stayed floor-protected).`,
          ]
        );
        result.appliedViaEscrowCount += 1;
        result.appliedViaEscrowCents += cents;
        await appendCrudAudit(
          client,
          input.actorUserId,
          "driver_finance.abandonment_chargeback.applied_via_escrow_draw",
          {
            resource_type: "driver_finance.abandonment_chargebacks",
            resource_id: row.id,
            operating_company_id: input.operatingCompanyId,
            driver_id: input.driverId,
            settlement_id: input.settlementId,
            amount_cents: cents,
            journal_entry_id: escrowAttempt.journal_entry_id,
            escrow_posting_id: escrowAttempt.escrow_posting_id,
          },
          "warning",
          "ACCT-9.3-PAY-FIRST"
        );
        continue;
      }

      // over_draw / flag_off — behavior UNCHANGED from before this DRAW existed: defer (roll to
      // next settlement), never breach the floor, never silently drop it.
      result.deferredCount += 1;
      result.deferredCents += cents;
      await appendCrudAudit(
        client,
        input.actorUserId,
        "driver_finance.abandonment_chargeback.deferred_over_floor",
        {
          resource_type: "driver_finance.abandonment_chargebacks",
          resource_id: row.id,
          operating_company_id: input.operatingCompanyId,
          driver_id: input.driverId,
          settlement_id: input.settlementId,
          amount_cents: cents,
          gross_cents: grossCents,
          floor_cents: floorCents,
          available_cents: availableCents,
          min_net_pct: minNet.pct,
          min_net_cents: minNet.cents,
          escrow_draw_attempt: escrowAttempt.result,
        },
        "warning",
        "ACCT-9.3-PAY-FIRST"
      );
      continue;
    }

    const dollars = cents / 100;

    const loadLabelRes = await client.query<{ load_number: string | null }>(
      `SELECT load_number FROM mdata.loads WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
      [row.load_id, input.operatingCompanyId]
    );
    const loadNumber = loadLabelRes.rows[0]?.load_number ? String(loadLabelRes.rows[0].load_number) : String(row.load_id);

    const lineRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
        VALUES ($1, 'abandonment_chargeback', $2, $3)
        RETURNING id
      `,
      [input.settlementId, `Abandonment chargeback — load ${loadNumber}`, dollars]
    );

    const lineId = lineRes.rows[0]?.id ? String(lineRes.rows[0].id) : "";
    if (!lineId) continue;

    await client.query(
      `
        UPDATE driver_finance.abandonment_chargebacks
        SET settlement_line_id = $2::uuid,
            applied_to_settlement_id = $3::uuid,
            status = 'applied',
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [row.id, lineId, input.settlementId]
    );

    availableCents -= cents;
    result.appliedCount += 1;
    result.appliedCents += cents;
  }

  return result;
}
