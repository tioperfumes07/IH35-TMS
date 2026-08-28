import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { sendEmail } from "../notifications/email.service.js";
import { resyncProformaInvoiceFromLoadRate } from "../accounting/resync-proforma-from-load-rate.js";
import {
  buildDetentionAccessorialBridge,
  computeDetentionAccrualCents,
  computeDetentionBillableMinutes,
  detentionNotifyThresholdMinutes,
  resolveDetentionRatePerHourCents,
  resolveFreeTimeMinutes,
  shouldNotifyCustomerAtThreshold,
} from "./detention.lib.js";

async function withCompany<T>(userId: string, operatingCompanyId: string, fn: (client: PoolClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, operatingCompanyId);
    return fn(client);
  });
}

function rowAccrual(row: Record<string, unknown>, nowMs = Date.now()) {
  const billable = computeDetentionBillableMinutes({
    started_at: String(row.started_at),
    stopped_at: row.stopped_at ? String(row.stopped_at) : null,
    free_time_minutes: Number(row.free_time_minutes ?? 0),
    nowMs,
  });
  const amount = computeDetentionAccrualCents(billable, Number(row.rate_per_hour_cents ?? 0));
  return { billable_minutes: billable, accrued_amount_cents: amount };
}

export async function syncDetentionEventsFromStopArrivals(userId: string, operatingCompanyId: string) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const started = await client.query(
      `
        INSERT INTO dispatch.detention_events (
          operating_company_id, load_id, stop_id, stop_arrival_id, unit_id, driver_id,
          status, started_at, free_time_minutes, rate_per_hour_cents, notify_threshold_minutes
        )
        SELECT
          sa.operating_company_id,
          ls.load_id,
          sa.stop_id,
          sa.id,
          sa.unit_id,
          sa.driver_id,
          'accruing',
          COALESCE(sa.confirmed_at, sa.triggered_at),
          CASE WHEN ls.stop_type::text = 'pickup'
            THEN COALESCE(c.free_time_pickup_minutes, 120)
            ELSE COALESCE(c.free_time_delivery_minutes, 120)
          END,
          GREATEST(
            COALESCE(l.detention_bill_customer_per_hour_cents, 0),
            COALESCE(ROUND(c.detention_rate_per_hour * 100)::int, 0)
          ),
          $2::int
        FROM dispatch.stop_arrivals sa
        JOIN mdata.load_stops ls ON ls.id = sa.stop_id
        JOIN mdata.loads l ON l.id = ls.load_id
                          AND l.operating_company_id = sa.operating_company_id
        JOIN mdata.customers c ON c.id = l.customer_id
                              AND c.operating_company_id = l.operating_company_id
        WHERE sa.operating_company_id = $1::uuid
          AND sa.confirmed_at IS NOT NULL
          AND l.soft_deleted_at IS NULL
          AND l.status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
          AND NOT EXISTS (
            SELECT 1 FROM dispatch.detention_events de
            WHERE de.operating_company_id = sa.operating_company_id
              AND de.stop_id = sa.stop_id
              AND de.status = 'accruing'
          )
        RETURNING id
      `,
      [operatingCompanyId, detentionNotifyThresholdMinutes()]
    );

    const stopped = await client.query(
      `
        UPDATE dispatch.detention_events de
        SET
          status = 'closed',
          stopped_at = COALESCE(ls.actual_departure_at, ls.actual_arrival_at, now()),
          accrued_minutes = GREATEST(
            0,
            EXTRACT(EPOCH FROM (
              COALESCE(ls.actual_departure_at, ls.actual_arrival_at, now()) - de.started_at
            ))::int / 60 - de.free_time_minutes
          ),
          accrued_amount_cents = ROUND(
            (GREATEST(
              0,
              EXTRACT(EPOCH FROM (
                COALESCE(ls.actual_departure_at, ls.actual_arrival_at, now()) - de.started_at
              ))::numeric / 60 - de.free_time_minutes
            ) / 60.0) * de.rate_per_hour_cents
          )::int,
          updated_at = now()
        FROM mdata.load_stops ls
        WHERE de.operating_company_id = $1::uuid
          AND de.status = 'accruing'
          AND ls.id = de.stop_id
          AND (ls.actual_departure_at IS NOT NULL OR ls.actual_arrival_at IS NOT NULL)
        RETURNING de.id
      `,
      [operatingCompanyId]
    );

    return { started: started.rowCount ?? 0, stopped: stopped.rowCount ?? 0 };
  });
}

