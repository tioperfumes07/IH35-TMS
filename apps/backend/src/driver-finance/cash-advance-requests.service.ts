import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { createDriverCashAdvanceCore, resolveCompanyCashAdvanceThresholdDollars } from "../cash-advances/cash-advance-create.js";

export type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export const driverCreateCashAdvanceRequestSchema = z.object({
  requested_amount_cents: z.number().int().positive(),
  reason: z.string().trim().min(10).max(4000),
  proposed_recovery_per_settlement_cents: z.number().int().positive().optional(),
  submitted_via: z.enum(["pwa", "office", "phone"]).default("pwa"),
});

export const officeApproveBodySchema = z.object({
  approval_notes: z.string().trim().max(4000).optional(),
});

export const officeDenyBodySchema = z.object({
  denial_reason: z.string().trim().min(1).max(4000),
});

async function resolveActorLabel(client: QueryableClient, userUuid: string | null | undefined): Promise<string | null> {
  if (!userUuid) return null;
  const r = await client.query(`SELECT email::text AS email FROM identity.users WHERE uuid = $1 LIMIT 1`, [userUuid]);
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
    actorUserId?: string | null;
    actorName?: string | null;
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
      args.actorUserId ?? null,
      args.actorName ?? null,
    ]
  );
}

async function enqueueDriverFinanceOutbox(client: QueryableClient, eventType: string, payload: Record<string, unknown>) {
  await client.query(
    `
      INSERT INTO outbox.events (event_type, payload, next_retry_at)
      VALUES ($1, $2::jsonb, now())
    `,
    [eventType, JSON.stringify(payload)]
  );
}

