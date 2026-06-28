import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { createSettlementDeduction, type Queryable } from "../driver-finance/deductions.service.js";

/**
 * Driver Hub — Requests review surface.
 *
 * Manager/Owner approve/deny driver-submitted cash advance requests. On approve
 * the repayment is recorded as a one-time settlement deduction via the shared
 * createSettlementDeduction() service (PR #683) — the same approve->deduction
 * pattern as the escrow approvePendingDeduction() flow. There are NO raw SQL
 * deduction inserts here; the deduction is created ONLY through that service.
 *
 * Double-approve protection comes from the cash_advance_requests status guard
 * (pending/under_review -> approved/denied) taken under FOR UPDATE inside the
 * caller's transaction (withCurrentUser BEGIN/COMMIT), mirroring escrow.
 *
 * The pre-existing driver-finance office approve flow (which books a full
 * advance + recurring deduction_schedule via createDriverCashAdvanceCore) is
 * intentionally left untouched. Both surfaces share this same status guard, so
 * a given request can be actioned exactly once across either surface.
 */

export type QueryableClient = Queryable;

export const hubApproveBodySchema = z.object({
  approval_notes: z.string().trim().max(4000).optional(),
});

export const hubDenyBodySchema = z.object({
  denial_reason: z.string().trim().min(1).max(4000),
});

const ACTIONABLE_STATUSES = ["pending", "under_review"] as const;

type CashAdvanceRequestLockRow = {
  id: string;
  driver_id: string;
  display_id: string;
  status: string;
  requested_amount_cents: string | number;
  expires_at: string;
  is_above_policy: boolean;
  load_id: string | null | undefined;
};

async function resolveActorLabel(client: QueryableClient, userUuid: string): Promise<string | null> {
  const r = await client.query<{ email: string | null }>(
    `SELECT email::text AS email FROM identity.users WHERE id = $1 LIMIT 1`,
    [userUuid]
  );
  const email = r.rows[0]?.email;
  return email ? String(email) : null;
}

async function appendRequestAudit(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    requestId: string;
    eventType: string;
    payload?: Record<string, unknown>;
    actorUserId: string;
    actorName: string | null;
  }
) {
  await client.query(
    `
      INSERT INTO driver_finance.cash_advance_request_audit (
        operating_company_id,
        request_id,
        event_type,
        event_payload,
        actor_user_id,
        actor_name
      ) VALUES ($1, $2, $3, $4::jsonb, $5, $6)
    `,
    [
      args.operatingCompanyId,
      args.requestId,
      args.eventType,
      JSON.stringify(args.payload ?? {}),
      args.actorUserId,
      args.actorName,
    ]
  );
}