// DISP-F6470 — LINK-F5171 group (b): `dispatch.detention_events` has always had `load_id`, but
// nothing let a load's own detail view ask "what detention happened on me." The board's own
// `listDetentionBoard` below can't be reused as-is for that: it's the OPERATIONAL queue, scoped to
// `status IN ('accruing', 'closed')` -- a load whose detention was successfully bridged to billing
// (status='billed', the actual completed outcome) would be silently invisible on its own reverse
// section. Same principle as LOAD-WO-REVERSE (LoadWorkOrdersReverseSection.tsx's own comment): "a
// load-scoped read deliberately includes CLOSED work orders -- a completed repair is part of that
// trip's history." A dedicated, minimal, additive query -- no status filter, one load, any outcome.
export async function listDetentionEventsForLoad(userId: string, operatingCompanyId: string, loadId: string) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const res = await client.query(
      `
        SELECT
          de.*,
          l.load_number,
          l.status AS load_status,
          ls.stop_type::text AS stop_type,
          ls.city AS stop_city,
          ls.state AS stop_state
        FROM dispatch.detention_events de
        JOIN mdata.loads l ON l.id = de.load_id
                          AND l.operating_company_id = de.operating_company_id
        JOIN mdata.load_stops ls ON ls.id = de.stop_id
        WHERE de.operating_company_id = $1::uuid
          AND de.load_id = $2::uuid
        ORDER BY de.started_at ASC
      `,
      [operatingCompanyId, loadId]
    );
    const nowMs = Date.now();
    return {
      events: res.rows.map((row) => {
        const accrual = rowAccrual(row, nowMs);
        return {
          ...row,
          billable_minutes: accrual.billable_minutes,
          live_accrued_amount_cents: accrual.accrued_amount_cents,
        };
      }),
    };
  });
}

export async function listDetentionBoard(userId: string, operatingCompanyId: string) {
  await syncDetentionEventsFromStopArrivals(userId, operatingCompanyId);
  return withCompany(userId, operatingCompanyId, async (client) => {
    const res = await client.query(
      `
        SELECT
          de.*,
          l.load_number,
          l.status AS load_status,
          l.customer_id,
          c.customer_name,
          c.ar_email AS customer_email,
          ls.stop_type::text AS stop_type,
          ls.city AS stop_city,
          ls.state AS stop_state,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          u.unit_number
        FROM dispatch.detention_events de
        JOIN mdata.loads l ON l.id = de.load_id
                          AND l.operating_company_id = de.operating_company_id
        JOIN mdata.customers c ON c.id = l.customer_id
                              AND c.operating_company_id = l.operating_company_id
        JOIN mdata.load_stops ls ON ls.id = de.stop_id
        LEFT JOIN mdata.drivers d ON d.id = de.driver_id
                                 AND (
                                   d.operating_company_id = de.operating_company_id
                                   OR EXISTS (
                                     SELECT 1
                                     FROM mdata.driver_company_authorizations detention_board_driver_dca
                                     WHERE detention_board_driver_dca.driver_id = d.id
                                       AND detention_board_driver_dca.company_id = de.operating_company_id
                                       AND detention_board_driver_dca.is_authorized = true
                                       AND detention_board_driver_dca.deactivated_at IS NULL
                                   )
                                 )
        LEFT JOIN mdata.units u ON u.id = de.unit_id
                               AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = de.operating_company_id
        WHERE de.operating_company_id = $1::uuid
          AND de.status IN ('accruing', 'closed')
        ORDER BY de.status ASC, de.started_at ASC
      `,
      [operatingCompanyId]
    );
    const nowMs = Date.now();
    const events = res.rows.map((row) => {
      const accrual = rowAccrual(row, nowMs);
      return {
        ...row,
        billable_minutes: accrual.billable_minutes,
        live_accrued_amount_cents: accrual.accrued_amount_cents,
        notify_due: shouldNotifyCustomerAtThreshold({
          billable_minutes: accrual.billable_minutes,
          notify_threshold_minutes: Number(row.notify_threshold_minutes ?? 0),
          customer_notified_at: row.customer_notified_at ? String(row.customer_notified_at) : null,
        }),
      };
    });
    return {
      count: events.length,
      active_count: events.filter((e) => e.status === "accruing").length,
      notify_threshold_minutes: detentionNotifyThresholdMinutes(),
      events,
    };
  });
}

