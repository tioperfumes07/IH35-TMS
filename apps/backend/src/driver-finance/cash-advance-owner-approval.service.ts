import crypto from "node:crypto";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { luciaPool, withLuciaBypass } from "../auth/db.js";
import { sendEmail } from "../notifications/email.service.js";
import { createDriverCashAdvanceCore, resolveCompanyCashAdvanceThresholdDollars } from "../cash-advances/cash-advance-create.js";
import { repaymentScheduleFromRequest } from "./cash-advance-requests.service.js";

type QueryableClient = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: T[] }>;
};

const ownerDecisionBodySchema = z.object({
  owner_notes: z.string().trim().min(30).max(8000),
});

export function hashCashAdvanceOwnerApprovalToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function resolveCashAdvanceOwnerApprovalPublicUrl(rawToken: string) {
  const base = (process.env.FRONTEND_BASE_URL || process.env.SIGNER_APP_BASE_URL || "").replace(/\/$/, "");
  if (!base) return `/owner-approval/${encodeURIComponent(rawToken)}`;
  return `${base}/owner-approval/${encodeURIComponent(rawToken)}`;
}

async function appendRequestAuditLocal(
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

async function appendOwnerApprovalAuditLocal(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    requestId: string;
    eventType: string;
    payload?: Record<string, unknown>;
    sourceIp?: string | null;
    userAgent?: string | null;
  }
) {
  await client.query(
    `
      INSERT INTO driver_finance.cash_advance_owner_approval_audit (
        operating_company_id,
        request_id,
        event_type,
        event_payload,
        source_ip,
        user_agent
      ) VALUES ($1, $2, $3, $4::jsonb, $5, $6)
    `,
    [
      args.operatingCompanyId,
      args.requestId,
      args.eventType,
      JSON.stringify(args.payload ?? {}),
      args.sourceIp ?? null,
      args.userAgent ?? null,
    ]
  );
}

async function resolveActorLabel(client: QueryableClient, userUuid: string | null | undefined): Promise<string | null> {
  if (!userUuid) return null;
  const r = await client.query(`SELECT email::text AS email FROM identity.users WHERE id = $1 LIMIT 1`, [userUuid]);
  const email = r.rows[0]?.email;
  return email ? String(email) : null;
}

async function enqueueDriverFinanceOutbox(client: QueryableClient, eventType: string, payload: Record<string, unknown>) {
  /* outbox-handler-parity: literal-types=["driver_finance.cash_advance_request.escalated_to_owner","driver_finance.cash_advance_request.owner_approved","driver_finance.cash_advance_request.owner_denied"] */
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

/** Primary Owner UUID for accountable booking when acting via token (no interactive Owner login). */
export async function resolvePrimaryOwnerUserUuid(client: QueryableClient): Promise<string | null> {
  const r = await client.query(
    `
      SELECT id::text AS uuid
      FROM identity.users
      WHERE role = 'Owner'
        AND deactivated_at IS NULL
      ORDER BY
        CASE WHEN lower(email) = 'jpm@tioperfumes.com' THEN 0 ELSE 1 END,
        id
      LIMIT 1
    `
  );
  const id = r.rows[0]?.uuid;
  return id ? String(id) : null;
}

export async function listOwnerEmails(client: QueryableClient): Promise<Array<{ uuid: string; email: string }>> {
  const r = await client.query<{ uuid: string; email: string }>(
    `
      SELECT id::text AS uuid, email::text AS email
      FROM identity.users
      WHERE role = 'Owner'
        AND deactivated_at IS NULL
        AND email IS NOT NULL
      ORDER BY
        CASE WHEN lower(email) = 'jpm@tioperfumes.com' THEN 0 ELSE 1 END,
        email
    `
  );
  return r.rows.map((row) => ({ uuid: String(row.uuid), email: String(row.email) }));
}

async function loadEscalationActorEmail(client: QueryableClient, requestId: string): Promise<string | null> {
  const r = await client.query<{ email: string | null }>(
    `
      SELECT u.email::text AS email
      FROM driver_finance.cash_advance_request_audit a
      JOIN identity.users u ON u.id = a.actor_user_id
      WHERE a.request_id = $1
        AND a.event_type = 'cash_advance_request_escalated_to_owner'
      ORDER BY a.id DESC
      LIMIT 1
    `,
    [requestId]
  );
  const e = r.rows[0]?.email;
  return e ? String(e) : null;
}

async function loadDriverAdvanceAndSettlementHistory(
  client: QueryableClient,
  operatingCompanyId: string,
  driverId: string
): Promise<{ advances: Record<string, unknown>[]; settlements: Record<string, unknown>[] }> {
  const since = new Date();
  since.setMonth(since.getMonth() - 12);
  const adv = await client.query(
    `
      SELECT id, display_id, amount, purpose, disbursement_status, created_at
      FROM driver_finance.driver_advances
      WHERE operating_company_id = $1
        AND driver_id = $2
        AND created_at >= $3
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [operatingCompanyId, driverId, since.toISOString()]
  );

  let settlements: Record<string, unknown>[] = [];
  const reg = await client.query(`SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS ok`);
  if (reg.rows[0]?.ok) {
    const st = await client.query(
      `
        SELECT id, display_id, status, payment_state, period_start, period_end, created_at
        FROM driver_finance.driver_settlements
        WHERE operating_company_id = $1
          AND driver_id = $2
          AND created_at >= $3
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [operatingCompanyId, driverId, since.toISOString()]
    );
    settlements = st.rows;
  }

  return { advances: adv.rows, settlements };
}

