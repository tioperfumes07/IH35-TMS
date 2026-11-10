/**
 * ACCT-F11081 (register row 88) — THE settlement paid-status writer from real payment documents.
 *
 * Root cause measured on prod 2026-11-03: a settlement's net pay is the open balance of its per-load A/P bills
 * (driver_finance.driver_settlement_gl_bills → accounting.bills). The one bill-payment writer (bills.service payBill /
 * voidBillPayment) moved accounting.bills.paid_cents/status but NOTHING rolled that back up to
 * driver_finance.driver_settlements.payment_state / paid_at — the only writers of those columns were the manual
 * Mark-Paid / ACH-rail buttons (settlement-payment.service.ts). So a settlement whose net pay was fully paid through a
 * real bill payment (Pay Bill, or the close's own net-pay step) still read "unpaid" forever.
 *
 * Rule (no guessing, no bank lines): a settlement is PAID here only when
 *   • every live bill of its posted GL run is open 0 (none voided), AND
 *   • the REAL cash bill payments on those bills (posted, not voided/revoked, NOT a non-cash settlement deduction
 *     application, not sample) total at least its net pay, AND net pay > 0.
 * Then payment_state = 'manual_paid', paid_at = the last payment's date, method/reference from that payment, and a
 * 'marked_paid_manually' payment event carrying source = 'bill_payment' + the payment ids. A settlement with no real
 * payment document is never touched. Reopen is symmetric and only undoes what THIS writer did (its last paid event's
 * source = 'bill_payment'); a human Mark Paid is never reopened here. Bank lines are never read or matched.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { liveBill, notVoided, statusNotCancelled } from "../accounting/live-document-predicates.sql.js";

type Queryable = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export type SettlementNetPaidRow = {
  settlement_id: string;
  display_id: string | null;
  payment_state: string | null;
  net_cents: string;
  bill_count: string;
  open_cents: string;
  dead_bills: string;
  cash_cents: string;
  last_payment_date: string | null;
  bill_payment_ids: string[] | null;
  last_method: string | null;
  last_reference: string | null;
  fully_paid: boolean;
  paid_by_rollup: boolean;
};

/**
 * $1 operating company · $2 settlement ids (NULL = all) · $3 bill ids (NULL = all; else the settlements carrying them).
 * Exported so the guard pins the exact predicate (real cash only, posted run only, live rows only).
 */
