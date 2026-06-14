import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { sendEmail } from "../notifications/email.service.js";

type QueryClient = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

interface ApproveInput {
  pending_id: string;
  operating_company_id: string;
  override_amount_cents?: number;
  review_notes?: string;
}

type PendingRow = {
  id: string;
  driver_id: string;
  driver_name: string | null;
  source_type: string;
  load_id: string | null;
  load_number: string | null;
  proposed_amount_cents: number;
  proposed_reason: string;
  proposed_breakdown_json: Record<string, unknown> | null;
  proposed_at: string;
  expires_at: string;
  status: string;
};

export function calculateAbandonmentProposalAmount(loadValueCents: number) {
  const value = Math.max(0, Number(loadValueCents || 0));
  return Math.max(Math.round((value * 15) / 100), 50000);
}

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL ??
    process.env.WEB_APP_URL ??
    process.env.FRONTEND_URL ??
    "https://app.ih35dispatch.com"
  );
}

function formatUsd(cents: number) {
  return `$${(Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function ownerEmailsForCompany(operatingCompanyId: string) {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ email: string }>(
      `
        SELECT DISTINCT lower(u.email) AS email
        FROM identity.users u
        JOIN org.user_company_access uca ON uca.user_id = u.id
        WHERE u.role = 'Owner'
          AND u.deactivated_at IS NULL
          AND u.email IS NOT NULL
          AND uca.company_id = $1
      `,
      [operatingCompanyId]
    );
    return res.rows.map((row) => row.email).filter(Boolean);
  });
}

async function notifyOwnersAboutPending(
  actorUserId: string,
  operatingCompanyId: string,
  payload: { amount_cents: number; driver_name?: string | null; load_number?: string | null; event_class: string; subject_prefix?: string }
) {
  const ownerEmails = await ownerEmailsForCompany(operatingCompanyId);
  if (ownerEmails.length === 0) return;
  const amount = formatUsd(payload.amount_cents);
  const driverName = payload.driver_name?.trim() ? payload.driver_name : "Unknown driver";
  const loadNumber = payload.load_number?.trim() ? payload.load_number : "N/A";
  const base = appBaseUrl().replace(/\/+$/, "");
  const reviewUrl = `${base}/driver-finance/escrow-deductions-pending`;
  const subjectLead = payload.subject_prefix ?? "Escrow Deduction Pending";
  await sendEmail({
    to: ownerEmails,
    subject: `${subjectLead}: ${amount} for ${driverName} (Load ${loadNumber})`,
    sender: "noreply",
    html: `<p>An escrow deduction requires owner review.</p>
<p><strong>Driver:</strong> ${driverName}<br/>
<strong>Load:</strong> ${loadNumber}<br/>
<strong>Amount:</strong> ${amount}</p>
<p>Review here: <a href="${reviewUrl}">${reviewUrl}</a></p>`,
    text: `Escrow deduction pending. Driver: ${driverName}. Load: ${loadNumber}. Amount: ${amount}. Review: ${reviewUrl}`,
    eventClass: payload.event_class,
    actorUserId,
  }).catch(() => undefined);
}

export async function emitAutoProposedEscrowEvents(params: {
  client: QueryClient;
  actor_user_id: string;
  operating_company_id: string;
  load_id: string;
  load_status: string;
}) {
  const candidate = await params.client.query<{
    id: string;
    driver_id: string;
    proposed_amount_cents: number;
    load_id: string;
    load_number: string | null;
    load_value_cents: number;
    driver_name: string | null;
    owner_notified_at: string | null;
  }>(
    `
      SELECT
        p.id,
        p.driver_id,
        p.proposed_amount_cents,
        p.load_id,
        l.load_number,
        COALESCE(l.rate_total_cents, 0)::bigint AS load_value_cents,
        (d.first_name || ' ' || d.last_name) AS driver_name,
        p.owner_notified_at::text
      FROM driver_finance.escrow_deductions_pending p
      LEFT JOIN mdata.loads l ON l.id = p.load_id
      LEFT JOIN mdata.drivers d ON d.id = p.driver_id
      WHERE p.operating_company_id = $1
        AND p.load_id = $2
        AND p.source_type = 'load_abandonment'
        AND p.status = 'pending'
      ORDER BY p.proposed_at DESC
      LIMIT 1
    `,
    [params.operating_company_id, params.load_id]
  );
  const pending = candidate.rows[0];
  if (!pending || pending.owner_notified_at) return null;
  const recalculatedAmountCents = calculateAbandonmentProposalAmount(Number(pending.load_value_cents || 0));
  if (recalculatedAmountCents !== Number(pending.proposed_amount_cents)) {
    await params.client.query(
      `
        UPDATE driver_finance.escrow_deductions_pending
        SET proposed_amount_cents = $2,
            proposed_breakdown_json = jsonb_set(
              COALESCE(proposed_breakdown_json, '{}'::jsonb),
              '{service_recalculated_cents}',
              to_jsonb($2::bigint),
              true
            ),
            updated_at = now()
        WHERE id = $1
      `,
      [pending.id, recalculatedAmountCents]
    );
    pending.proposed_amount_cents = recalculatedAmountCents;
  }

  await appendCrudAudit(
    params.client,
    params.actor_user_id,
    "dispatch.load.abandoned",
    {
      resource_type: "mdata.loads",
      resource_id: params.load_id,
      operating_company_id: params.operating_company_id,
      pending_deduction_id: pending.id,
      status: params.load_status,
    },
    "warning",
    "P5-E1-ESCROW"
  );

  await appendCrudAudit(
    params.client,
    params.actor_user_id,
    "driver_finance.escrow.auto_deduct_proposed",
    {
      resource_type: "driver_finance.escrow_deductions_pending",
      resource_id: pending.id,
      operating_company_id: params.operating_company_id,
      load_id: pending.load_id,
      driver_id: pending.driver_id,
      proposed_amount_cents: pending.proposed_amount_cents,
    },
    "warning",
    "P5-E1-ESCROW"
  );

  await appendCrudAudit(
    params.client,
    params.actor_user_id,
    "workflow.requested",
    {
      action_code: "WF-064-ESCROW-001",
      workflow_context: "escrow_auto_deduction_pending_review",
      owner_notification_required: true,
      target_resource_type: "driver_finance.escrow_deductions_pending",
      target_resource_id: pending.id,
      operating_company_id: params.operating_company_id,
      severity: "warning",
    },
    "warning",
    "P5-E1-WF064"
  );

  await params.client.query(
    `
      UPDATE driver_finance.escrow_deductions_pending
      SET owner_notified_at = now(),
          wf064_requested_at = now(),
          updated_at = now()
      WHERE id = $1
    `,
    [pending.id]
  );

  await notifyOwnersAboutPending(params.actor_user_id, params.operating_company_id, {
    amount_cents: pending.proposed_amount_cents,
    driver_name: pending.driver_name,
    load_number: pending.load_number,
    event_class: "driver_finance.escrow.auto_deduct_proposed",
  });

  return pending.id;
}

export async function processEscrowPendingExpiryReminders(
  client: QueryClient,
  actorUserId: string,
  operatingCompanyId: string
) {
  const reminderCandidates = await client.query<{
    id: string;
    proposed_amount_cents: number;
    load_number: string | null;
    driver_name: string | null;
  }>(
    `
      SELECT p.id, p.proposed_amount_cents, l.load_number, (d.first_name || ' ' || d.last_name) AS driver_name
      FROM driver_finance.escrow_deductions_pending p
      LEFT JOIN mdata.loads l ON l.id = p.load_id
      LEFT JOIN mdata.drivers d ON d.id = p.driver_id
      WHERE p.operating_company_id = $1
        AND p.status = 'pending'
        AND p.expires_at <= (now() + INTERVAL '7 days')
        AND p.wf064_reminder_7d_at IS NULL
      ORDER BY p.expires_at ASC
      LIMIT 25
    `,
    [operatingCompanyId]
  );

  for (const row of reminderCandidates.rows) {
    await appendCrudAudit(
      client,
      actorUserId,
      "workflow.requested",
      {
        action_code: "WF-064-ESCROW-REMINDER",
        workflow_context: "escrow_auto_deduction_expiry_reminder",
        owner_notification_required: true,
        target_resource_type: "driver_finance.escrow_deductions_pending",
        target_resource_id: row.id,
        operating_company_id: operatingCompanyId,
        severity: "warning",
      },
      "warning",
      "P5-E1-WF064"
    );
    await notifyOwnersAboutPending(actorUserId, operatingCompanyId, {
      amount_cents: row.proposed_amount_cents,
      driver_name: row.driver_name,
      load_number: row.load_number,
      event_class: "driver_finance.escrow.auto_deduct_proposed",
      subject_prefix: "Escrow Deduction Reminder (expires in <=7 days)",
    });
    await client.query(
      `
        UPDATE driver_finance.escrow_deductions_pending
        SET wf064_reminder_7d_at = now(), updated_at = now()
        WHERE id = $1
      `,
      [row.id]
    );
  }

  await client.query(
    `
      UPDATE driver_finance.escrow_deductions_pending
      SET status = 'expired',
          updated_at = now()
      WHERE operating_company_id = $1
        AND status = 'pending'
        AND expires_at <= now()
        AND wf064_reminder_7d_at IS NOT NULL
    `,
    [operatingCompanyId]
  );
}

export async function listPendingDeductions(client: PoolClient, operating_company_id: string) {
  const res = await client.query<PendingRow>(
    `
      SELECT
        p.id,
        p.driver_id,
        (d.first_name || ' ' || d.last_name) AS driver_name,
        p.source_type,
        p.load_id,
        l.load_number,
        p.proposed_amount_cents,
        p.proposed_reason,
        p.proposed_breakdown_json,
        p.proposed_at::text,
        p.expires_at::text,
        p.status
      FROM driver_finance.escrow_deductions_pending p
      LEFT JOIN mdata.drivers d ON d.id = p.driver_id
      LEFT JOIN mdata.loads l ON l.id = p.load_id
      WHERE p.operating_company_id = $1
        AND p.status = 'pending'
      ORDER BY p.proposed_at DESC
    `,
    [operating_company_id]
  );
  return res.rows;
}

export async function listLoadAbandonments(client: PoolClient, operating_company_id: string, since_date?: string | undefined) {
  const sinceClause = since_date ? `AND a.abandoned_at >= $2::timestamptz` : "";
  const params: string[] = [operating_company_id];
  if (since_date) params.push(since_date);
  const res = await client.query(
    `
      SELECT a.*,
             (d.first_name || ' ' || d.last_name) AS driver_name,
             l.load_number
      FROM dispatch.load_abandonments a
      LEFT JOIN mdata.drivers d ON d.id = a.driver_id
      LEFT JOIN mdata.loads l ON l.id = a.load_id
      WHERE a.operating_company_id = $1
      ${sinceClause}
      ORDER BY a.abandoned_at DESC
      LIMIT 200
    `,
    params
  );
  return res.rows;
}

export async function approvePendingDeduction(
  userId: string,
  userRole: string,
  input: ApproveInput
) {
  if (userRole !== "Owner") {
    throw new Error("E_OWNER_ONLY: escrow deduction approval is Owner-only");
  }

  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);

    const lockRes = await client.query<{
      id: string;
      driver_id: string;
      proposed_amount_cents: number;
      proposed_reason: string;
      load_id: string | null;
      status: string;
      expires_at: string;
    }>(
      `
        SELECT id, driver_id, proposed_amount_cents, proposed_reason, load_id, status, expires_at::text
        FROM driver_finance.escrow_deductions_pending
        WHERE id = $1 AND operating_company_id = $2
        FOR UPDATE
      `,
      [input.pending_id, input.operating_company_id]
    );

    if (lockRes.rows.length === 0) throw new Error("E_NOT_FOUND: pending deduction not found");
    const pending = lockRes.rows[0];
    if (pending.status !== "pending") throw new Error(`E_INVALID_STATUS: deduction already ${pending.status}`);
    if (new Date(pending.expires_at) < new Date()) throw new Error("E_EXPIRED: pending deduction has expired");

    const finalAmountCents = Number(input.override_amount_cents ?? pending.proposed_amount_cents);
    if (finalAmountCents <= 0) throw new Error("E_INVALID_AMOUNT: amount must be > 0");

    const dedRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.driver_settlement_deductions (
          operating_company_id,
          driver_id,
          deduction_type,
          amount_cents,
          reason,
          applied_to_settlement_id,
          created_by_user_id,
          source_pending_id,
          remaining_balance_cents
        )
        -- A3-2: initialise the carry-forward balance to the full amount on insert ($3 = amount_cents).
        -- NOTE: escrow's recovery floor policy is NOT yet wired through the capped engine — see the
        -- A3-2 preflight-of-record (escrow may need its own floor / different GL credit account).
        VALUES ($1, $2, 'escrow_load_abandonment', $3, $4, NULL, $5, $6, $3)
        RETURNING id
      `,
      [
        input.operating_company_id,
        pending.driver_id,
        finalAmountCents,
        input.review_notes ? `${pending.proposed_reason} (Owner notes: ${input.review_notes})` : pending.proposed_reason,
        userId,
        pending.id,
      ]
    );

    await client.query(
      `
        UPDATE driver_finance.escrow_deductions_pending
        SET status = 'approved',
            reviewed_at = now(),
            reviewed_by_user_id = $2,
            review_notes = $3,
            resulting_deduction_id = $4,
            updated_at = now()
        WHERE id = $1
      `,
      [pending.id, userId, input.review_notes ?? null, dedRes.rows[0].id]
    );

    await appendCrudAudit(
      client,
      userId,
      "driver_finance.escrow.auto_deduct_approved",
      {
        resource_type: "driver_finance.escrow_deductions_pending",
        resource_id: pending.id,
        operating_company_id: input.operating_company_id,
        driver_id: pending.driver_id,
        approved_amount_cents: finalAmountCents,
        proposed_amount_cents: pending.proposed_amount_cents,
        load_id: pending.load_id,
        resulting_deduction_id: dedRes.rows[0].id,
      },
      "warning",
      "P5-E1-ESCROW"
    );

    return { pending_id: pending.id, deduction_id: dedRes.rows[0].id, amount_cents: finalAmountCents };
  });
}

