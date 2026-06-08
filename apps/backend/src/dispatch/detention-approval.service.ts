import type { PoolClient } from "pg";
import { buildInvoiceFromLoad } from "../accounting/from-load.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { sendEmail } from "../notifications/email.service.js";
import { bridgeDetentionToBilling } from "./detention.service.js";

const AUDIT_TAG = "GAP-19";

/** Block H — feature flag gating the customer detention-charge notification (default OFF). */
const DETENTION_NOTIFY_FLAG = "detention_customer_notify_email";

async function withCompany<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: PoolClient) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

/**
 * Materialize pending approval requests from closed detention events that have
 * accrued a billable amount and do not yet have a request. Idempotent — the
 * unique index on detention_event_id makes re-runs no-ops.
 */
async function syncRequestsFromEvents(client: PoolClient, operatingCompanyId: string, userId: string) {
  await client.query(
    `
      INSERT INTO dispatch.detention_requests (
        operating_company_id, detention_event_id, load_id, stop_id, customer_id,
        billable_minutes, rate_per_hour_cents, amount_cents, status, requested_by_user_id
      )
      SELECT
        de.operating_company_id,
        de.id,
        de.load_id,
        de.stop_id,
        l.customer_id,
        de.accrued_minutes,
        de.rate_per_hour_cents,
        de.accrued_amount_cents,
        'pending_review',
        $2
      FROM dispatch.detention_events de
      JOIN mdata.loads l ON l.id = de.load_id
      WHERE de.operating_company_id = $1
        AND de.status = 'closed'
        AND de.accrued_amount_cents > 0
        AND NOT EXISTS (
          SELECT 1 FROM dispatch.detention_requests dr
          WHERE dr.detention_event_id = de.id
        )
      ON CONFLICT (detention_event_id) DO NOTHING
    `,
    [operatingCompanyId, userId]
  );
}

export async function listDetentionRequests(
  userId: string,
  operatingCompanyId: string,
  status?: string
) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    await syncRequestsFromEvents(client, operatingCompanyId, userId);
    const values: unknown[] = [operatingCompanyId];
    let statusClause = "";
    if (status) {
      values.push(status);
      statusClause = `AND dr.status = $${values.length}`;
    }
    const res = await client.query(
      `
        SELECT
          dr.*,
          l.load_number,
          l.status AS load_status,
          c.customer_name,
          ls.stop_type::text AS stop_type,
          ls.city AS stop_city,
          ls.state AS stop_state
        FROM dispatch.detention_requests dr
        JOIN mdata.loads l ON l.id = dr.load_id
        LEFT JOIN mdata.customers c ON c.id = dr.customer_id
        JOIN mdata.load_stops ls ON ls.id = dr.stop_id
        WHERE dr.operating_company_id = $1
          ${statusClause}
        ORDER BY
          CASE dr.status WHEN 'pending_review' THEN 0 ELSE 1 END ASC,
          dr.created_at DESC
        LIMIT 200
      `,
      values
    );
    return { count: res.rowCount ?? 0, requests: res.rows };
  });
}

