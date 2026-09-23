import { finalActiveDeliveryDepartureAt } from "../../accounting/revrec-delivery-posting/poster.service.js";
import { canonicalActiveLoadInvoiceExclusionCte, isDeliveredOrLaterStatus } from "../../dispatch/canonical-active-load-set.js";
import type { Invariant, Queryable, ReconcilerException } from "../types.js";

const INVARIANT_ID = "I2";
const OWNER_SEAT = "CC-2";

type Row = {
  load_id: string;
  load_number: string;
  load_status: string;
  faro_gross_cents: string | null;
  faro_invoice_numbers: string | null;
  faro_first_seen: string | null;
  authorized_at: string | null;
  unissued_invoice_statuses: string | null;
  /** mdata.loads.updated_at — only ever used as `since` for the no-evidence-but-status-claims-
   *  delivered branch below, where no real delivery evidence exists to date the breach from. */
  status_since: string;
};

/**
 * "Delivered" is read from evidence, never from mdata.loads.status (stale in both directions on fed
 * data — dispatch/canonical-active-load-set.ts): Faro bought the load's invoice, the final delivery
 * stop departed (the revrec poster's own finalActiveDeliveryDepartureAt), or an active manual
 * delivery authorization exists. "Invoiced" is the canonical issued-invoice test, imported. No
 * status filter at all, so a Faro purchase on a cancelled load surfaces as the contradiction it is.
 *
 * A FOURTH case (2026-09-23, Cursor's I2 finding, 9 loads live): status alone reads
 * delivered-or-later (dispatch/canonical-active-load-set.ts's `isDeliveredOrLaterStatus` — the
 * ONE place that vocabulary lives, imported, never re-declared here) but NONE of the three real
 * evidence signals above exist. Previously silently excluded by the same early-return that
 * correctly skips a load still in dispatch; now reported as the contradiction it is —
 * status-claims-delivered with zero evidence is worse than any of the three evidenced cases, not
 * something to hide. No status filter drives detection (the query is unchanged); the status
 * check only decides which of two paths a no-evidence row takes: silently skip (never claimed
 * delivery) or report (claims delivery, proves nothing).
 */
export const I2_SQL = `
  SELECT l.id::text AS load_id,
         l.load_number,
         l.status::text AS load_status,
         l.updated_at::text AS status_since,
         f.gross_cents::text AS faro_gross_cents,
         f.invoice_numbers AS faro_invoice_numbers,
         f.first_seen::text AS faro_first_seen,
         ma.authorized_at::text AS authorized_at,
         ui.statuses AS unissued_invoice_statuses
    FROM mdata.loads l
    LEFT JOIN LATERAL (
      SELECT sum(fl.gross_amount_cents) AS gross_cents,
             string_agg(fl.invoice_number, ', ' ORDER BY fl.invoice_number) AS invoice_numbers,
             min(fl.created_at) AS first_seen
        FROM factor.faro_invoice_lines fl
       WHERE fl.load_id = l.id
         AND fl.operating_company_id = l.operating_company_id
         AND fl.superseded_at IS NULL
      HAVING count(*) > 0
    ) f ON true
    LEFT JOIN LATERAL (
      SELECT max(m.authorized_at) AS authorized_at
        FROM dispatch.manual_delivery_authorizations m
       WHERE m.load_id = l.id
         AND m.operating_company_id = l.operating_company_id
         AND m.revoked_at IS NULL
    ) ma ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT i.status::text, ', ') AS statuses
        FROM accounting.invoices i
       WHERE i.source_load_id = l.id
         AND i.status::text IN ('draft', 'proforma')
    ) ui ON true
   WHERE l.operating_company_id = $1::uuid
     AND l.soft_deleted_at IS NULL
     AND l.is_sample_data IS NOT TRUE
     AND ${canonicalActiveLoadInvoiceExclusionCte("l.id")}
   ORDER BY l.load_number
`;