async function notifyDriverPwaIfAvailable(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    driverId: string;
    title: string;
    message: string;
    payload: Record<string, unknown>;
  }
) {
  const reg = await client.query(`SELECT to_regclass('pwa.driver_notifications') IS NOT NULL AS ok`);
  if (!reg.rows[0]?.ok) return;
  await client.query(
    `
      INSERT INTO pwa.driver_notifications (operating_company_id, driver_id, title, message, payload)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [args.operatingCompanyId, args.driverId, args.title, args.message, JSON.stringify(args.payload)]
  );
}

export async function nextCashAdvanceRequestDisplayId(client: QueryableClient, operatingCompanyId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const y = String(year);
  const rows = await client.query(
    `
      SELECT COALESCE(
        MAX(
          CASE
            WHEN display_id ~ ('^CA-' || $2::text || '-[0-9]{4}$')
            THEN right(display_id, 4)::int
            ELSE 0
          END
        ),
        0
      ) + 1 AS next_n
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1
    `,
    [operatingCompanyId, y]
  );
  const n = Number(rows.rows[0]?.next_n ?? 1);
  return `CA-${y}-${String(n).padStart(4, "0")}`;
}

export function repaymentScheduleFromRequest(row: Record<string, unknown>): {
  weekly_installment_amount: number;
  total_periods: number;
  cadence: "weekly" | "biweekly";
} {
  const totalCents = Number(row.requested_amount_cents ?? 0);
  const proposed = row.proposed_recovery_per_settlement_cents;
  const dollars = totalCents / 100;
  if (proposed != null && Number(proposed) > 0) {
    const prop = Number(proposed);
    const weekly = prop / 100;
    const periods = Math.min(104, Math.max(1, Math.ceil(totalCents / prop)));
    return { weekly_installment_amount: weekly, total_periods: periods, cadence: "weekly" };
  }
  const periods = 8;
  return {
    weekly_installment_amount: Math.max(0.01, Math.round((dollars / periods) * 100) / 100),
    total_periods: periods,
    cadence: "weekly",
  };
}

export async function createCashAdvanceRequest(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    driverId: string;
    actorUserId: string;
    body: z.infer<typeof driverCreateCashAdvanceRequestSchema>;
  }
) {
  const input = driverCreateCashAdvanceRequestSchema.parse(args.body);
  const thresholdDollars = await resolveCompanyCashAdvanceThresholdDollars(client, args.operatingCompanyId);
  const amountDollars = input.requested_amount_cents / 100;
  const isAbovePolicy = amountDollars > thresholdDollars;
  const displayId = await nextCashAdvanceRequestDisplayId(client, args.operatingCompanyId);
  const actorName = await resolveActorLabel(client, args.actorUserId);

  const ins = await client.query(
    `
      INSERT INTO driver_finance.cash_advance_requests (
        operating_company_id,
        driver_id,
        display_id,
        submitted_via,
        requested_amount_cents,
        reason,
        proposed_recovery_per_settlement_cents,
        status,
        is_above_policy
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
      RETURNING *
    `,
    [
      args.operatingCompanyId,
      args.driverId,
      displayId,
      input.submitted_via,
      input.requested_amount_cents,
      input.reason,
      input.proposed_recovery_per_settlement_cents ?? null,
      isAbovePolicy,
    ]
  );
  const row = ins.rows[0]!;
  const requestId = String(row.id);

  await appendRequestAudit(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId,
    eventType: "cash_advance_request_submitted",
    payload: {
      display_id: displayId,
      requested_amount_cents: input.requested_amount_cents,
      is_above_policy: isAbovePolicy,
    },
    actorUserId: args.actorUserId,
    actorName,
  });

  await appendCrudAudit(
    client,
    args.actorUserId,
    "driver_finance.cash_advance_request.submitted",
    {
      request_id: requestId,
      display_id: displayId,
      driver_id: args.driverId,
      requested_amount_cents: input.requested_amount_cents,
      is_above_policy: isAbovePolicy,
    },
    "info"
  );

  await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.submitted", {
    operating_company_id: args.operatingCompanyId,
    request_id: requestId,
    driver_id: args.driverId,
    display_id: displayId,
  });

  await notifyDriverPwaIfAvailable(client, {
    operatingCompanyId: args.operatingCompanyId,
    driverId: args.driverId,
    title: "Cash advance request submitted",
    message: `Request ${displayId} is pending office review.`,
    payload: { request_id: requestId, display_id: displayId, type: "cash_advance_request_submitted" },
  });

  return { request: row };
}

export async function listMyCashAdvanceRequests(client: QueryableClient, operatingCompanyId: string, driverId: string) {
  const res = await client.query(
    `
      SELECT *
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1 AND driver_id = $2
      ORDER BY submitted_at DESC
      LIMIT 100
    `,
    [operatingCompanyId, driverId]
  );
  return res.rows;
}

export async function cancelMyCashAdvanceRequest(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    driverId: string;
    requestId: string;
    actorUserId: string;
  }
) {
  const res = await client.query(
    `
      UPDATE driver_finance.cash_advance_requests
      SET status = 'cancelled_by_driver'
      WHERE operating_company_id = $1
        AND id = $2
        AND driver_id = $3
        AND status = 'pending'
      RETURNING *
    `,
    [args.operatingCompanyId, args.requestId, args.driverId]
  );
  const row = res.rows[0] ?? null;
  if (!row) return null;

  const actorName = await resolveActorLabel(client, args.actorUserId);
  await appendRequestAudit(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId: args.requestId,
    eventType: "cash_advance_request_cancelled_by_driver",
    payload: { display_id: row.display_id },
    actorUserId: args.actorUserId,
    actorName,
  });
  await appendCrudAudit(client, args.actorUserId, "driver_finance.cash_advance_request.cancelled_by_driver", {
    request_id: args.requestId,
    display_id: row.display_id,
  });
  await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.cancelled_by_driver", {
    operating_company_id: args.operatingCompanyId,
    request_id: args.requestId,
    driver_id: args.driverId,
  });

  await notifyDriverPwaIfAvailable(client, {
    operatingCompanyId: args.operatingCompanyId,
    driverId: args.driverId,
    title: "Cash advance request cancelled",
    message: `Request ${String(row.display_id ?? "")} was cancelled.`,
    payload: { request_id: args.requestId, display_id: row.display_id, type: "cash_advance_request_cancelled_by_driver" },
  });

  return row;
}

export async function listPendingCashAdvanceRequests(client: QueryableClient, operatingCompanyId: string) {
  const res = await client.query(
    `
      SELECT
        r.*,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name
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

export async function listCashAdvanceRequests(
  client: QueryableClient,
  operatingCompanyId: string,
  filter: { status?: string | undefined } = {}
) {
  const status = filter.status?.trim();
  const args: unknown[] = [operatingCompanyId];
  let where = `r.operating_company_id = $1`;
  if (
    status &&
    ["pending", "under_review", "approved", "denied", "expired", "cancelled_by_driver"].includes(status)
  ) {
    where += ` AND r.status = $2`;
    args.push(status);
  }
  const res = await client.query(
    `
      SELECT
        r.*,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name
      FROM driver_finance.cash_advance_requests r
      JOIN mdata.drivers d ON d.id = r.driver_id
      WHERE ${where}
      ORDER BY r.submitted_at DESC
      LIMIT 300
    `,
    args
  );
  return res.rows;
}

export async function getCashAdvanceRequestDetail(client: QueryableClient, operatingCompanyId: string, requestId: string) {
  const reqRes = await client.query(
    `
      SELECT
        r.*,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name
      FROM driver_finance.cash_advance_requests r
      JOIN mdata.drivers d ON d.id = r.driver_id
      WHERE r.operating_company_id = $1 AND r.id = $2
      LIMIT 1
    `,
    [operatingCompanyId, requestId]
  );
  const request = reqRes.rows[0] ?? null;
  if (!request) return null;

  const auditRes = await client.query(
    `
      SELECT id, event_type, event_payload, actor_user_id, actor_name, created_at
      FROM driver_finance.cash_advance_request_audit
      WHERE operating_company_id = $1 AND request_id = $2
      ORDER BY id ASC
    `,
    [operatingCompanyId, requestId]
  );

  return { request, audit_log: auditRes.rows };
}

export async function approveCashAdvanceRequest(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    requestId: string;
    actorUserId: string;
    body: z.infer<typeof officeApproveBodySchema>;
  }
) {
  const input = officeApproveBodySchema.parse(args.body);
  const lock = await client.query(
    `
      SELECT *
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1 AND id = $2
      FOR UPDATE
    `,
    [args.operatingCompanyId, args.requestId]
  );
  const row = lock.rows[0] ?? null;
  if (!row) return { error: "not_found" as const };
  const status = String(row.status ?? "");
  if (!["pending", "under_review"].includes(status)) return { error: "not_approvable" as const };
  if (new Date(String(row.expires_at)).getTime() < Date.now()) return { error: "expired" as const };
  if (Boolean(row.is_above_policy)) return { error: "above_policy_requires_owner" as const };

  const driverId = String(row.driver_id);
  const amountDollars = Number(row.requested_amount_cents) / 100;
  const schedule = repaymentScheduleFromRequest(row);

  const core = await createDriverCashAdvanceCore(client, args.actorUserId, args.operatingCompanyId, {
    driver_id: driverId,
    amount: amountDollars,
    purpose: "other",
    disbursement_method: "comdata",
    recipient_info: { recipient_type: "driver", recipient_name: null, bank_reference: null, notes: null },
    linked_bill_id: null,
    repayment_schedule: schedule,
  });
  if (!core.ok) return { error: "advance_create_failed" as const, details: core };

  const notes = input.approval_notes?.trim() ?? null;
  const upd = await client.query(
    `
      UPDATE driver_finance.cash_advance_requests
      SET
        status = 'approved',
        reviewed_at = now(),
        reviewed_by_user_id = $3,
        approval_notes = $4,
        denial_reason = NULL,
        linked_advance_id = $5::uuid
      WHERE operating_company_id = $1 AND id = $2
      RETURNING *
    `,
    [args.operatingCompanyId, args.requestId, args.actorUserId, notes, core.advanceId]
  );
  const updated = upd.rows[0]!;

  const actorName = await resolveActorLabel(client, args.actorUserId);
  await appendRequestAudit(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId: args.requestId,
    eventType: "cash_advance_request_approved",
    payload: {
      linked_advance_id: core.advanceId,
      advance_display_id: core.displayId,
      approval_notes: notes,
    },
    actorUserId: args.actorUserId,
    actorName,
  });
  await appendCrudAudit(client, args.actorUserId, "driver_finance.cash_advance_request.approved", {
    request_id: args.requestId,
    linked_advance_id: core.advanceId,
    display_id: updated.display_id,
  });
  await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.approved", {
    operating_company_id: args.operatingCompanyId,
    request_id: args.requestId,
    driver_id: driverId,
    linked_advance_id: core.advanceId,
  });

  await notifyDriverPwaIfAvailable(client, {
    operatingCompanyId: args.operatingCompanyId,
    driverId: driverId,
    title: "Cash advance approved",
    message: `Request ${String(updated.display_id ?? "")} was approved (${core.displayId}).`,
    payload: {
      request_id: args.requestId,
      request_display_id: updated.display_id,
      advance_id: core.advanceId,
      advance_display_id: core.displayId,
      type: "cash_advance_request_approved",
    },
  });

  return { request: updated, advance: core.data };
}