export async function detentionApprovalKpis(userId: string, operatingCompanyId: string) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    await syncRequestsFromEvents(client, operatingCompanyId, userId);
    const res = await client.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_count,
          COALESCE(SUM(amount_cents) FILTER (
            WHERE status IN ('approved', 'invoiced')
              AND reviewed_at >= date_trunc('week', now())
          ), 0)::bigint AS week_approved_cents,
          COALESCE(SUM(amount_cents) FILTER (
            WHERE status IN ('approved', 'invoiced')
              AND reviewed_at >= date_trunc('year', now())
          ), 0)::bigint AS ytd_approved_cents
        FROM dispatch.detention_requests
        WHERE operating_company_id = $1
      `,
      [operatingCompanyId]
    );
    const row = res.rows[0] ?? {};
    return {
      pending_count: Number(row.pending_count ?? 0),
      week_approved_cents: Number(row.week_approved_cents ?? 0),
      ytd_approved_cents: Number(row.ytd_approved_cents ?? 0),
    };
  });
}

/**
 * Record dwell evidence for an approved request. Timestamps are derived from
 * stop_arrivals / load_stops (proxy — labeled in evidence_source) and the unit
 * is resolved to its Samsara vehicle id via the integrations projection
 * (units → integrations.samsara_vehicles).
 */
async function recordDetentionEvidence(
  client: PoolClient,
  operatingCompanyId: string,
  requestId: string,
  detentionEventId: string,
  billableMinutes: number
) {
  const res = await client.query(
    `
      INSERT INTO dispatch.detention_evidence (
        operating_company_id, detention_request_id, detention_event_id, load_id, stop_id,
        unit_id, samsara_vehicle_id, arrival_at, departure_at, dwell_minutes,
        free_time_minutes, billable_minutes, evidence_source
      )
      SELECT
        de.operating_company_id,
        $2,
        de.id,
        de.load_id,
        de.stop_id,
        de.unit_id,
        sv.samsara_vehicle_id,
        COALESCE(sa.confirmed_at, sa.triggered_at, ls.actual_arrival_at, de.started_at) AS arrival_at,
        COALESCE(ls.actual_departure_at, de.stopped_at) AS departure_at,
        GREATEST(
          0,
          (EXTRACT(EPOCH FROM (
            COALESCE(ls.actual_departure_at, de.stopped_at, now())
            - COALESCE(sa.confirmed_at, sa.triggered_at, ls.actual_arrival_at, de.started_at)
          )) / 60)::int
        ) AS dwell_minutes,
        de.free_time_minutes,
        $4,
        'derived_from_stop_timestamps'
      FROM dispatch.detention_events de
      JOIN mdata.load_stops ls ON ls.id = de.stop_id
      LEFT JOIN dispatch.stop_arrivals sa ON sa.id = de.stop_arrival_id
      LEFT JOIN integrations.samsara_vehicles sv ON sv.local_unit_id = de.unit_id
      WHERE de.id = $3
        AND de.operating_company_id = $1
      RETURNING *
    `,
    [operatingCompanyId, requestId, detentionEventId, billableMinutes]
  );
  return res.rows[0] ?? null;
}

type DetentionEvidenceRow = {
  arrival_at: string | null;
  departure_at: string | null;
  dwell_minutes: number | null;
  free_time_minutes: number | null;
  billable_minutes: number | null;
};

function formatTimestamp(value: unknown): string {
  if (!value) return "n/a";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

/**
 * Block H — send the customer a detention-charge notice after an approval is
 * invoiced. Runs in its own transaction AFTER the approval commits (the email
 * is an external side-effect that must never roll back billing). Gated behind
 * the {@link DETENTION_NOTIFY_FLAG} feature flag (default OFF) and idempotent on
 * dispatch.detention_requests.customer_notified_at (send only when IS NULL, then
 * stamp). A send failure is swallowed so the approval still succeeds.
 */
async function notifyCustomerOfApprovedDetention(
  userId: string,
  operatingCompanyId: string,
  requestId: string,
  details: {
    loadNumber: string;
    customerName: string | null;
    customerEmail: string | null;
    amountCents: number;
    evidence: DetentionEvidenceRow | null;
  }
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const enabled = await withCompany(userId, operatingCompanyId, (client) =>
      isEnabled(client, DETENTION_NOTIFY_FLAG, {
        operating_company_id: operatingCompanyId,
        user_uuid: userId,
      })
    );
    if (!enabled) return { sent: false, reason: "flag_disabled" };

    const email = details.customerEmail ? details.customerEmail.trim() : "";
    if (!email) return { sent: false, reason: "no_customer_email" };

    // Idempotency guard: only the first approval-notification per request sends.
    const claimed = await withCompany(userId, operatingCompanyId, async (client) => {
      const res = await client.query(
        `SELECT customer_notified_at FROM dispatch.detention_requests
         WHERE id = $1 AND operating_company_id = $2`,
        [requestId, operatingCompanyId]
      );
      return res.rows[0] && !res.rows[0].customer_notified_at;
    });
    if (!claimed) return { sent: false, reason: "already_notified" };

    const ev = details.evidence;
    const dwell = Number(ev?.dwell_minutes ?? 0);
    const freeTime = Number(ev?.free_time_minutes ?? 0);
    const billable = Number(ev?.billable_minutes ?? 0);
    const amount = (Number(details.amountCents ?? 0) / 100).toFixed(2);
    const customer = details.customerName ?? "Customer";
    const arrival = formatTimestamp(ev?.arrival_at);
    const departure = formatTimestamp(ev?.departure_at);

    const subject = `Detention charge — Load #${details.loadNumber}`;
    const html = `
      <p>Dear ${customer},</p>
      <p>A detention charge has been applied to <strong>Load #${details.loadNumber}</strong>.</p>
      <table cellpadding="4" style="border-collapse:collapse;">
        <tr><td><strong>Arrival</strong></td><td>${arrival}</td></tr>
        <tr><td><strong>Departure</strong></td><td>${departure}</td></tr>
        <tr><td><strong>Dwell time</strong></td><td>${dwell} minutes</td></tr>
        <tr><td><strong>Free time</strong></td><td>${freeTime} minutes</td></tr>
        <tr><td><strong>Billable detention</strong></td><td>${billable} minutes</td></tr>
        <tr><td><strong>Charge amount</strong></td><td>$${amount}</td></tr>
      </table>
      <p style="color:#555;font-size:12px;">Charge derived from stop timestamps.</p>
    `.trim();
    const text = [
      `Dear ${customer},`,
      `A detention charge has been applied to Load #${details.loadNumber}.`,
      `Arrival: ${arrival}`,
      `Departure: ${departure}`,
      `Dwell time: ${dwell} minutes`,
      `Free time: ${freeTime} minutes`,
      `Billable detention: ${billable} minutes`,
      `Charge amount: $${amount}`,
      `Charge derived from stop timestamps.`,
    ].join("\n");

    await sendEmail({
      sender: "dispatch",
      to: email,
      subject,
      html,
      text,
      eventClass: "dispatch.detention.customer_charge_notified",
      actorUserId: userId,
    });

    await withCompany(userId, operatingCompanyId, (client) =>
      client.query(
        `UPDATE dispatch.detention_requests
         SET customer_notified_at = now(), updated_at = now()
         WHERE id = $1 AND operating_company_id = $2 AND customer_notified_at IS NULL`,
        [requestId, operatingCompanyId]
      )
    );

    return { sent: true };
  } catch {
    // The approval already committed — never fail it on a notification error.
    return { sent: false, reason: "send_failed" };
  }
}