export const SETTLEMENT_NET_PAID_SQL = `
  WITH scope AS (
    SELECT DISTINCT g.settlement_id
      FROM driver_finance.driver_settlement_gl_bills g
     WHERE g.operating_company_id = $1::uuid
       AND ($2::uuid[] IS NULL OR g.settlement_id = ANY($2::uuid[]))
       AND ($3::uuid[] IS NULL OR g.accounting_bill_id = ANY($3::uuid[]))
  ), live AS (
    SELECT DISTINCT g.settlement_id, g.accounting_bill_id
      FROM driver_finance.driver_settlement_gl_bills g
      JOIN driver_finance.driver_settlement_gl_runs r
        ON r.id = g.run_id AND r.operating_company_id = g.operating_company_id AND r.status = 'posted'
     WHERE g.operating_company_id = $1::uuid
       AND g.superseded_at IS NULL
       AND g.accounting_bill_id IS NOT NULL
       AND g.settlement_id IN (SELECT settlement_id FROM scope)
  ), bills AS (
    SELECT l.settlement_id,
           count(*)::bigint AS bill_count,
           coalesce(sum(GREATEST(b.amount_cents - coalesce(b.paid_cents, 0), 0))
                    FILTER (WHERE ${notVoided("b")} AND b.revoked_at IS NULL), 0)::bigint AS open_cents,
           count(*) FILTER (WHERE NOT ${liveBill("b")})::bigint AS dead_bills
      FROM live l
      JOIN accounting.bills b ON b.id = l.accounting_bill_id AND b.operating_company_id = $1::uuid
     GROUP BY l.settlement_id
  ), cash AS (
    SELECT l.settlement_id,
           sum(bp.amount_cents)::bigint AS cash_cents,
           max(bp.payment_date)::date::text AS last_payment_date,
           array_agg(bp.id::text ORDER BY bp.payment_date, bp.id) AS bill_payment_ids,
           (array_agg(bp.payment_method::text ORDER BY bp.payment_date DESC, bp.id))[1] AS last_method,
           (array_agg(coalesce(nullif(bp.reference_number, ''), nullif(bp.check_number, '')) ORDER BY bp.payment_date DESC, bp.id))[1] AS last_reference
      FROM live l
      JOIN accounting.bill_payments bp ON bp.bill_id = l.accounting_bill_id AND bp.operating_company_id = $1::uuid
     WHERE bp.status::text = 'posted'
       AND ${notVoided("bp")}
       AND bp.revoked_at IS NULL
       AND coalesce(bp.settlement_deduction_noncash, false) = false
       AND coalesce(bp.is_sample_data, false) = false
     GROUP BY l.settlement_id
  ), last_paid_event AS (
    SELECT DISTINCT ON (e.settlement_id) e.settlement_id, e.event_type, e.payload
      FROM driver_finance.settlement_payment_events e
     WHERE e.operating_company_id = $1::uuid
       AND e.settlement_id IN (SELECT settlement_id FROM scope)
       AND e.event_type IN ('marked_paid_manually', 'reopened_correction')
     ORDER BY e.settlement_id, e.created_at DESC, e.id DESC
  )
  SELECT s.id::text AS settlement_id, s.display_id, s.payment_state,
         round(coalesce(s.net_pay, 0) * 100)::bigint::text AS net_cents,
         coalesce(bills.bill_count, 0)::text AS bill_count,
         coalesce(bills.open_cents, 0)::text AS open_cents,
         coalesce(bills.dead_bills, 0)::text AS dead_bills,
         coalesce(cash.cash_cents, 0)::text AS cash_cents,
         cash.last_payment_date, cash.bill_payment_ids, cash.last_method, cash.last_reference,
         (${notVoided("s")} AND ${statusNotCancelled("s")}
          AND coalesce(bills.bill_count, 0) > 0
          AND round(coalesce(s.net_pay, 0) * 100) > 0
          AND coalesce(bills.dead_bills, 0) = 0
          AND coalesce(bills.open_cents, 0) = 0
          AND coalesce(cash.cash_cents, 0) >= round(coalesce(s.net_pay, 0) * 100)) AS fully_paid,
         (s.payment_state = 'manual_paid' AND lpe.event_type = 'marked_paid_manually'
          AND lpe.payload->>'source' = 'bill_payment') AS paid_by_rollup
    FROM driver_finance.driver_settlements s
    LEFT JOIN bills ON bills.settlement_id = s.id
    LEFT JOIN cash ON cash.settlement_id = s.id
    LEFT JOIN last_paid_event lpe ON lpe.settlement_id = s.id
   WHERE s.operating_company_id = $1::uuid
     AND s.id IN (SELECT settlement_id FROM scope)
     AND coalesce(s.is_sample_data, false) = false
   ORDER BY s.display_id
`;

/** Pure decision — exported for the unit test and the guard. */
export function decideSettlementPaidTransition(row: Pick<SettlementNetPaidRow, "payment_state" | "fully_paid" | "paid_by_rollup">):
  | "mark_paid"
  | "reopen"
  | "none" {
  const state = row.payment_state ?? "unpaid";
  if (row.fully_paid) {
    // Only states with no disbursement on record move; a rail in flight (sent_to_bank) or a terminal state stays.
    return state === "unpaid" || state === "queued" || state === "bounced" ? "mark_paid" : "none";
  }
  return row.paid_by_rollup ? "reopen" : "none";
}

export type SettlementPaidRollupResult = { examined: number; marked_paid: string[]; reopened: string[] };