export async function listPendingHubCashAdvanceRequests(client: QueryableClient, operatingCompanyId: string) {
  const res = await client.query<Record<string, unknown>>(
    `
      SELECT
        r.id,
        r.display_id,
        r.driver_id,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name,
        r.requested_amount_cents,
        r.reason,
        r.proposed_recovery_per_settlement_cents,
        r.status,
        r.is_above_policy,
        r.submitted_via,
        r.submitted_at,
        r.expires_at
      FROM driver_finance.cash_advance_requests r
      JOIN mdata.drivers d ON d.id = r.driver_id
      WHERE r.operating_company_id = $1
        AND r.status IN ('pending', 'under_review')
      ORDER BY r.is_above_policy ASC, r.submitted_at ASC
      LIMIT 500
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

export type HubApproveResult =
  | { ok: true; request: Record<string, unknown>; deduction: Record<string, unknown> }
  | { ok: false; error: "not_found" | "not_approvable" | "expired" };

export async function approveHubCashAdvanceRequest(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    requestId: string;
    actorUserId: string;
    body: z.infer<typeof hubApproveBodySchema>;
  }
): Promise<HubApproveResult> {
  const input = hubApproveBodySchema.parse(args.body);

  const lock = await client.query<CashAdvanceRequestLockRow>(
    `
      SELECT id, driver_id, display_id, status, requested_amount_cents, expires_at::text AS expires_at, is_above_policy
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1 AND id = $2
      FOR UPDATE
    `,
    [args.operatingCompanyId, args.requestId]
  );
  const row = lock.rows[0];
  if (!row) return { ok: false, error: "not_found" };
  if (!ACTIONABLE_STATUSES.includes(row.status as (typeof ACTIONABLE_STATUSES)[number])) {
    return { ok: false, error: "not_approvable" };
  }
  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    return { ok: false, error: "expired" };
  }

  const amountCents = Number(row.requested_amount_cents);
  const notes = input.approval_notes?.trim() || null;
  const reason = notes
    ? `Cash advance repayment — request ${row.display_id} (notes: ${notes})`
    : `Cash advance repayment — request ${row.display_id}`;

  // No raw SQL deduction insert — created ONLY via the shared service.
  const deduction = await createSettlementDeduction(client, {
    driverId: String(row.driver_id),
    operatingCompanyId: args.operatingCompanyId,
    amountCents,
    reason,
    sourceType: "cash_advance_repayment",
    // load_id-direct: driver-initiated requests are usually load-less (null), but carry it if present.
    loadId: (row.load_id as string | null | undefined) ?? null,
    createdByUserId: args.actorUserId,
  });

  const upd = await client.query<Record<string, unknown>>(
    `
      UPDATE driver_finance.cash_advance_requests
      SET
        status = 'approved',
        reviewed_at = now(),
        reviewed_by_user_id = $3,
        approval_notes = $4,
        denial_reason = NULL
      WHERE operating_company_id = $1 AND id = $2
      RETURNING *
    `,
    [args.operatingCompanyId, args.requestId, args.actorUserId, notes]
  );
  const updated = upd.rows[0]!;

  const actorName = await resolveActorLabel(client, args.actorUserId);
  await appendRequestAudit(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId: args.requestId,
    eventType: "cash_advance_request_approved_driver_hub",
    payload: {
      display_id: row.display_id,
      resulting_deduction_id: deduction.id,
      amount_cents: amountCents,
      approval_notes: notes,
      surface: "driver_hub",
    },
    actorUserId: args.actorUserId,
    actorName,
  });
  await appendCrudAudit(
    client,
    args.actorUserId,
    "driver_finance.cash_advance_request.approved",
    {
      request_id: args.requestId,
      display_id: row.display_id,
      driver_id: String(row.driver_id),
      resulting_deduction_id: deduction.id,
      amount_cents: amountCents,
      surface: "driver_hub",
    },
    "info",
    "BLOCK7-DRIVER-HUB-REQUESTS"
  );

  return { ok: true, request: updated, deduction: deduction as unknown as Record<string, unknown> };
}

export type HubDenyResult =
  | { ok: true; request: Record<string, unknown> }
  | { ok: false; error: "not_found" | "not_deniable" };

export async function denyHubCashAdvanceRequest(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    requestId: string;
    actorUserId: string;
    body: z.infer<typeof hubDenyBodySchema>;
  }
): Promise<HubDenyResult> {
  const input = hubDenyBodySchema.parse(args.body);

  const lock = await client.query<CashAdvanceRequestLockRow>(
    `
      SELECT id, driver_id, display_id, status, requested_amount_cents, expires_at::text AS expires_at, is_above_policy
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1 AND id = $2
      FOR UPDATE
    `,
    [args.operatingCompanyId, args.requestId]
  );
  const row = lock.rows[0];
  if (!row) return { ok: false, error: "not_found" };
  if (!ACTIONABLE_STATUSES.includes(row.status as (typeof ACTIONABLE_STATUSES)[number])) {
    return { ok: false, error: "not_deniable" };
  }

  const reason = input.denial_reason.trim();
  const upd = await client.query<Record<string, unknown>>(
    `
      UPDATE driver_finance.cash_advance_requests
      SET
        status = 'denied',
        reviewed_at = now(),
        reviewed_by_user_id = $3,
        denial_reason = $4,
        approval_notes = NULL
      WHERE operating_company_id = $1 AND id = $2
      RETURNING *
    `,
    [args.operatingCompanyId, args.requestId, args.actorUserId, reason]
  );
  const updated = upd.rows[0]!;

  const actorName = await resolveActorLabel(client, args.actorUserId);
  await appendRequestAudit(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId: args.requestId,
    eventType: "cash_advance_request_denied_driver_hub",
    payload: { display_id: row.display_id, denial_reason: reason, surface: "driver_hub" },
    actorUserId: args.actorUserId,
    actorName,
  });
  await appendCrudAudit(
    client,
    args.actorUserId,
    "driver_finance.cash_advance_request.denied",
    {
      request_id: args.requestId,
      display_id: row.display_id,
      driver_id: String(row.driver_id),
      surface: "driver_hub",
    },
    "info",
    "BLOCK7-DRIVER-HUB-REQUESTS"
  );

  return { ok: true, request: updated };
}
