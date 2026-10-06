/**
 * ROUND 326 item 1 part B — the customer profile surface, one read. Eight blocks, each returning a value or a
 * NAMED reason it is empty (never a placeholder): AR aging · credit limit and exposure · open loads ·
 * payment history · factoring eligibility · documents · contacts · rate history.
 *
 * Every number reads the canonical table (accounting.invoices / accounting.payments / mdata.loads /
 * accounting.factoring_purchase_lines / docs.file_links / mdata.customer_contacts). Voided rows never count.
 * Every row carries the id the screen drills to (invoice, payment, load, purchase, file).
 */

import { canonicalNotCancelledLoadClause } from "../../dispatch/canonical-active-load-set.js";

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export type ProfileBlock<T> = { value: T; empty_reason: string | null };

/** A load is open until it is invoiced, closed or cancelled. */
export const OPEN_LOAD_PREDICATE_SQL = `
  l.voided_at IS NULL AND l.soft_deleted_at IS NULL AND l.canceled_at IS NULL
  AND coalesce(l.is_quicksave_draft, false) = false
  AND l.status NOT IN ('closed', 'invoiced', 'cancelled')`;

const n = (v: unknown) => Number(v ?? 0);

export async function readCustomerProfile(client: Q, companyId: string, customerId: string) {
  const cust = (
    await client.query(
      `SELECT c.id, c.customer_name, c.status, c.deactivated_at,
              coalesce(c.credit_limit_cents, round(c.credit_limit * 100)::bigint) AS credit_limit_cents,
              c.credit_limit_source, c.credit_limit_updated_at,
              c.factoring_eligible, c.factoring_company_vendor_id, c.factoring_recourse_type,
              c.factoring_advance_rate_override, c.factoring_reserve_pct_override,
              fv.vendor_name AS factoring_company_name
         FROM mdata.customers c
         LEFT JOIN mdata.vendors fv ON fv.id = c.factoring_company_vendor_id
        WHERE c.id = $1 AND c.operating_company_id = $2::uuid`,
      [customerId, companyId]
    )
  ).rows[0];
  if (!cust) return null;

  // 1. AR aging — open, non-void invoices bucketed by days past due (no due date = current).
  const agingRow = (
    await client.query(
      `SELECT
         coalesce(sum(amount_open_cents) FILTER (WHERE due_date IS NULL OR due_date >= current_date), 0) AS current_cents,
         coalesce(sum(amount_open_cents) FILTER (WHERE current_date - due_date BETWEEN 1 AND 30), 0) AS d1_30_cents,
         coalesce(sum(amount_open_cents) FILTER (WHERE current_date - due_date BETWEEN 31 AND 60), 0) AS d31_60_cents,
         coalesce(sum(amount_open_cents) FILTER (WHERE current_date - due_date BETWEEN 61 AND 90), 0) AS d61_90_cents,
         coalesce(sum(amount_open_cents) FILTER (WHERE current_date - due_date > 90), 0) AS d90_plus_cents,
         coalesce(sum(amount_open_cents), 0) AS total_open_cents,
         coalesce(sum(amount_open_cents) FILTER (WHERE due_date < current_date), 0) AS overdue_cents,
         count(*)::int AS open_invoice_count
       FROM accounting.invoices
      WHERE operating_company_id = $1::uuid AND customer_id = $2
        AND voided_at IS NULL AND status <> 'void' AND amount_open_cents > 0`,
      [companyId, customerId]
    )
  ).rows[0];
  const aging = {
    current_cents: n(agingRow.current_cents),
    d1_30_cents: n(agingRow.d1_30_cents),
    d31_60_cents: n(agingRow.d31_60_cents),
    d61_90_cents: n(agingRow.d61_90_cents),
    d90_plus_cents: n(agingRow.d90_plus_cents),
    total_open_cents: n(agingRow.total_open_cents),
    overdue_cents: n(agingRow.overdue_cents),
    open_invoice_count: n(agingRow.open_invoice_count),
  };

  // 3. Open loads — not yet invoiced / closed / cancelled. Un-invoiced revenue is part of exposure.
  const openLoads = (
    await client.query(
      `SELECT l.id, l.load_number, l.status, l.rate_total_cents,
              (SELECT s.city || ', ' || s.state FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.stop_type = 'pickup'
                ORDER BY s.sequence_number LIMIT 1) AS origin,
              (SELECT s.city || ', ' || s.state FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.stop_type = 'delivery'
                ORDER BY s.sequence_number DESC LIMIT 1) AS destination,
              EXISTS (SELECT 1 FROM accounting.invoices i
                       WHERE i.source_load_id = l.id AND i.voided_at IS NULL AND i.status <> 'void') AS invoiced
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.customer_id = $2 AND ${OPEN_LOAD_PREDICATE_SQL}
        ORDER BY l.created_at DESC`,
      [companyId, customerId]
    )
  ).rows.map((r) => ({ ...r, rate_total_cents: n(r.rate_total_cents) }));
  const uninvoicedOpenLoadCents = openLoads.filter((l) => !l.invoiced).reduce((s, l) => s + l.rate_total_cents, 0);

  // 2. Credit limit and exposure = open AR + un-invoiced open-load revenue.
  const limit = cust.credit_limit_cents == null ? null : n(cust.credit_limit_cents);
  const exposure = aging.total_open_cents + uninvoicedOpenLoadCents;
  const credit = {
    credit_limit_cents: limit,
    credit_limit_source: cust.credit_limit_source ?? null,
    credit_limit_updated_at: cust.credit_limit_updated_at ?? null,
    open_ar_cents: aging.total_open_cents,
    uninvoiced_open_load_cents: uninvoicedOpenLoadCents,
    exposure_cents: exposure,
    available_cents: limit == null ? null : limit - exposure,
    over_limit: limit != null && exposure > limit,
  };

  // 4. Payment history — non-void receive-payments, newest first, with days-to-pay off the applications.
  const payments = (
    await client.query(
      `SELECT p.id, p.display_id, p.payment_date, p.payment_method, p.reference,
              p.amount_cents, p.amount_applied_cents, p.amount_unapplied_cents,
              (SELECT round(avg(p.payment_date - i.issue_date))::int
                 FROM accounting.payment_applications a JOIN accounting.invoices i ON i.id = a.invoice_id
                WHERE a.payment_id = p.id AND a.unapplied_at IS NULL AND i.issue_date IS NOT NULL) AS days_to_pay
         FROM accounting.payments p
        WHERE p.operating_company_id = $1::uuid AND p.customer_id = $2 AND p.voided_at IS NULL
        ORDER BY p.payment_date DESC NULLS LAST, p.created_at DESC
        LIMIT 25`,
      [companyId, customerId]
    )
  ).rows.map((r) => ({ ...r, amount_cents: n(r.amount_cents), amount_applied_cents: n(r.amount_applied_cents), amount_unapplied_cents: n(r.amount_unapplied_cents) }));
  const payTotals = (
    await client.query(
      `SELECT count(*)::int AS payment_count, coalesce(sum(amount_cents), 0) AS paid_cents, max(payment_date) AS last_payment_date
         FROM accounting.payments WHERE operating_company_id = $1::uuid AND customer_id = $2 AND voided_at IS NULL`,
      [companyId, customerId]
    )
  ).rows[0];
  const dtp = payments.map((p) => p.days_to_pay).filter((d): d is number => typeof d === "number");

  // 5. Factoring eligibility + what the factor actually bought for this customer.
  const factored = (
    await client.query(
      `SELECT count(*)::int AS lines, coalesce(sum(fl.gross_cents), 0) AS gross_cents, max(fp.purchase_date) AS last_purchase_date
         FROM accounting.factoring_purchase_lines fl
         JOIN accounting.factoring_purchases fp ON fp.id = fl.purchase_id
        WHERE fl.operating_company_id = $1::uuid AND fl.customer_id = $2 AND fl.voided_at IS NULL AND fp.voided_at IS NULL`,
      [companyId, customerId]
    )
  ).rows[0];
  const factoring = {
    eligible: cust.factoring_eligible === true,
    factoring_company_vendor_id: cust.factoring_company_vendor_id ?? null,
    factoring_company_name: cust.factoring_company_name ?? null,
    recourse_type: cust.factoring_recourse_type ?? null,
    advance_rate_override: cust.factoring_advance_rate_override == null ? null : n(cust.factoring_advance_rate_override),
    reserve_pct_override: cust.factoring_reserve_pct_override == null ? null : n(cust.factoring_reserve_pct_override),
    purchased_line_count: n(factored.lines),
    purchased_gross_cents: n(factored.gross_cents),
    last_purchase_date: factored.last_purchase_date ?? null,
  };

  // 6. Documents linked to the customer (docs.file_links, live links only).
  const documents = (
    await client.query(
      `SELECT f.id AS file_id, f.original_filename, f.mime_type, f.document_date, f.expiration_date, fl.created_at AS linked_at
         FROM docs.file_links fl JOIN docs.files f ON f.id = fl.file_id
        WHERE fl.entity_type = 'customer' AND fl.entity_id = $2 AND fl.deleted_at IS NULL
          AND f.deleted_at IS NULL AND f.operating_company_id = $1::uuid
        ORDER BY fl.created_at DESC`,
      [companyId, customerId]
    )
  ).rows;

  // 7. Contacts (active).
  const contacts = (
    await client.query(
      `SELECT uuid AS id, name, title, email, phone, mobile, department, is_primary
         FROM mdata.customer_contacts WHERE customer_uuid = $1 AND deactivated_at IS NULL
        ORDER BY is_primary DESC, name`,
      [customerId]
    )
  ).rows;

  // 8. Rate history — every non-void, non-cancelled load with a rate: lane, date, rate, rate per loaded mile.
  const rates = (
    await client.query(
      `SELECT l.id AS load_id, l.load_number, l.rate_total_cents, l.loaded_miles,
              p.city || ', ' || p.state AS origin, d.city || ', ' || d.state AS destination,
              coalesce(p.scheduled_arrival_at, l.created_at) AS pickup_at
         FROM mdata.loads l
         LEFT JOIN LATERAL (SELECT city, state, scheduled_arrival_at FROM mdata.load_stops
                             WHERE load_id = l.id AND soft_deleted_at IS NULL AND stop_type = 'pickup'
                             ORDER BY sequence_number LIMIT 1) p ON true
         LEFT JOIN LATERAL (SELECT city, state FROM mdata.load_stops
                             WHERE load_id = l.id AND soft_deleted_at IS NULL AND stop_type = 'delivery'
                             ORDER BY sequence_number DESC LIMIT 1) d ON true
        WHERE l.operating_company_id = $1::uuid AND l.customer_id = $2
          AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL AND l.canceled_at IS NULL
          AND ${canonicalNotCancelledLoadClause("l")} AND coalesce(l.rate_total_cents, 0) > 0
        ORDER BY pickup_at DESC
        LIMIT 50`,
      [companyId, customerId]
    )
  ).rows.map((r) => {
    const miles = r.loaded_miles == null ? null : n(r.loaded_miles);
    const cents = n(r.rate_total_cents);
    return { ...r, rate_total_cents: cents, loaded_miles: miles, rate_per_mile_cents: miles && miles > 0 ? Math.round(cents / miles) : null };
  });

  const block = <T>(value: T, reason: string | null): ProfileBlock<T> => ({ value, empty_reason: reason });

  return {
    customer: { id: cust.id, name: cust.customer_name, status: cust.status, deactivated_at: cust.deactivated_at },
    ar_aging: block(aging, aging.open_invoice_count === 0 ? "No open invoices — every invoice is paid or none has been issued." : null),
    credit: block(credit, limit == null ? "No credit limit is set on this customer; exposure is shown without a limit to compare against." : null),
    open_loads: block(openLoads, openLoads.length === 0 ? "No load is open — every load is invoiced, closed or cancelled." : null),
    payment_history: block(
      {
        payment_count: n(payTotals.payment_count),
        paid_cents: n(payTotals.paid_cents),
        last_payment_date: payTotals.last_payment_date ?? null,
        avg_days_to_pay: dtp.length ? Math.round(dtp.reduce((s, d) => s + d, 0) / dtp.length) : null,
        recent: payments,
      },
      n(payTotals.payment_count) === 0 ? "No payment has been received from this customer." : null
    ),
    factoring: block(factoring, !factoring.eligible ? "Customer is marked not eligible for factoring." : null),
    documents: block(documents, documents.length === 0 ? "No document is linked to this customer." : null),
    contacts: block(contacts, contacts.length === 0 ? "No active contact is on file." : null),
    rate_history: block(rates, rates.length === 0 ? "No rated load has been booked for this customer." : null),
  };
}