export async function rollupSettlementPaidStatusInClientTx(
  client: Queryable,
  operatingCompanyId: string,
  scope: { settlementIds?: string[] | null; billIds?: string[] | null },
  userId: string
): Promise<SettlementPaidRollupResult> {
  const settlementIds = scope.settlementIds && scope.settlementIds.length ? scope.settlementIds : null;
  const billIds = scope.billIds && scope.billIds.length ? scope.billIds : null;
  const rows = (await client.query<SettlementNetPaidRow>(SETTLEMENT_NET_PAID_SQL, [operatingCompanyId, settlementIds, billIds])).rows;
  const out: SettlementPaidRollupResult = { examined: rows.length, marked_paid: [], reopened: [] };
  for (const row of rows) {
    const action = decideSettlementPaidTransition(row);
    if (action === "none") continue;
    if (action === "mark_paid") {
      const upd = await client.query<{ id: string }>(
        `UPDATE driver_finance.driver_settlements
            SET payment_state = 'manual_paid',
                payment_method = COALESCE($3, payment_method),
                payment_bank_reference = COALESCE($4, payment_bank_reference),
                paid_at = COALESCE(paid_at, $5::date::timestamptz, now()),
                updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
            AND payment_state IS NOT DISTINCT FROM $6
          RETURNING id::text`,
        [row.settlement_id, operatingCompanyId, row.last_method, row.last_reference, row.last_payment_date, row.payment_state]
      );
      if (!upd.rows[0]) continue; // concurrent transition won — nothing to record
      const payload = {
        source: "bill_payment",
        bill_payment_ids: row.bill_payment_ids ?? [],
        cash_cents: Number(row.cash_cents),
        net_cents: Number(row.net_cents),
        previous_state: row.payment_state ?? "unpaid",
      };
      await client.query(
        `INSERT INTO driver_finance.settlement_payment_events
           (settlement_id, operating_company_id, event_type, payload, user_id, idempotency_key, created_at)
         VALUES ($1::uuid, $2::uuid, 'marked_paid_manually', $3::jsonb, $4::uuid, $5, now())
         ON CONFLICT (settlement_id, event_type, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
        [row.settlement_id, operatingCompanyId, JSON.stringify(payload), userId, `bill_payment_paid:${(row.bill_payment_ids ?? []).join(",")}`]
      );
      await appendCrudAudit(client as never, userId, "driver_pay.settlement.paid_from_bill_payment", {
        resource_type: "driver_finance.driver_settlements",
        resource_id: row.settlement_id,
        operating_company_id: operatingCompanyId,
        display_id: row.display_id,
        ...payload,
      }, "info", "ACCT-F11081");
      out.marked_paid.push(row.settlement_id);
      continue;
    }
    const upd = await client.query<{ id: string }>(
      `UPDATE driver_finance.driver_settlements
          SET payment_state = 'unpaid', payment_method = NULL, payment_bank_reference = NULL, paid_at = NULL, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND payment_state = 'manual_paid'
        RETURNING id::text`,
      [row.settlement_id, operatingCompanyId]
    );
    if (!upd.rows[0]) continue;
    const payload = {
      source: "bill_payment_voided",
      remaining_cash_cents: Number(row.cash_cents),
      open_cents: Number(row.open_cents),
      net_cents: Number(row.net_cents),
      previous_state: "manual_paid",
    };
    await client.query(
      `INSERT INTO driver_finance.settlement_payment_events
         (settlement_id, operating_company_id, event_type, payload, user_id, idempotency_key, created_at)
       VALUES ($1::uuid, $2::uuid, 'reopened_correction', $3::jsonb, $4::uuid, NULL, now())`,
      [row.settlement_id, operatingCompanyId, JSON.stringify(payload), userId]
    );
    await appendCrudAudit(client as never, userId, "driver_pay.settlement.paid_reopened_bill_payment_voided", {
      resource_type: "driver_finance.driver_settlements",
      resource_id: row.settlement_id,
      operating_company_id: operatingCompanyId,
      display_id: row.display_id,
      ...payload,
    }, "warning", "ACCT-F11081");
    out.reopened.push(row.settlement_id);
  }
  return out;
}

/**
 * The engine's repair for existing rows: one company, every settlement on the GL spine, same rule as the live writer.
 * Writes only where a real cash bill payment fully pays net — a settlement with no payment document stays unpaid.
 */
export async function repairSettlementPaidStatus(operatingCompanyId: string, userId: string): Promise<SettlementPaidRollupResult> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return rollupSettlementPaidStatusInClientTx(client as unknown as Queryable, operatingCompanyId, {}, userId);
  });
}
