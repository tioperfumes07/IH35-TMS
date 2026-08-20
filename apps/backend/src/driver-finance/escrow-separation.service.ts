// BLOCK-02 — Driver Escrow: >=90-day post-separation return path.
//
// Reuses the EXISTING Block-23 escrow ledger/posting engine end-to-end (accounting/escrow/service.ts's
// releaseEscrow()) — this file adds NO new GL math. It only (a) tracks a driver's separation date + the
// 90-day eligibility gate in driver_finance.driver_escrow_separations, and (b) computes the net-of-damage
// amount to release, then hands that single number to the existing, already-tested releaseEscrow() call
// (Dr escrow-liability / Cr cash_clearing).
//
// Damage-claim netting: driver_finance.driver_settlement_deductions rows with
// deduction_type='escrow_load_abandonment' and a remaining (unrecovered-from-pay) balance are the
// CPA-locked "pay-first-then-escrow" fallback (memory audit-fix-decisions-2026-07-04) — i.e. exactly the
// claims that pay-recovery could NOT fully collect before the driver separated. Those reduce what's
// returned to the driver. The RETAINED portion is recorded for visibility only; this build does NOT
// auto-post a forfeiture/write-off JE for it (see docs/accounting/BLOCK-02-DRIVER-ESCROW-DESIGN.md —
// deferred CPA decision on which existing recovery account to credit).

import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { releaseEscrowOnClient } from "../accounting/escrow/service.js";
import {
  DRIVER_ESCROW_SEPARATION_RETURN_FLAG_KEY,
  computeNetEscrowReturn,
  daysUntilEligible,
  isEligibleForRelease,
} from "./escrow-separation.math.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type DriverEscrowSeparationRow = {
  id: string;
  operating_company_id: string;
  driver_id: string;
  escrow_account_id: string;
  separation_date: string;
  eligible_release_date: string;
  escrow_balance_at_separation_cents: number;
  outstanding_damage_claims_cents: number | null;
  released_amount_cents: number | null;
  retained_for_damages_cents: number | null;
  status: "pending" | "eligible" | "released" | "waived";
  released_posting_id: string | null;
  released_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function cents(value: unknown): number {
  return Math.round(Number(value ?? 0));
}

async function setCompanyScope(client: DbClient, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
}

/** Sum of still-unrecovered escrow-linked damage-claim deductions (the pay-first-then-escrow fallback). */
export async function computeOutstandingDamageClaimsCents(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string
): Promise<number> {
  const res = await client.query<{ total: number | string | null }>(
    `
      SELECT COALESCE(SUM(remaining_balance_cents), 0)::bigint AS total
      FROM driver_finance.driver_settlement_deductions
      WHERE operating_company_id = $1::uuid
        AND driver_id = $2::uuid
        AND deduction_type = 'escrow_load_abandonment'
        AND status IN ('pending', 'partial', 'deferred')
        AND remaining_balance_cents > 0
    `,
    [operatingCompanyId, driverId]
  );
  return cents(res.rows[0]?.total);
}

async function findDriverBondEscrowAccount(client: DbClient, operatingCompanyId: string, driverId: string) {
  const res = await client.query<{ id: string; balance_cents: number | string }>(
    `
      SELECT id::text, balance_cents::bigint
      FROM accounting.escrow_accounts
      WHERE operating_company_id = $1::uuid
        AND holder_id = $2::uuid
        AND holder_type = 'driver'
        AND purpose = 'driver_bond'
      LIMIT 1
    `,
    [operatingCompanyId, driverId]
  );
  return res.rows[0] ?? null;
}

/**
 * Record a driver's separation (resign/fire/termination) so the 90-day return clock starts. Requires the
 * driver to actually be terminated (mdata.drivers.status='Terminated' + deactivated_at set — the locked
 * status/deactivated_at consistency invariant from 202606161300). No-op (returns null) when the driver has
 * no driver_bond escrow account yet (nothing ever withheld — nothing to track/return).
 * Idempotent: the partial unique index (operating_company_id, driver_id) WHERE status IN
 * ('pending','eligible') means a re-call while one is still open just returns the existing open row.
 */