export const I2_REPAIR_FROM_LOAD = "POST /api/v1/accounting/invoices/from-load";
export const I2_REPAIR_ISSUE_DRAFT = "POST /api/v1/accounting/invoices/:id/send";

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function i2ExceptionForRow(row: Row, departedAt: string | null): ReconcilerException | null {
  const faroCents = row.faro_gross_cents === null ? null : Number(row.faro_gross_cents);
  const noEvidence = faroCents === null && !departedAt && !row.authorized_at;
  // The original gate: no evidence at all, and status does not even claim delivery — genuinely
  // nothing to flag (a load still in dispatch has no business being in this report).
  if (noEvidence && !isDeliveredOrLaterStatus(row.load_status)) return null;

  let reason: string;
  let since: string;
  let sinceSource: string;
  if (faroCents !== null && row.faro_first_seen) {
    reason = `Faro bought invoice ${row.faro_invoice_numbers} for ${dollars(faroCents)} on this load, but our books have no issued invoice for it.`;
    since = row.faro_first_seen;
    sinceSource = "factor.faro_invoice_lines.created_at";
  } else if (departedAt) {
    reason = `The final delivery stop departed on ${departedAt.slice(0, 10)}, but no invoice has been issued.`;
    since = departedAt;
    sinceSource = "mdata.load_stops.actual_departure_at";
  } else if (row.authorized_at) {
    reason = `A manual delivery authorization was recorded on ${String(row.authorized_at).slice(0, 10)}, but no invoice has been issued.`;
    since = String(row.authorized_at);
    sinceSource = "dispatch.manual_delivery_authorizations.authorized_at";
  } else {
    // Cursor's I2 finding (docs/bus/OUTBOX-CURSOR.md, "9 loads read delivered-or-later with no
    // issued invoice but carry none of that evidence"): status alone claims delivery-or-later,
    // but there is no Faro purchase, no stop departure, and no manual authorization at all — the
    // worst case, previously silently excluded by the `noEvidence` early-return above rather
    // than reported. "Delivered by status" is never trusted alone (this file's own header law),
    // so this is reported as the CONTRADICTION it is — status vs. evidence disagree — not as
    // proof the load is actually delivered. `since` is the load's own record, not delivery
    // evidence, because none exists; that absence is exactly what the reason names.
    reason =
      `This load's status reads "${row.load_status}" (delivered-or-later) but carries no issued ` +
      `invoice AND no delivery evidence at all — no Faro purchase, no recorded stop departure, ` +
      `no manual delivery authorization. Status and evidence disagree; this is not proof the ` +
      `load was actually delivered.`;
    since = row.status_since;
    sinceSource = "mdata.loads.updated_at";
  }
  if (row.unissued_invoice_statuses) reason += ` A ${row.unissued_invoice_statuses} invoice exists but was never issued.`;
  if (row.load_status === "cancelled") reason += " The load reads cancelled.";

  return {
    key: `${INVARIANT_ID}/load/${row.load_id}/invoice`,
    invariant: INVARIANT_ID,
    entity_type: "load",
    entity_id: row.load_id,
    entity_label: row.load_number,
    field: "invoice",
    reason,
    since,
    since_source: sinceSource,
    owner_seat: OWNER_SEAT,
    // An unissued draft is issued, never duplicated: from-load refuses a load that already has one.
    repair_engine: row.unissued_invoice_statuses ? I2_REPAIR_ISSUE_DRAFT : I2_REPAIR_FROM_LOAD,
    amount_cents: faroCents,
    amount_source: faroCents === null ? null : "factor.faro_invoice_lines.gross_amount_cents",
  };
}

export const i2DeliveredLoadInvoiced: Invariant = {
  id: INVARIANT_ID,
  title: "A delivered load has an issued invoice",
  ownerSeat: OWNER_SEAT,
  repairEngine: `${I2_REPAIR_FROM_LOAD} | ${I2_REPAIR_ISSUE_DRAFT}`,
  async detect(client: Queryable, operatingCompanyId: string) {
    const res = await client.query<Row>(I2_SQL, [operatingCompanyId]);
    const out: ReconcilerException[] = [];
    for (const row of res.rows) {
      const departedAt = await finalActiveDeliveryDepartureAt(client, operatingCompanyId, row.load_id);
      const exception = i2ExceptionForRow(row, departedAt);
      if (exception) out.push(exception);
    }
    return out;
  },
};