export async function approveDetentionRequest(
  userId: string,
  operatingCompanyId: string,
  requestId: string
) {
  const request = await withCompany(userId, operatingCompanyId, async (client) => {
    const res = await client.query(
      `
        SELECT dr.*, l.load_number, c.customer_name, c.ar_email
        FROM dispatch.detention_requests dr
        JOIN mdata.loads l ON l.id = dr.load_id
        LEFT JOIN mdata.customers c ON c.id = dr.customer_id
        WHERE dr.id = $1 AND dr.operating_company_id = $2
      `,
      [requestId, operatingCompanyId]
    );
    return res.rows[0] ?? null;
  });
  if (!request) return { ok: false as const, error: "not_found" as const };
  if (request.status !== "pending_review") return { ok: false as const, error: "not_pending" as const };

  // Bridge detention accrual into the load's billable total (rate_total_cents).
  // NOTE: this merges detention into the linehaul total — buildInvoiceFromLoad
  // emits a single 'linehaul' line. A discrete detention invoice line is a
  // follow-up that needs separate authorization.
  const bridge = await bridgeDetentionToBilling(userId, operatingCompanyId, String(request.detention_event_id));
  if (!bridge.ok && bridge.error !== "already_billed") {
    return { ok: false as const, error: bridge.error };
  }

  const result = await withCompany(userId, operatingCompanyId, async (client) => {
    const built = await buildInvoiceFromLoad(client, {
      userId,
      operatingCompanyId,
      loadId: String(request.load_id),
    });
    const invoiceId = String((built.invoice as { id?: unknown }).id ?? "") || null;
    const lineId = String((built.line as { id?: unknown })?.id ?? "") || null;

    const evidence = await recordDetentionEvidence(
      client,
      operatingCompanyId,
      requestId,
      String(request.detention_event_id),
      Number(request.billable_minutes ?? 0)
    );
    const evidenceId = evidence?.id ? String(evidence.id) : null;

    const updated = await client.query(
      `
        UPDATE dispatch.detention_requests
        SET status = 'invoiced',
            reviewed_by_user_id = $2,
            reviewed_at = now(),
            invoice_id = $3,
            invoice_line_id = $4,
            updated_at = now()
        WHERE id = $1 AND operating_company_id = $5
        RETURNING *
      `,
      [requestId, userId, invoiceId, lineId, operatingCompanyId]
    );

    await appendCrudAudit(
      client,
      userId,
      "dispatch.detention.request_approved",
      {
        detention_request_id: requestId,
        detention_event_id: request.detention_event_id,
        load_id: request.load_id,
        operating_company_id: operatingCompanyId,
        invoice_id: invoiceId,
        invoice_line_id: lineId,
        evidence_id: evidenceId,
        amount_cents: Number(request.amount_cents ?? 0),
        billing_note:
          "detention merged into linehaul total via bridgeDetentionToBilling; discrete detention line is a follow-up",
      },
      "info",
      AUDIT_TAG
    );

    return {
      ok: true as const,
      request: updated.rows[0],
      invoice: built.invoice,
      evidence_id: evidenceId,
      evidence,
      idempotent_invoice: built.idempotent,
    };
  });

  // Block H — notify the customer AFTER the approval transaction commits.
  const notification = await notifyCustomerOfApprovedDetention(userId, operatingCompanyId, requestId, {
    loadNumber: String(request.load_number ?? request.load_id ?? ""),
    customerName: request.customer_name ? String(request.customer_name) : null,
    customerEmail: request.ar_email ? String(request.ar_email) : null,
    amountCents: Number(request.amount_cents ?? 0),
    evidence: result.evidence,
  });

  return {
    ok: true as const,
    request: result.request,
    invoice: result.invoice,
    evidence_id: result.evidence_id,
    idempotent_invoice: result.idempotent_invoice,
    customer_notified: notification.sent,
    customer_notify_reason: notification.reason,
  };
}