export async function rejectPendingDeduction(
  userId: string,
  userRole: string,
  input: { pending_id: string; operating_company_id: string; review_notes: string }
) {
  if (userRole !== "Owner") {
    throw new Error("E_OWNER_ONLY: escrow deduction rejection is Owner-only");
  }
  if (!input.review_notes || input.review_notes.trim().length < 10) {
    throw new Error("E_REASON_REQUIRED: review_notes >=10 chars required for rejection");
  }

  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);

    const res = await client.query<{ id: string; driver_id: string; load_id: string | null }>(
      `
        UPDATE driver_finance.escrow_deductions_pending
        SET status = 'rejected',
            reviewed_at = now(),
            reviewed_by_user_id = $2,
            review_notes = $3,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $4
          AND status = 'pending'
        RETURNING id, driver_id, load_id
      `,
      [input.pending_id, userId, input.review_notes.trim(), input.operating_company_id]
    );

    if (res.rows.length === 0) throw new Error("E_NOT_FOUND_OR_NOT_PENDING");

    await appendCrudAudit(
      client,
      userId,
      "driver_finance.escrow.auto_deduct_rejected",
      {
        resource_type: "driver_finance.escrow_deductions_pending",
        resource_id: res.rows[0].id,
        operating_company_id: input.operating_company_id,
        driver_id: res.rows[0].driver_id,
        load_id: res.rows[0].load_id,
        review_notes: input.review_notes.trim(),
      },
      "info",
      "P5-E1-ESCROW"
    );

    return { pending_id: res.rows[0].id };
  });
}