export async function closeDetentionEvent(
  userId: string,
  operatingCompanyId: string,
  eventId: string,
  stoppedAt?: string
) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const existing = await client.query(
      `SELECT * FROM dispatch.detention_events WHERE id = $1 AND operating_company_id = $2::uuid`,
      [eventId, operatingCompanyId]
    );
    const row = existing.rows[0];
    if (!row) return { ok: false as const, error: "not_found" as const };
    if (row.status !== "accruing") return { ok: false as const, error: "not_accruing" as const };

    const stopAt = stoppedAt ?? new Date().toISOString();
    const billable = computeDetentionBillableMinutes({
      started_at: String(row.started_at),
      stopped_at: stopAt,
      free_time_minutes: Number(row.free_time_minutes ?? 0),
    });
    const amount = computeDetentionAccrualCents(billable, Number(row.rate_per_hour_cents ?? 0));

    const updated = await client.query(
      `
        UPDATE dispatch.detention_events
        SET status = 'closed',
            stopped_at = $3::timestamptz,
            accrued_minutes = $4,
            accrued_amount_cents = $5,
            updated_at = now()
        WHERE id = $1 AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [eventId, operatingCompanyId, stopAt, billable, amount]
    );
    return { ok: true as const, event: updated.rows[0] };
  });
}

// DSP-MONEY-F7132A — extracted so approveDetentionRequest (detention-approval.service.ts) can run
// this bridge INSIDE the same locked transaction as its own status check/flip, instead of as a
// separate, already-committed transaction between the pending_review read and the final invoiced
// write. Body is byte-identical to the previous bridgeDetentionToBilling; the only change is taking
// an existing client instead of opening a new one. bridgeDetentionToBilling below is now a thin
// wrapper so detention.routes.ts's own standalone bridge-billing caller is unaffected.
export async function bridgeDetentionToBillingInClientTx(
  client: PoolClient,
  userId: string,
  operatingCompanyId: string,
  eventId: string
) {
  const existing = await client.query(
    `
      SELECT de.*, l.rate_total_cents, l.quicksave_pending_fields
      FROM dispatch.detention_events de
      JOIN mdata.loads l ON l.id = de.load_id
                        AND l.operating_company_id = de.operating_company_id
      WHERE de.id = $1 AND de.operating_company_id = $2::uuid
    `,
    [eventId, operatingCompanyId]
  );
  const row = existing.rows[0];
  if (!row) return { ok: false as const, error: "not_found" as const };
  if (row.status === "billed") return { ok: false as const, error: "already_billed" as const };

    const billable =
      Number(row.accrued_minutes ?? 0) > 0
        ? Number(row.accrued_minutes)
        : computeDetentionBillableMinutes({
            started_at: String(row.started_at),
            stopped_at: row.stopped_at ? String(row.stopped_at) : new Date().toISOString(),
            free_time_minutes: Number(row.free_time_minutes ?? 0),
          });
    const amount =
      Number(row.accrued_amount_cents ?? 0) > 0
        ? Number(row.accrued_amount_cents)
        : computeDetentionAccrualCents(billable, Number(row.rate_per_hour_cents ?? 0));

    if (amount <= 0) return { ok: false as const, error: "zero_accrual" as const };

    const bridge = buildDetentionAccessorialBridge({
      detention_event_id: String(row.id),
      load_id: String(row.load_id),
      amount_cents: amount,
      billable_minutes: billable,
    });

    const pending = (row.quicksave_pending_fields ?? {}) as Record<string, unknown>;
    const priorRows = Array.isArray(pending.accessorial_bridge_rows)
      ? (pending.accessorial_bridge_rows as unknown[])
      : [];
    const accessorial_bridge_rows = [...priorRows, bridge];

    const loadUpdate = await client.query<{ rate_total_cents: string | number | null }>(
      `
        UPDATE mdata.loads
        SET rate_total_cents = COALESCE(rate_total_cents, 0) + $2,
            quicksave_pending_fields = COALESCE(quicksave_pending_fields, '{}'::jsonb)
              || jsonb_build_object('accessorial_bridge_rows', $3::jsonb),
            updated_at = now()
        WHERE id = $1
        RETURNING rate_total_cents
      `,
      [row.load_id, amount, JSON.stringify(accessorial_bridge_rows)]
    );

    // ACCT-F5624 — the UPDATE above just raised the load's billable total, but a draft/proforma
    // invoice minted at booking time is a snapshot taken once and never re-read on its own
    // (buildInvoiceFromLoad's idempotency check returns any existing non-void invoice UNCHANGED by
    // design — see from-load.ts's ACCT-F267 comment on why it refuses to silently touch a document
    // the customer may have already seen). Without this call, the detention amount landed on
    // rate_total_cents but never reached the invoice line or its total whenever a proforma already
    // existed for the load — while detention_requests.status still flipped to 'invoiced' and the
    // customer notification still fired, both asserting the charge was billed when it was not.
    // resyncProformaInvoiceFromLoadRate is idempotent, scoped to draft/proforma + non-void only, and
    // is the SAME function update-load.service.ts / loads.routes.ts already call for a plain rate
    // edit — this closes the identical gap for the detention-specific rate-raising path, which never
    // got wired to it. Called from here (not from each caller) because this bridge has two callers
    // (detention-approval.service.ts's approveDetentionRequest AND detention.routes.ts's standalone
    // bridge-billing route) and both need the same fix.
    await resyncProformaInvoiceFromLoadRate(client, {
      loadId: String(row.load_id),
      operatingCompanyId,
      newRateTotalCents: Number(loadUpdate.rows[0]?.rate_total_cents ?? 0),
      userId,
    });

    const updated = await client.query(
      `
        UPDATE dispatch.detention_events
        SET status = 'billed',
            billing_bridge_accessorial = $3::jsonb,
            billing_bridged_at = now(),
            accrued_minutes = $4,
            accrued_amount_cents = $5,
            updated_at = now()
        WHERE id = $1 AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [eventId, operatingCompanyId, JSON.stringify(bridge), billable, amount]
    );

    await appendCrudAudit(
      client,
      userId,
      "dispatch.detention.billing_bridged",
      {
        detention_event_id: eventId,
        load_id: row.load_id,
        operating_company_id: operatingCompanyId,
        bridge,
      },
      "info",
      "B21-D5"
    );

  return { ok: true as const, event: updated.rows[0], bridge };
}

