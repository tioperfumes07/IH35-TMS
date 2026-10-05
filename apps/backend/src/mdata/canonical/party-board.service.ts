/**
 * ROUND 326.5 — the Customers and Vendors list boards (docs/design/boards/driver-customers-vendors/Customers.dc.html,
 * Vendors.dc.html). Every tile, chip count, row and footer figure is computed here from the canonical tables; no
 * board value is hardcoded. Voided / void rows never count.
 *
 * Customers: accounting.invoices (billed = total_cents, open = amount_open_cents, collected = billed - open).
 * Vendors:   accounting.expenses (+ expense_lines -> catalogs.accounts for category / fuel share), accounting.bills
 *            (open bills = amount_cents - paid_cents), integrations.relay_fuel_transactions (unposted fuel).
 */

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
export type BoardRange = "ytd" | "12m" | "all";

const n = (v: unknown) => Number(v ?? 0);
const rangeStartSql = (r: BoardRange) =>
  r === "ytd" ? "date_trunc('year', current_date)::date" : r === "12m" ? "(current_date - interval '12 months')::date" : "'1900-01-01'::date";

/** Fuel spend = expense lines posted to a fuel, diesel or DEF account. */
export const FUEL_ACCOUNT_SQL = `(a.account_name ~* '(fuel|diesel|\\mDEF\\M)')`;

export async function readCustomerBoard(client: Q, oc: string, range: BoardRange) {
  const from = rangeStartSql(range);
  const rows = (
    await client.query(
      `WITH inv AS (
         SELECT customer_id, count(*)::int AS invoices, sum(total_cents) AS billed, sum(amount_open_cents) AS open,
                count(*) FILTER (WHERE coalesce(amount_paid_cents, 0) > 0)::int AS paid_invoices, max(issue_date) AS last_invoice,
                -- ROUND 297: "Factored" = an invoice actually SOLD to the factor (factoring status or a live purchase
                -- line), never the eligibility flag (1,187 USMCA customers copied from TRANSP all carry it; 0 are factored).
                count(*) FILTER (WHERE coalesce(factoring_status, 'not_factored') <> 'not_factored'
                                    OR EXISTS (SELECT 1 FROM accounting.factoring_purchase_lines pl
                                                WHERE pl.invoice_id = accounting.invoices.id AND pl.voided_at IS NULL))::int AS factored_invoices,
                sum(amount_open_cents) FILTER (WHERE due_date IS NULL OR due_date >= current_date) AS a_current,
                sum(amount_open_cents) FILTER (WHERE current_date - due_date BETWEEN 1 AND 30) AS a_1_30,
                sum(amount_open_cents) FILTER (WHERE current_date - due_date BETWEEN 31 AND 60) AS a_31_60,
                sum(amount_open_cents) FILTER (WHERE current_date - due_date BETWEEN 61 AND 90) AS a_61_90,
                sum(amount_open_cents) FILTER (WHERE current_date - due_date > 90) AS a_90
           FROM accounting.invoices
          WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status <> 'void' AND issue_date >= ${from}
          GROUP BY customer_id)
       SELECT c.id, c.customer_name AS name, c.status::text AS status, c.deactivated_at, c.factoring_eligible,
              fv.vendor_name AS factor_name,
              coalesce(inv.invoices, 0) AS invoices, coalesce(inv.billed, 0) AS billed_cents, coalesce(inv.open, 0) AS open_cents,
              coalesce(inv.billed, 0) - coalesce(inv.open, 0) AS collected_cents, coalesce(inv.paid_invoices, 0) AS paid_invoices,
              coalesce(inv.factored_invoices, 0) AS factored_invoices,
              inv.last_invoice, inv.a_current, inv.a_1_30, inv.a_31_60, inv.a_61_90, inv.a_90
         FROM mdata.customers c
         LEFT JOIN inv ON inv.customer_id = c.id
         LEFT JOIN mdata.vendors fv ON fv.id = c.factoring_company_vendor_id
        WHERE c.operating_company_id = $1::uuid
        ORDER BY coalesce(inv.open, 0) DESC, coalesce(inv.billed, 0) DESC, c.customer_name`,
      [oc]
    )
  ).rows.map((r) => ({
    id: r.id, name: r.name, status: r.deactivated_at ? "inactive" : (r.status ?? "active"),
    factored: n(r.factored_invoices) > 0 ? (r.factor_name ?? "Factored") : null,
    invoices: n(r.invoices), billed_cents: n(r.billed_cents), collected_cents: n(r.collected_cents), open_cents: n(r.open_cents),
    paid_invoices: n(r.paid_invoices), last_invoice: r.last_invoice ?? null,
    aging: { current: n(r.a_current), d1_30: n(r.a_1_30), d31_60: n(r.a_31_60), d61_90: n(r.a_61_90), d90_plus: n(r.a_90) },
  }));
  const withTx = rows.filter((r) => r.invoices > 0);
  const sum = (k: "invoices" | "billed_cents" | "collected_cents" | "open_cents" | "paid_invoices") => withTx.reduce((s, r) => s + r[k], 0);
  return {
    range,
    kpis: {
      with_transactions: withTx.length, in_the_book: rows.length, open_invoices: (await client.query(
        `SELECT count(*)::int AS n FROM accounting.invoices WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status <> 'void'
           AND amount_open_cents > 0 AND issue_date >= ${from}`, [oc])).rows[0].n,
      billed_cents: sum("billed_cents"), ar_open_cents: sum("open_cents"), collected_cents: sum("collected_cents"),
      invoices: sum("invoices"), invoices_with_payment: sum("paid_invoices"),
    },
    chips: {
      with_transactions: withTx.length,
      open_balance: rows.filter((r) => r.open_cents > 0).length,
      factored: rows.filter((r) => r.factored != null).length,
      all: rows.length,
    },
    rows,
  };
}