export async function recordDriverEscrowSeparation(
  input: { operating_company_id: string; driver_id: string },
  actor: { userId: string; role: string }
): Promise<{ separation: DriverEscrowSeparationRow; created: boolean } | { separation: null; reason: "not_terminated" | "no_escrow_account" }> {
  return withCurrentUser(actor.userId, async (client) => {
    await setCompanyScope(client, input.operating_company_id);

    const driverRes = await client.query<{ status: string; deactivated_at: string | null }>(
      `
        SELECT status::text, deactivated_at::text
        FROM mdata.drivers
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.driver_id, input.operating_company_id]
    );
    const driver = driverRes.rows[0];
    if (!driver || driver.status !== "Terminated" || !driver.deactivated_at) {
      return { separation: null, reason: "not_terminated" as const };
    }

    const existingOpen = await client.query<DriverEscrowSeparationRow>(
      `
        SELECT id::text, operating_company_id::text, driver_id::text, escrow_account_id::text,
               separation_date::text, eligible_release_date::text,
               escrow_balance_at_separation_cents::bigint, outstanding_damage_claims_cents::bigint,
               released_amount_cents::bigint, retained_for_damages_cents::bigint,
               status::text, released_posting_id::text, released_at::text, notes,
               created_at::text, updated_at::text
        FROM driver_finance.driver_escrow_separations
        WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid
          AND status IN ('pending','eligible') AND is_active
        LIMIT 1
      `,
      [input.operating_company_id, input.driver_id]
    );
    if (existingOpen.rows[0]) {
      return { separation: existingOpen.rows[0] as unknown as DriverEscrowSeparationRow, created: false };
    }

    const escrowAccount = await findDriverBondEscrowAccount(client, input.operating_company_id, input.driver_id);
    if (!escrowAccount) return { separation: null, reason: "no_escrow_account" as const };

    const separationDate = driver.deactivated_at.slice(0, 10);
    const inserted = await client.query<DriverEscrowSeparationRow>(
      `
        INSERT INTO driver_finance.driver_escrow_separations (
          operating_company_id, driver_id, escrow_account_id,
          separation_date, escrow_balance_at_separation_cents, created_by_user_id
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::bigint, $6::uuid)
        RETURNING
          id::text, operating_company_id::text, driver_id::text, escrow_account_id::text,
          separation_date::text, eligible_release_date::text,
          escrow_balance_at_separation_cents::bigint, outstanding_damage_claims_cents::bigint,
          released_amount_cents::bigint, retained_for_damages_cents::bigint,
          status::text, released_posting_id::text, released_at::text, notes,
          created_at::text, updated_at::text
      `,
      [input.operating_company_id, input.driver_id, escrowAccount.id, separationDate, cents(escrowAccount.balance_cents), actor.userId]
    );
    const separation = inserted.rows[0];
    if (!separation) throw new Error("driver_escrow_separation_insert_failed");

    await appendCrudAudit(
      client,
      actor.userId,
      "driver_finance.escrow_separation.recorded",
      {
        resource_type: "driver_finance.driver_escrow_separations",
        resource_id: separation.id,
        operating_company_id: input.operating_company_id,
        driver_id: input.driver_id,
        escrow_account_id: escrowAccount.id,
        separation_date: separationDate,
        eligible_release_date: separation.eligible_release_date,
        escrow_balance_at_separation_cents: cents(escrowAccount.balance_cents),
      },
      "info",
      "BLOCK-02"
    );

    return { separation, created: true };
  });
}

/** Forward link: driver -> most recent separation record (+ linked escrow account/balance). */
export async function getDriverEscrowSeparation(
  operatingCompanyId: string,
  driverId: string,
  actorUserId: string
): Promise<DriverEscrowSeparationRow | null> {
  return withCurrentUser(actorUserId, async (client) => {
    await setCompanyScope(client, operatingCompanyId);
    const res = await client.query<DriverEscrowSeparationRow>(
      `
        SELECT id::text, operating_company_id::text, driver_id::text, escrow_account_id::text,
               separation_date::text, eligible_release_date::text,
               escrow_balance_at_separation_cents::bigint, outstanding_damage_claims_cents::bigint,
               released_amount_cents::bigint, retained_for_damages_cents::bigint,
               status::text, released_posting_id::text, released_at::text, notes,
               created_at::text, updated_at::text
        FROM driver_finance.driver_escrow_separations
        WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid AND is_active
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [operatingCompanyId, driverId]
    );
    return res.rows[0] ?? null;
  });
}