export async function rejectDetentionRequest(
  userId: string,
  operatingCompanyId: string,
  requestId: string,
  reason: string
) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const existing = await client.query(
      `SELECT * FROM dispatch.detention_requests WHERE id = $1 AND operating_company_id = $2`,
      [requestId, operatingCompanyId]
    );
    const row = existing.rows[0];
    if (!row) return { ok: false as const, error: "not_found" as const };
    if (row.status !== "pending_review") return { ok: false as const, error: "not_pending" as const };

    const updated = await client.query(
      `
        UPDATE dispatch.detention_requests
        SET status = 'rejected',
            reviewed_by_user_id = $2,
            reviewed_at = now(),
            rejection_reason = $3,
            updated_at = now()
        WHERE id = $1 AND operating_company_id = $4
        RETURNING *
      `,
      [requestId, userId, reason, operatingCompanyId]
    );

    await appendCrudAudit(
      client,
      userId,
      "dispatch.detention.request_rejected",
      {
        detention_request_id: requestId,
        detention_event_id: row.detention_event_id,
        load_id: row.load_id,
        operating_company_id: operatingCompanyId,
        rejection_reason: reason,
      },
      "warning",
      AUDIT_TAG
    );

    return { ok: true as const, request: updated.rows[0] };
  });
}