export async function denyCashAdvanceRequest(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    requestId: string;
    actorUserId: string;
    body: z.infer<typeof officeDenyBodySchema>;
  }
) {
  const input = officeDenyBodySchema.parse(args.body);
  const lock = await client.query(
    `
      SELECT *
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1 AND id = $2
      FOR UPDATE
    `,
    [args.operatingCompanyId, args.requestId]
  );
  const row = lock.rows[0] ?? null;
  if (!row) return { error: "not_found" as const };
  const status = String(row.status ?? "");
  if (!["pending", "under_review"].includes(status)) return { error: "not_deniable" as const };

  const reason = input.denial_reason.trim();
  const upd = await client.query(
    `
      UPDATE driver_finance.cash_advance_requests
      SET
        status = 'denied',
        reviewed_at = now(),
        reviewed_by_user_id = $3,
        denial_reason = $4,
        approval_notes = NULL,
        owner_approval_token = NULL,
        owner_approval_token_expires_at = NULL,
        owner_approval_required = false
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
    eventType: "cash_advance_request_denied",
    payload: { denial_reason: reason },
    actorUserId: args.actorUserId,
    actorName,
  });
  await appendCrudAudit(client, args.actorUserId, "driver_finance.cash_advance_request.denied", {
    request_id: args.requestId,
    display_id: updated.display_id,
  });
  await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.denied", {
    operating_company_id: args.operatingCompanyId,
    request_id: args.requestId,
    driver_id: String(row.driver_id),
  });

  await notifyDriverPwaIfAvailable(client, {
    operatingCompanyId: args.operatingCompanyId,
    driverId: String(row.driver_id),
    title: "Cash advance request denied",
    message: `Request ${String(updated.display_id ?? "")} was denied.`,
    payload: { request_id: args.requestId, display_id: updated.display_id, type: "cash_advance_request_denied" },
  });

  return { request: updated };
}

export async function expireStaleCashAdvanceRequests(client: QueryableClient) {
  const res = await client.query(
    `
      UPDATE driver_finance.cash_advance_requests
      SET
        status = 'expired',
        owner_approval_token = NULL,
        owner_approval_token_expires_at = NULL,
        owner_approval_required = false
      WHERE status IN ('pending', 'under_review')
        AND expires_at < now()
      RETURNING *
    `
  );

  for (const expired of res.rows) {
    const rid = String(expired.id ?? "");
    const oc = String(expired.operating_company_id ?? "");
    const driverId = String(expired.driver_id ?? "");
    await appendRequestAudit(client, {
      operatingCompanyId: oc,
      requestId: rid,
      eventType: "cash_advance_request_expired",
      payload: { display_id: expired.display_id },
      actorUserId: null,
      actorName: "system",
    });
    await notifyDriverPwaIfAvailable(client, {
      operatingCompanyId: oc,
      driverId,
      title: "Cash advance request expired",
      message: `Request ${String(expired.display_id ?? "")} expired before review.`,
      payload: { request_id: rid, display_id: expired.display_id, type: "cash_advance_request_expired" },
    });
  }

  return res.rows;
}