/** Owner/Accountant queue: separations whose 90-day hold has elapsed and are still awaiting release. */
export async function listEligibleDriverEscrowReturns(operatingCompanyId: string, actorUserId: string) {
  return withCurrentUser(actorUserId, async (client) => {
    await setCompanyScope(client, operatingCompanyId);
    const res = await client.query<
      DriverEscrowSeparationRow & { driver_name: string | null; current_balance_cents: number }
    >(
      `
        SELECT s.id::text, s.operating_company_id::text, s.driver_id::text, s.escrow_account_id::text,
               s.separation_date::text, s.eligible_release_date::text,
               s.escrow_balance_at_separation_cents::bigint, s.outstanding_damage_claims_cents::bigint,
               s.released_amount_cents::bigint, s.retained_for_damages_cents::bigint,
               s.status::text, s.released_posting_id::text, s.released_at::text, s.notes,
               s.created_at::text, s.updated_at::text,
               (d.first_name || ' ' || d.last_name) AS driver_name,
               ea.balance_cents::bigint AS current_balance_cents
        FROM driver_finance.driver_escrow_separations s
        LEFT JOIN mdata.drivers d ON d.id = s.driver_id AND d.operating_company_id = s.operating_company_id
        LEFT JOIN accounting.escrow_accounts ea ON ea.id = s.escrow_account_id
        WHERE s.operating_company_id = $1::uuid
          AND s.status IN ('pending','eligible')
          AND s.is_active
        ORDER BY s.eligible_release_date ASC
      `,
      [operatingCompanyId]
    );
    return res.rows.map((row) => ({
      ...row,
      eligible_now: isEligibleForRelease(row.eligible_release_date),
    }));
  });
}

export type ReleaseResult =
  | { result: "skipped_flag_off" }
  | { result: "not_eligible"; days_remaining: number }
  | {
      result: "released";
      separation: DriverEscrowSeparationRow;
      net_release_cents: number;
      retained_for_damages_cents: number;
      released_posting_id: string | null;
    };

/**
 * Release a driver's escrow balance >=90 days after separation, net of any outstanding (unrecovered)
 * damage-claim deductions. Flag-gated (default OFF => no-op). The actual cash release reuses the
 * EXISTING releaseEscrow() (Block-23) unchanged — zero new GL math.
 */