function computeRecommendation(
  row: Record<string, unknown>,
  advanceHistory: Record<string, unknown>[]
): "low" | "medium" | "high" {
  const n = advanceHistory.length;
  const totalOutstandingApprox = advanceHistory.reduce((s, a) => s + Number(a.amount ?? 0), 0);
  let level: "low" | "medium" | "high" = "low";
  if (n >= 4 || totalOutstandingApprox >= 8000) level = "high";
  else if (n >= 2 || totalOutstandingApprox >= 3000) level = "medium";
  if (Boolean(row.is_above_policy)) {
    if (level === "low") level = "medium";
    else if (level === "medium") level = "high";
  }
  return level;
}

export async function escalateCashAdvanceRequestToOwner(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    requestId: string;
    actorUserId: string;
  }
): Promise<
  | { ok: true; owner_approval_url: string; request: Record<string, unknown> }
  | { error: "not_found" | "not_escalatable" | "not_above_policy" | "expired" }
> {
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
  if (!row) return { error: "not_found" };
  const status = String(row.status ?? "");
  if (!["pending", "under_review"].includes(status)) return { error: "not_escalatable" };
  if (new Date(String(row.expires_at)).getTime() < Date.now()) return { error: "expired" };
  if (!Boolean(row.is_above_policy)) return { error: "not_above_policy" };

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashCashAdvanceOwnerApprovalToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const actorName = await resolveActorLabel(client, args.actorUserId);
  const escCount = Number(row.escalation_count ?? 0) + 1;

  const upd = await client.query(
    `
      UPDATE driver_finance.cash_advance_requests
      SET
        status = 'under_review',
        owner_approval_required = true,
        owner_approval_token = $3,
        owner_approval_token_expires_at = $4,
        escalation_count = $5,
        last_escalated_at = now(),
        owner_decision = 'escalated',
        owner_notes = NULL
      WHERE operating_company_id = $1 AND id = $2
      RETURNING *
    `,
    [args.operatingCompanyId, args.requestId, tokenHash, expiresAt.toISOString(), escCount]
  );
  const updated = upd.rows[0]!;
  const requestId = args.requestId;

  await appendRequestAuditLocal(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId,
    eventType: "cash_advance_request_escalated_to_owner",
    payload: {
      display_id: updated.display_id,
      escalation_count: escCount,
      owner_approval_token_expires_at: expiresAt.toISOString(),
    },
    actorUserId: args.actorUserId,
    actorName,
  });

  await appendOwnerApprovalAuditLocal(client, {
    operatingCompanyId: args.operatingCompanyId,
    requestId,
    eventType: "escalated",
    payload: { escalation_count: escCount },
  });

  await appendCrudAudit(client, args.actorUserId, "driver_finance.cash_advance_request_escalated_to_owner", {
    request_id: requestId,
    display_id: updated.display_id,
    driver_id: String(updated.driver_id ?? ""),
    escalation_count: escCount,
  });

  await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.escalated_to_owner", {
    operating_company_id: args.operatingCompanyId,
    request_id: requestId,
    driver_id: String(updated.driver_id ?? ""),
  });

  const withNameRes = await client.query(
    `
      SELECT
        r.*,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name
      FROM driver_finance.cash_advance_requests r
      JOIN mdata.drivers d ON d.id = r.driver_id
      WHERE r.operating_company_id = $1 AND r.id = $2
      LIMIT 1
    `,
    [args.operatingCompanyId, requestId]
  );
  const requestOut = withNameRes.rows[0] ?? updated;

  const url = resolveCashAdvanceOwnerApprovalPublicUrl(rawToken);
  return { ok: true, owner_approval_url: url, request: requestOut };
}