export async function readVendorBoard(client: Q, oc: string, range: BoardRange) {
  const from = rangeStartSql(range);
  const rows = (
    await client.query(
      `WITH exp AS (
         SELECT e.vendor_uuid AS vendor_id, count(*)::int AS txns, sum(e.total_amount_cents) AS spend, max(e.transaction_date) AS last_paid,
                mode() WITHIN GROUP (ORDER BY pa.account_name) AS pays_through
           FROM accounting.expenses e LEFT JOIN catalogs.accounts pa ON pa.id = e.payment_account_uuid
          WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.vendor_uuid IS NOT NULL AND e.transaction_date >= ${from}
          GROUP BY e.vendor_uuid),
       cat AS (
         SELECT DISTINCT ON (e.vendor_uuid) e.vendor_uuid AS vendor_id, a.account_name AS category
           FROM accounting.expenses e JOIN accounting.expense_lines el ON el.expense_id = e.id
           LEFT JOIN catalogs.accounts a ON a.id = el.expense_account_uuid
          WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.vendor_uuid IS NOT NULL AND e.transaction_date >= ${from}
          GROUP BY e.vendor_uuid, a.account_name
          ORDER BY e.vendor_uuid, sum(coalesce(el.amount_cents, round(el.amount * 100))) DESC NULLS LAST),
       bills AS (
         SELECT coalesce(b.mdata_vendor_id::text, b.vendor_uuid, b.vendor_id) AS vendor_key,
                sum(b.amount_cents - coalesce(b.paid_cents, 0)) FILTER (WHERE b.amount_cents - coalesce(b.paid_cents, 0) > 0) AS open_cents,
                count(*) FILTER (WHERE b.amount_cents - coalesce(b.paid_cents, 0) > 0)::int AS open_bills
           FROM accounting.bills b
          WHERE b.operating_company_id = $1::uuid AND b.voided_at IS NULL AND b.revoked_at IS NULL AND b.status <> 'void'
          GROUP BY 1)
       SELECT v.id, v.vendor_name AS name, v.deactivated_at, coalesce(cat.category, v.vendor_category, v.vendor_type::text) AS category,
              coalesce(exp.txns, 0) AS txns, coalesce(exp.spend, 0) AS spend_cents, exp.last_paid, exp.pays_through,
              coalesce(bills.open_cents, 0) AS open_bills_cents, coalesce(bills.open_bills, 0) AS open_bills
         FROM mdata.vendors v
         LEFT JOIN exp ON exp.vendor_id = v.id
         LEFT JOIN cat ON cat.vendor_id = v.id
         LEFT JOIN bills ON bills.vendor_key = v.id::text
        WHERE v.operating_company_id = $1::uuid
        ORDER BY coalesce(exp.spend, 0) DESC, coalesce(bills.open_cents, 0) DESC, v.vendor_name`,
      [oc]
    )
  ).rows.map((r) => ({
    id: r.id, name: r.name, status: r.deactivated_at ? "inactive" : "active", category: r.category ?? null,
    txns: n(r.txns), spend_cents: n(r.spend_cents), avg_ticket_cents: n(r.txns) ? Math.round(n(r.spend_cents) / n(r.txns)) : null,
    last_paid: r.last_paid ?? null, pays_through: r.pays_through ?? null,
    open_bills: n(r.open_bills), open_bills_cents: n(r.open_bills_cents),
  }));
  const fuel = (
    await client.query(
      `SELECT coalesce(sum(coalesce(el.amount_cents, round(el.amount * 100))) FILTER (WHERE ${FUEL_ACCOUNT_SQL}), 0) AS fuel,
              coalesce(sum(coalesce(el.amount_cents, round(el.amount * 100))), 0) AS total
         FROM accounting.expenses e JOIN accounting.expense_lines el ON el.expense_id = e.id
         LEFT JOIN catalogs.accounts a ON a.id = el.expense_account_uuid
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.vendor_uuid IS NOT NULL AND e.transaction_date >= ${from}`,
      [oc]
    )
  ).rows[0];
  const unposted = (
    await client.query(
      `SELECT count(*)::int AS n, coalesce(sum(total_amount_paid_cents), 0) AS cents, min(relay_created_at) AS since
         FROM integrations.relay_fuel_transactions
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND coalesce(is_active, true) AND posted_to_gl IS NOT TRUE`,
      [oc]
    )
  ).rows[0];
  const withTx = rows.filter((r) => r.txns > 0);
  const spend = withTx.reduce((s, r) => s + r.spend_cents, 0);
  const top = withTx[0] ?? null;
  const openBillsCents = rows.reduce((s, r) => s + r.open_bills_cents, 0);
  return {
    range,
    kpis: {
      with_transactions: withTx.length, in_the_book: rows.length, spend_cents: spend,
      fuel_share_pct: n(fuel.total) ? Math.round((n(fuel.fuel) / n(fuel.total)) * 1000) / 10 : null,
      open_bills_cents: openBillsCents > 0 ? openBillsCents : null,
      unposted_fuel_cents: n(unposted.cents), unposted_fuel_count: n(unposted.n), unposted_fuel_since: unposted.since ?? null,
      transactions: withTx.reduce((s, r) => s + r.txns, 0),
      top_vendor: top ? { id: top.id, name: top.name, txns: top.txns, spend_cents: top.spend_cents, share_pct: spend ? Math.round((top.spend_cents / spend) * 1000) / 10 : null } : null,
    },
    chips: { with_transactions: withTx.length, open_bills: rows.filter((r) => r.open_bills > 0).length, all: rows.length },
    rows,
  };
}
