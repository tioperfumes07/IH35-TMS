// DWELL-01-D3-DETENTION-DRIVER-PAY-SETTLEMENT-LINE (owner GO-DWELL-01, routed via GO-PENDING-01,
// board finding filed 2026-08-29) — the driver-side leg of detention pay. Customer-side detention
// billing already exists (dispatch/detention-approval.service.ts's approveDetentionRequest bridges
// a closed dispatch.detention_events row into the invoice's rate_total_cents); the driver-side pay
// leg did not exist anywhere in the codebase before this file.
//
// D-3's own rules, enforced here exactly:
//   - "Detention pay posts ONLY from a detention_event with evidence. No event, no line. No
//     exceptions." -> requires a real dispatch.detention_evidence row linked to the event.
//   - "Customer-side detention billing and driver-side detention pay are SEPARATE amounts. Never
//     assume they are equal and never derive one from the other." -> this poster deliberately does
//     NOT read detention_events.accrued_amount_cents (the customer-billing amount, computed off the
//     event's own rate_per_hour_cents -- a contract/customer rate). It recomputes an independent
//     dollar amount from mdata.loads.detention_driver_pay_per_hour_cents (the driver's own pay rate)
//     times the event's accrued_minutes. Reusing accrued_minutes is a deliberate, narrower choice:
//     accrued_minutes is a physical TIME measurement (computeDetentionBillableMinutes, run once at
//     event-close in detention.service.ts closeDetentionEvent()), not a billing policy value -- only
//     the RATE that turns minutes into dollars differs between customer and driver, and this poster
//     applies its own (driver) rate to that shared time measurement rather than re-deriving minutes
//     from raw evidence a second time.
//   - "The line is driver_visible and disputable through the existing dispute columns." ->
//     driver_visible=true, approval_status='pending' (settlement_lines' existing dispute columns are
//     unconditionally available on every line; no extra wiring needed here).
//   - Reversal: NOT implemented in this file. Voiding a detention_event must reverse its settlement
//     line (and, if the owning settlement already posted a JE, that JE too) -- filed as the next
//     slice of this same finding, not attempted in this pass.
//
// NOT YET WIRED TO A JE: this function only writes the driver_finance.settlement_lines row.
// settlement-payrun-close.service.ts's NET formula and its balanced-JE poster do not yet know about
// line_type='detention_pay' -- that integration (a new aggregation query mirroring
// loadReimbursementsCents, a new NET-formula term, a new DR/CR JE leg) is the next slice of this
// same finding, not attempted in this pass. A posted line is real and driver-visible/disputable
// immediately; it simply does not yet reach a settlement's JE until that integration lands.

import { appendCrudAudit } from "../audit/crud-audit.js";
import { getActiveSettlementForDriver } from "./settlements-load-bookended.service.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type PostDetentionPayResult =
  | { kind: "ok"; settlementLineId: string; settlementId: string; amountCents: number; billableMinutes: number }
  | { kind: "not_found" }
  | { kind: "not_closed"; status: string }
  | { kind: "no_driver" }
  | { kind: "no_evidence" }
  | { kind: "already_posted"; settlementLineId: string }
  | { kind: "no_active_settlement" }
  | { kind: "no_driver_pay_rate" }
  | { kind: "no_billable_minutes" };

/**
 * Post the driver-pay settlement line for one closed, evidenced detention event. Idempotent:
 * calling this twice for the same event returns `already_posted` on the second call rather than
 * double-posting. Caller owns the transaction (this function issues no BEGIN/COMMIT) and is
 * responsible for entity scoping the connection (RLS) before calling.
 */
export async function postDetentionPayForEvent(
  client: DbClient,
  input: { detentionEventId: string; operatingCompanyId: string; actorUserId: string }
): Promise<PostDetentionPayResult> {
  const { detentionEventId, operatingCompanyId, actorUserId } = input;

  const eventRes = await client.query<{
    id: string;
    load_id: string;
    driver_id: string | null;
    status: string;
    accrued_minutes: number;
  }>(
    `
      SELECT id::text, load_id::text, driver_id::text, status, accrued_minutes
      FROM dispatch.detention_events
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [detentionEventId, operatingCompanyId]
  );
  const event = eventRes.rows[0];
  if (!event) return { kind: "not_found" };
  if (event.status !== "closed") return { kind: "not_closed", status: event.status };
  if (!event.driver_id) return { kind: "no_driver" };

  const evidenceRes = await client.query<{ id: string }>(
    `SELECT id FROM dispatch.detention_evidence WHERE detention_event_id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [detentionEventId, operatingCompanyId]
  );
  if ((evidenceRes.rows[0] ?? null) === null) return { kind: "no_evidence" };

  const existingRes = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM driver_finance.settlement_lines
      WHERE source_table = 'dispatch.detention_events'
        AND source_reference_id = $1::uuid
        AND is_active = true
      LIMIT 1
    `,
    [detentionEventId]
  );
  const existing = existingRes.rows[0];
  if (existing) return { kind: "already_posted", settlementLineId: existing.id };

  const settlement = await getActiveSettlementForDriver(client, {
    driverId: event.driver_id,
    operatingCompanyId,
  });
  if (!settlement) return { kind: "no_active_settlement" };

  const rateRes = await client.query<{ detention_driver_pay_per_hour_cents: number | null }>(
    `SELECT detention_driver_pay_per_hour_cents FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [event.load_id, operatingCompanyId]
  );
  const rateCents = Number(rateRes.rows[0]?.detention_driver_pay_per_hour_cents ?? 0);
  if (!(rateCents > 0)) return { kind: "no_driver_pay_rate" };

  const billableMinutes = Number(event.accrued_minutes ?? 0);
  if (!(billableMinutes > 0)) return { kind: "no_billable_minutes" };

  const amountCents = Math.round((billableMinutes / 60) * rateCents);
  if (!(amountCents > 0)) return { kind: "no_billable_minutes" };

  const lineRes = await client.query<{ id: string }>(
    `
      INSERT INTO driver_finance.settlement_lines
        (settlement_id, line_type, description, amount, load_id, operating_company_id,
         source_table, source_reference_id, category, source_type, driver_visible, approval_status)
      VALUES
        ($1::uuid, 'detention_pay', $2, $3, $4::uuid, $5::uuid,
         'dispatch.detention_events', $6::uuid, 'detention', 'linked_expense', true, 'pending')
      RETURNING id::text
    `,
    [
      settlement.settlementId,
      `Detention pay — ${billableMinutes} billable min @ $${(rateCents / 100).toFixed(2)}/hr`,
      (amountCents / 100).toFixed(2),
      event.load_id,
      operatingCompanyId,
      detentionEventId,
    ]
  );
  const settlementLineId = String(lineRes.rows[0]!.id);

  await appendCrudAudit(
    client,
    actorUserId,
    "detention_pay.posted",
    {
      detention_event_id: detentionEventId,
      operating_company_id: operatingCompanyId,
      settlement_id: settlement.settlementId,
      settlement_line_id: settlementLineId,
      driver_id: event.driver_id,
      load_id: event.load_id,
      billable_minutes: billableMinutes,
      driver_pay_rate_per_hour_cents: rateCents,
      amount_cents: amountCents,
    },
    "info"
  );

  return { kind: "ok", settlementLineId, settlementId: settlement.settlementId, amountCents, billableMinutes };
}