export async function listPendingOwnerApprovalCashAdvanceRequests(client: QueryableClient, operatingCompanyId: string) {
  const res = await client.query(
    `
      SELECT
        r.*,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name
      FROM driver_finance.cash_advance_requests r
      JOIN mdata.drivers d ON d.id = r.driver_id
      WHERE r.operating_company_id = $1
        AND r.owner_approval_required = true
        AND r.owner_approval_token IS NOT NULL
        AND r.owner_approval_token_expires_at > now()
        AND r.status IN ('pending', 'under_review')
      ORDER BY r.last_escalated_at ASC NULLS LAST, r.submitted_at ASC
      LIMIT 200
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

export async function getPublicOwnerApprovalDetails(
  rawToken: string,
  audit: { ipAddress: string | null; userAgent: string | null }
) {
  const tokenHash = hashCashAdvanceOwnerApprovalToken(rawToken);
  return withLuciaBypass(async (client) => {
    const reqRes = await client.query(
      `
        SELECT
          r.*,
          concat_ws(' ', d.first_name, d.last_name) AS driver_name
        FROM driver_finance.cash_advance_requests r
        JOIN mdata.drivers d ON d.id = r.driver_id
        WHERE r.owner_approval_token = $1
          AND r.owner_approval_token_expires_at > now()
          AND r.owner_approval_required = true
          AND r.status IN ('pending', 'under_review')
        LIMIT 1
      `,
      [tokenHash]
    );
    const request = reqRes.rows[0] ?? null;
    if (!request) return null;

    const oc = String(request.operating_company_id ?? "");
    const driverId = String(request.driver_id ?? "");
    const thresholdDollars = await resolveCompanyCashAdvanceThresholdDollars(client, oc);
    const history = await loadDriverAdvanceAndSettlementHistory(client, oc, driverId);
    const recommendation = computeRecommendation(request, history.advances);

    await appendOwnerApprovalAuditLocal(client, {
      operatingCompanyId: oc,
      requestId: String(request.id ?? ""),
      eventType: "portal_view",
      payload: {},
      sourceIp: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return {
      request,
      driver_history: history,
      policy: {
        threshold_dollars: thresholdDollars,
        requested_amount_dollars: Number(request.requested_amount_cents ?? 0) / 100,
        is_above_policy: Boolean(request.is_above_policy),
        headroom_dollars: Math.max(0, thresholdDollars - Number(request.requested_amount_cents ?? 0) / 100),
        policy_overage_dollars: Math.max(0, Number(request.requested_amount_cents ?? 0) / 100 - thresholdDollars),
      },
      recommendation,
    };
  });
}

export async function ownerTokenApproveCashAdvanceRequest(
  rawToken: string,
  body: unknown,
  audit: { ipAddress: string | null; userAgent: string | null }
): Promise<
  | { ok: true; request: Record<string, unknown>; advance: Record<string, unknown> }
  | { error: "validation_error"; details: z.ZodError }
  | { error: "owner_approval_token_invalid_or_expired" | "advance_create_failed"; details?: unknown }
> {
  const parsed = ownerDecisionBodySchema.safeParse(body ?? {});
  if (!parsed.success) return { error: "validation_error", details: parsed.error };

  const tokenHash = hashCashAdvanceOwnerApprovalToken(rawToken);
  const client = await luciaPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);

    const lock = await client.query(
      `
          SELECT *
          FROM driver_finance.cash_advance_requests
          WHERE owner_approval_token = $1
            AND owner_approval_token_expires_at > now()
            AND owner_approval_required = true
            AND status IN ('pending', 'under_review')
          FOR UPDATE
        `,
      [tokenHash]
    );
    const row = lock.rows[0] ?? null;
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "owner_approval_token_invalid_or_expired" };
    }

    const operatingCompanyId = String(row.operating_company_id ?? "");
    const requestId = String(row.id ?? "");
    const driverId = String(row.driver_id ?? "");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

    const ownerUuid = await resolvePrimaryOwnerUserUuid(client);
    if (!ownerUuid) {
      await client.query("ROLLBACK");
      return { error: "advance_create_failed", details: { error: "no_owner_user" } };
    }

    const amountDollars = Number(row.requested_amount_cents) / 100;
    const schedule = repaymentScheduleFromRequest(row);
    const core = await createDriverCashAdvanceCore(client, ownerUuid, operatingCompanyId, {
      driver_id: driverId,
      amount: amountDollars,
      purpose: "other",
      disbursement_method: "comdata",
      recipient_info: { recipient_type: "driver", recipient_name: null, bank_reference: null, notes: null },
      linked_bill_id: null,
      repayment_schedule: schedule,
    });
    if (!core.ok) {
      await client.query("ROLLBACK");
      return { error: "advance_create_failed", details: core };
    }

    // [HOLD-FOR-JORGE — TIER 1] #1440 traceability: forward the originating load from the REQUEST onto the
    // disbursed advance (driver_advances.load_id mirrors cash_advance_requests.load_id). Same as the in-app
    // approval path. NULL for driver-initiated advances. Entity-scoped to the request's operating company.
    if (row.load_id) {
      await client.query(
        `UPDATE driver_finance.driver_advances SET load_id = $1::uuid, updated_at = now()
         WHERE id = $2::uuid AND operating_company_id = $3::uuid AND load_id IS NULL`,
        [row.load_id, core.advanceId, operatingCompanyId]
      );
    }

    const notes = parsed.data.owner_notes.trim();
    const upd = await client.query(
      `
          UPDATE driver_finance.cash_advance_requests
          SET
            status = 'approved',
            reviewed_at = now(),
            reviewed_by_user_id = $3::uuid,
            approval_notes = $4,
            denial_reason = NULL,
            linked_advance_id = $5::uuid,
            owner_approved_by_user_id = $3::uuid,
            owner_approved_at = now(),
            owner_decision = 'approved',
            owner_notes = $4,
            owner_approval_token = NULL,
            owner_approval_token_expires_at = NULL
          WHERE operating_company_id = $1 AND id = $2
          RETURNING *
        `,
      [operatingCompanyId, requestId, ownerUuid, notes, core.advanceId]
    );
    const updated = upd.rows[0]!;

    await appendRequestAuditLocal(client, {
      operatingCompanyId,
      requestId,
      eventType: "cash_advance_request_owner_approved",
      payload: { linked_advance_id: core.advanceId, owner_notes: notes },
      actorUserId: ownerUuid,
      actorName: await resolveActorLabel(client, ownerUuid),
    });

    await appendOwnerApprovalAuditLocal(client, {
      operatingCompanyId,
      requestId,
      eventType: "owner_approved",
      payload: { linked_advance_id: core.advanceId },
      sourceIp: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await appendCrudAudit(client, ownerUuid, "driver_finance.cash_advance_request_owner_approved", {
      request_id: requestId,
      linked_advance_id: core.advanceId,
      display_id: updated.display_id,
    });

    await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.owner_approved", {
      operating_company_id: operatingCompanyId,
      request_id: requestId,
      driver_id: driverId,
      linked_advance_id: core.advanceId,
    });

    await notifyDriverPwaIfAvailable(client, {
      operatingCompanyId,
      driverId,
      title: "Cash advance approved (Owner)",
      message: `Request ${String(updated.display_id ?? "")} was approved by Owner (${core.displayId}).`,
      payload: {
        request_id: requestId,
        request_display_id: updated.display_id,
        advance_display_id: core.displayId,
        type: "cash_advance_request_owner_approved",
      },
    });

    await client.query("COMMIT");
    return { ok: true, request: updated, advance: core.data };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function ownerTokenDenyCashAdvanceRequest(
  rawToken: string,
  body: unknown,
  audit: { ipAddress: string | null; userAgent: string | null }
): Promise<
  | { ok: true; request: Record<string, unknown> }
  | { error: "validation_error"; details: z.ZodError }
  | { error: "owner_approval_token_invalid_or_expired" }
> {
  const parsed = ownerDecisionBodySchema.safeParse(body ?? {});
  if (!parsed.success) return { error: "validation_error", details: parsed.error };

  const tokenHash = hashCashAdvanceOwnerApprovalToken(rawToken);
  const client = await luciaPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);

    const lock = await client.query(
      `
          SELECT *
          FROM driver_finance.cash_advance_requests
          WHERE owner_approval_token = $1
            AND owner_approval_token_expires_at > now()
            AND owner_approval_required = true
            AND status IN ('pending', 'under_review')
          FOR UPDATE
        `,
      [tokenHash]
    );
    const row = lock.rows[0] ?? null;
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "owner_approval_token_invalid_or_expired" };
    }

    const operatingCompanyId = String(row.operating_company_id ?? "");
    const requestId = String(row.id ?? "");
    const driverId = String(row.driver_id ?? "");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

    const ownerUuid = await resolvePrimaryOwnerUserUuid(client);
    if (!ownerUuid) {
      await client.query("ROLLBACK");
      return { error: "owner_approval_token_invalid_or_expired" };
    }

    const notes = parsed.data.owner_notes.trim();
    const upd = await client.query(
      `
          UPDATE driver_finance.cash_advance_requests
          SET
            status = 'denied',
            reviewed_at = now(),
            reviewed_by_user_id = $3::uuid,
            denial_reason = $4,
            approval_notes = NULL,
            owner_approved_by_user_id = $3::uuid,
            owner_approved_at = now(),
            owner_decision = 'denied',
            owner_notes = $4,
            owner_approval_token = NULL,
            owner_approval_token_expires_at = NULL,
            owner_approval_required = false
          WHERE operating_company_id = $1 AND id = $2
          RETURNING *
        `,
      [operatingCompanyId, requestId, ownerUuid, notes]
    );
    const updated = upd.rows[0]!;

    await appendRequestAuditLocal(client, {
      operatingCompanyId,
      requestId,
      eventType: "cash_advance_request_owner_denied",
      payload: { owner_notes: notes },
      actorUserId: ownerUuid,
      actorName: await resolveActorLabel(client, ownerUuid),
    });

    await appendOwnerApprovalAuditLocal(client, {
      operatingCompanyId,
      requestId,
      eventType: "owner_denied",
      payload: {},
      sourceIp: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await appendCrudAudit(client, ownerUuid, "driver_finance.cash_advance_request_owner_denied", {
      request_id: requestId,
      display_id: updated.display_id,
    });

    await enqueueDriverFinanceOutbox(client, "driver_finance.cash_advance_request.owner_denied", {
      operating_company_id: operatingCompanyId,
      request_id: requestId,
      driver_id: driverId,
    });

    await notifyDriverPwaIfAvailable(client, {
      operatingCompanyId,
      driverId,
      title: "Cash advance request denied (Owner)",
      message: `Request ${String(updated.display_id ?? "")} was denied by Owner.`,
      payload: { request_id: requestId, display_id: updated.display_id, type: "cash_advance_request_owner_denied" },
    });

    await client.query("COMMIT");
    return { ok: true, request: updated };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function sendOwnerEscalationEmails(args: {
  owner_approval_url: string;
  requestDisplayId: string;
  requestedAmountDollars: string;
  driverName: string;
}) {
  const owners = await withLuciaBypass(async (client) => {
    return await listOwnerEmails(client);
  });
  for (const o of owners) {
    try {
      await sendEmail({
        to: o.email,
        subject: `Owner approval required: cash advance ${args.requestDisplayId}`,
        text: `Above-policy cash advance request ${args.requestDisplayId} for ${args.driverName} (${args.requestedAmountDollars}) requires Owner approval.\n\nOpen: ${args.owner_approval_url}\n`,
        html: `<p>Above-policy cash advance <strong>${args.requestDisplayId}</strong> for <strong>${args.driverName}</strong> (${args.requestedAmountDollars}) requires Owner approval.</p><p><a href="${args.owner_approval_url}">Open approval portal</a></p>`,
        sender: "noreply",
        eventClass: "driver_finance.cash_advance_request_escalated_to_owner.email",
        actorUserId: null,
        recipientUserUuid: o.uuid,
      });
    } catch {
      // logged inside sendEmail
    }
  }
}

export async function notifyOfficeEscalatorOfOwnerDecision(args: {
  requestId: string;
  headline: string;
  bodyText: string;
}) {
  const email = await withLuciaBypass(async (client) => {
    return await loadEscalationActorEmail(client, args.requestId);
  });
  if (!email) return;
  try {
    await sendEmail({
      to: email,
      subject: args.headline,
      text: args.bodyText,
      html: `<p>${args.bodyText.replace(/\n/g, "<br/>")}</p>`,
      sender: "noreply",
      eventClass: "driver_finance.cash_advance_request.owner_decision_office_notify",
      actorUserId: null,
    });
  } catch {
    // non-fatal
  }
}