/** Thin wrapper preserving the original standalone-transaction behavior for its other caller
 * (detention.routes.ts's bridge-billing route). approveDetentionRequest calls the InClientTx form
 * above directly so the row lock it holds spans this bridge too. */
export async function bridgeDetentionToBilling(
  userId: string,
  operatingCompanyId: string,
  eventId: string
) {
  return withCompany(userId, operatingCompanyId, (client) =>
    bridgeDetentionToBillingInClientTx(client, userId, operatingCompanyId, eventId)
  );
}

export async function notifyCustomerDetentionThreshold(
  userId: string,
  operatingCompanyId: string,
  eventId: string
) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const res = await client.query(
      `
        SELECT de.*, l.load_number, c.customer_name, c.ar_email
        FROM dispatch.detention_events de
        JOIN mdata.loads l ON l.id = de.load_id
                          AND l.operating_company_id = de.operating_company_id
        JOIN mdata.customers c ON c.id = l.customer_id
                              AND c.operating_company_id = l.operating_company_id
        WHERE de.id = $1 AND de.operating_company_id = $2::uuid
      `,
      [eventId, operatingCompanyId]
    );
    const row = res.rows[0];
    if (!row) return { ok: false as const, error: "not_found" as const };

    const billable = computeDetentionBillableMinutes({
      started_at: String(row.started_at),
      stopped_at: row.stopped_at ? String(row.stopped_at) : null,
      free_time_minutes: Number(row.free_time_minutes ?? 0),
    });
    if (
      !shouldNotifyCustomerAtThreshold({
        billable_minutes: billable,
        notify_threshold_minutes: Number(row.notify_threshold_minutes ?? 0),
        customer_notified_at: row.customer_notified_at ? String(row.customer_notified_at) : null,
      })
    ) {
      return { ok: false as const, error: "below_threshold" as const };
    }

    const email = row.ar_email ? String(row.ar_email).trim() : "";
    if (!email) return { ok: false as const, error: "no_customer_email" as const };

    const amount = computeDetentionAccrualCents(billable, Number(row.rate_per_hour_cents ?? 0));
    await sendEmail({
      sender: "dispatch",
      to: email,
      subject: `Detention accruing — Load ${row.load_number}`,
      html: `<p>Load <strong>${row.load_number}</strong> (${row.customer_name ?? "customer"}) has detention accruing.</p>
             <p>Billable time: ${billable} minutes · Estimated accrual: $${(amount / 100).toFixed(2)}</p>`,
      text: `Load ${row.load_number} detention accruing. Billable ${billable} min, est $${(amount / 100).toFixed(2)}.`,
      eventClass: "dispatch.detention.customer_threshold_notified",
      actorUserId: userId,
    });

    await client.query(
      `UPDATE dispatch.detention_events SET customer_notified_at = now(), updated_at = now() WHERE id = $1`,
      [eventId]
    );

    await appendCrudAudit(
      client,
      userId,
      "dispatch.detention.customer_notified",
      {
        detention_event_id: eventId,
        load_id: row.load_id,
        operating_company_id: operatingCompanyId,
        customer_email: email,
        billable_minutes: billable,
      },
      "info",
      "B21-D5"
    );

    return { ok: true as const, notified_at: new Date().toISOString() };
  });
}

/** Exported for unit-style route tests. */
export { resolveFreeTimeMinutes, resolveDetentionRatePerHourCents };
