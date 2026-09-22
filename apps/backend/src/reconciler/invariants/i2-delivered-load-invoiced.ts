import { finalActiveDeliveryDepartureAt } from "../../accounting/revrec-delivery-posting/poster.service.js";
import { canonicalActiveLoadInvoiceExclusionCte } from "../../dispatch/canonical-active-load-set.js";
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
};

/**
 * "Delivered" is read from evidence, never from mdata.loads.status (stale in both directions on fed
 * data — dispatch/canonical-active-load-set.ts): Faro bought the load's invoice, the final delivery
 * stop departed (the revrec poster's own finalActiveDeliveryDepartureAt), or an active manual
 * delivery authorization exists. "Invoiced" is the canonical issued-invoice test, imported. No
 * status filter at all, so a Faro purchase on a cancelled load surfaces as the contradiction it is.
 */
export const I2_SQL = `
  SELECT l.id::text AS load_id,
         l.load_number,
         l.status::text AS load_status,
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

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function i2ExceptionForRow(row: Row, departedAt: string | null): ReconcilerException | null {
  const faroCents = row.faro_gross_cents === null ? null : Number(row.faro_gross_cents);
  if (faroCents === null && !departedAt && !row.authorized_at) return null;

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
  } else {
    reason = `A manual delivery authorization was recorded on ${String(row.authorized_at).slice(0, 10)}, but no invoice has been issued.`;
    since = String(row.authorized_at);
    sinceSource = "dispatch.manual_delivery_authorizations.authorized_at";
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
    repair_engine: null,
    amount_cents: faroCents,
    amount_source: faroCents === null ? null : "factor.faro_invoice_lines.gross_amount_cents",
  };
}

export const i2DeliveredLoadInvoiced: Invariant = {
  id: INVARIANT_ID,
  title: "A delivered load has an issued invoice",
  ownerSeat: OWNER_SEAT,
  repairEngine: null,
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