export async function releaseDriverEscrowSeparation(
  input: { operating_company_id: string; separation_id: string },
  actor: { userId: string; role: string }
): Promise<ReleaseResult> {
  if (actor.role !== "Owner") {
    throw new Error("E_OWNER_ONLY: driver escrow separation release is Owner-only");
  }

  return withCurrentUser(actor.userId, async (client) => {
    await setCompanyScope(client, input.operating_company_id);

    const flagOn = await isEnabled(client as never, DRIVER_ESCROW_SEPARATION_RETURN_FLAG_KEY, {
      operating_company_id: input.operating_company_id,
      user_uuid: actor.userId,
    });
    if (!flagOn) return { result: "skipped_flag_off" as const };

    const sepRes = await client.query<DriverEscrowSeparationRow>(
      `
        SELECT id::text, operating_company_id::text, driver_id::text, escrow_account_id::text,
               separation_date::text, eligible_release_date::text,
               escrow_balance_at_separation_cents::bigint, outstanding_damage_claims_cents::bigint,
               released_amount_cents::bigint, retained_for_damages_cents::bigint,
               status::text, released_posting_id::text, released_at::text, notes,
               created_at::text, updated_at::text
        FROM driver_finance.driver_escrow_separations
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        FOR UPDATE
      `,
      [input.separation_id, input.operating_company_id]
    );
    const separation = sepRes.rows[0];
    if (!separation) throw new Error("E_NOT_FOUND: driver escrow separation not found");
    if (!["pending", "eligible"].includes(separation.status)) {
      throw new Error(`E_ALREADY_RESOLVED: separation already ${separation.status}`);
    }

    if (!isEligibleForRelease(separation.eligible_release_date)) {
      return { result: "not_eligible" as const, days_remaining: daysUntilEligible(separation.eligible_release_date) };
    }

    const balRes = await client.query<{ balance_cents: number }>(
      `SELECT balance_cents::bigint FROM accounting.escrow_accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [separation.escrow_account_id, input.operating_company_id]
    );
    const currentBalanceCents = cents(balRes.rows[0]?.balance_cents);
    const outstandingDamageCents = await computeOutstandingDamageClaimsCents(client, input.operating_company_id, separation.driver_id);
    const net = computeNetEscrowReturn(currentBalanceCents, outstandingDamageCents);

    let releasedPostingId: string | null = null;
    if (net.net_release_cents > 0) {
      // ACCT-F5644 — releaseEscrowOnClient posts on THIS client, atomic with the FOR UPDATE lock
      // already held above and the status/balance-stamp UPDATE below. The prior releaseEscrow() call
      // opened its own, second connection and committed the GL release independently — a failure
      // between that inner commit and this function's own outer commit left the escrow cash genuinely
      // released (GL posted, balance_cents decremented) while this separation row rolled back to
      // pending/eligible with released_amount_cents unset; a retry would then compute net_release_cents
      // against the ALREADY-drained balance (likely $0), permanently mis-recording how much escrow was
      // actually returned to a separated driver.
      const released = await releaseEscrowOnClient(
        client,
        {
          operating_company_id: input.operating_company_id,
          escrow_account_id: separation.escrow_account_id,
          amount_cents: net.net_release_cents,
          source_type: "manual",
          source_id: separation.id,
          note: `Driver escrow separation payout (>=90 days post-termination); retained_for_damages_cents=${net.retained_for_damages_cents}`,
        },
        { userId: actor.userId, role: actor.role }
      );
      releasedPostingId = released.posting.id;
    }

    const updated = await client.query<DriverEscrowSeparationRow>(
      `
        UPDATE driver_finance.driver_escrow_separations
        SET status = 'released',
            outstanding_damage_claims_cents = $2::bigint,
            released_amount_cents = $3::bigint,
            retained_for_damages_cents = $4::bigint,
            released_posting_id = $5::uuid,
            released_at = now()
        WHERE id = $1::uuid
        RETURNING
          id::text, operating_company_id::text, driver_id::text, escrow_account_id::text,
          separation_date::text, eligible_release_date::text,
          escrow_balance_at_separation_cents::bigint, outstanding_damage_claims_cents::bigint,
          released_amount_cents::bigint, retained_for_damages_cents::bigint,
          status::text, released_posting_id::text, released_at::text, notes,
          created_at::text, updated_at::text
      `,
      [separation.id, net.outstanding_damage_claims_cents, net.net_release_cents, net.retained_for_damages_cents, releasedPostingId]
    );
    const finalRow = updated.rows[0]!;

    await appendCrudAudit(
      client,
      actor.userId,
      "driver_finance.escrow_separation.released",
      {
        resource_type: "driver_finance.driver_escrow_separations",
        resource_id: separation.id,
        operating_company_id: input.operating_company_id,
        driver_id: separation.driver_id,
        escrow_account_id: separation.escrow_account_id,
        net_release_cents: net.net_release_cents,
        retained_for_damages_cents: net.retained_for_damages_cents,
        outstanding_damage_claims_cents: net.outstanding_damage_claims_cents,
        released_posting_id: releasedPostingId,
      },
      "warning",
      "BLOCK-02"
    );

    return {
      result: "released" as const,
      separation: finalRow,
      net_release_cents: net.net_release_cents,
      retained_for_damages_cents: net.retained_for_damages_cents,
      released_posting_id: releasedPostingId,
    };
  });
}
