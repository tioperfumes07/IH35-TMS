/**
 * ROUND 326 item 2 — the vendor profile surface, one read. Nine blocks off the canonical tables, each a value or a
 * NAMED reason it is empty (never a placeholder): AP aging · open bills · 1099 status · insurance and authority with
 * expiry · work orders · fuel · lanes and locations · terms · history. mdata.vendors is canonical; mdata.qbo_vendors
 * is never read or written here. Voided / revoked rows never count. Every row carries the id the screen drills to.
 */

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
export type ProfileBlock<T> = { value: T; empty_reason: string | null };

/** 1099-NEC/MISC reporting threshold: $600 through tax year 2025, $2,000 from tax year 2026 (P.L. 119-21). */
export const FORM_1099_THRESHOLD_CENTS = (taxYear: number) => (taxYear >= 2026 ? 200_000 : 60_000);

/** A bill's vendor, whichever of the three vendor columns carries it. */
const BILL_VENDOR_SQL = `(b.mdata_vendor_id = $2::uuid OR b.vendor_uuid = $2::text OR b.vendor_id = $2::text)`;
const OPEN_BILL_SQL = `b.voided_at IS NULL AND b.revoked_at IS NULL AND b.status <> 'void' AND b.amount_cents - coalesce(b.paid_cents, 0) > 0`;

const n = (v: unknown) => Number(v ?? 0);

export async function readVendorProfile(client: Q, companyId: string, vendorId: string) {
  const v = (
    await client.query(
      `SELECT v.id, v.vendor_name, v.vendor_type, v.vendor_category, v.deactivated_at, v.eligible_1099,
              (v.tax_id IS NOT NULL AND btrim(v.tax_id) <> '') AS has_tax_id,
              v.mc_number, v.dot_number, v.safer_status, v.safer_authority_status, v.safer_oos_status, v.safer_verified_at,
              v.payment_terms_id, pt.terms_name, pt.days_until_due, pt.early_payment_discount_pct, pt.early_payment_discount_days,
              v.default_expense_account_id, a.account_name AS default_expense_account_name, a.account_number AS default_expense_account_number
         FROM mdata.vendors v
         LEFT JOIN catalogs.payment_terms pt ON pt.id = v.payment_terms_id
         LEFT JOIN catalogs.accounts a ON a.id = v.default_expense_account_id
        WHERE v.id = $1 AND v.operating_company_id = $2::uuid`,
      [vendorId, companyId]
    )
  ).rows[0];
  if (!v) return null;

  // 1. AP aging + 2. open bills
  const openBills = (
    await client.query(
      `SELECT b.id, coalesce(b.display_id, b.bill_number) AS bill_no, b.bill_date, b.due_date, b.status,
              b.amount_cents, coalesce(b.paid_cents, 0) AS paid_cents, b.amount_cents - coalesce(b.paid_cents, 0) AS open_cents,
              GREATEST(current_date - b.due_date, 0) AS days_past_due, b.unit_id, b.load_id, b.linked_work_order_uuid
         FROM accounting.bills b
        WHERE b.operating_company_id = $1::uuid AND ${BILL_VENDOR_SQL} AND ${OPEN_BILL_SQL}
        ORDER BY b.due_date NULLS LAST, b.bill_date`,
      [companyId, vendorId]
    )
  ).rows.map((r) => ({ ...r, amount_cents: n(r.amount_cents), paid_cents: n(r.paid_cents), open_cents: n(r.open_cents), days_past_due: n(r.days_past_due) }));
  const bucket = (lo: number, hi: number) =>
    openBills.filter((b) => b.due_date != null && b.days_past_due >= lo && b.days_past_due <= hi).reduce((s, b) => s + b.open_cents, 0);
  const current = openBills.filter((b) => b.due_date == null || b.days_past_due === 0).reduce((s, b) => s + b.open_cents, 0);
  const aging = {
    current_cents: current,
    d1_30_cents: bucket(1, 30),
    d31_60_cents: bucket(31, 60),
    d61_90_cents: bucket(61, 90),
    d90_plus_cents: bucket(91, Number.MAX_SAFE_INTEGER),
    total_open_cents: openBills.reduce((s, b) => s + b.open_cents, 0),
    overdue_cents: openBills.filter((b) => b.days_past_due > 0).reduce((s, b) => s + b.open_cents, 0),
    open_bill_count: openBills.length,
  };

  // 3. 1099 status — paid this calendar year (bill payments + direct expenses), against the year's threshold.
  const year = (await client.query(`SELECT extract(year FROM current_date)::int AS y`)).rows[0].y as number;
  const paid = (
    await client.query(
      `SELECT
         (SELECT coalesce(sum(bp.amount_cents), 0) FROM accounting.bill_payments bp
           WHERE bp.operating_company_id = $1::uuid AND bp.vendor_id = $2::text AND bp.voided_at IS NULL AND bp.revoked_at IS NULL
             AND bp.payment_date >= make_date($3, 1, 1) AND bp.payment_date < make_date($3 + 1, 1, 1)) AS bill_payments_cents,
         (SELECT coalesce(sum(e.total_amount_cents), 0) FROM accounting.expenses e
           WHERE e.operating_company_id = $1::uuid AND e.vendor_uuid = $2::uuid AND e.voided_at IS NULL
             AND e.transaction_date >= make_date($3, 1, 1) AND e.transaction_date < make_date($3 + 1, 1, 1)) AS expenses_cents`,
      [companyId, vendorId, year]
    )
  ).rows[0];
  const ytd = n(paid.bill_payments_cents) + n(paid.expenses_cents);
  const threshold = FORM_1099_THRESHOLD_CENTS(year);
  const form1099 = {
    tax_year: year,
    eligible_1099: v.eligible_1099 === true,
    has_tax_id: v.has_tax_id === true,
    paid_ytd_cents: ytd,
    bill_payments_ytd_cents: n(paid.bill_payments_cents),
    expenses_ytd_cents: n(paid.expenses_cents),
    threshold_cents: threshold,
    reportable: v.eligible_1099 === true && ytd >= threshold,
    missing_tax_id: v.eligible_1099 === true && ytd >= threshold && v.has_tax_id !== true,
    /** paid over the threshold this year but not marked 1099-eligible -- the eligibility flag needs a decision */
    review_eligibility: v.eligible_1099 !== true && ytd >= threshold,
  };

  // 4. Insurance policies (with expiry) + carrier authority (SAFER).
  const policies = (
    await client.query(
      `SELECT p.id, p.insurer_name, p.policy_number, p.coverage_type, p.effective_date, p.expiry_date, p.status,
              p.total_premium_cents, (p.expiry_date - current_date) AS days_to_expiry
         FROM insurance.policy p
        WHERE p.operating_company_id = $1::uuid AND p.vendor_id = $2::text
        ORDER BY p.expiry_date DESC NULLS LAST`,
      [companyId, vendorId]
    )
  ).rows.map((r) => ({ ...r, total_premium_cents: n(r.total_premium_cents), days_to_expiry: r.days_to_expiry == null ? null : n(r.days_to_expiry) }));
  const authority = {
    mc_number: v.mc_number ?? null,
    dot_number: v.dot_number ?? null,
    safer_status: v.safer_status ?? null,
    authority_status: v.safer_authority_status ?? null,
    out_of_service: v.safer_oos_status ?? null,
    verified_at: v.safer_verified_at ?? null,
  };

  // 5. Work orders this vendor performed (shop, external or roadside).
  const workOrders = (
    await client.query(
      `SELECT w.id, coalesce(w.display_id, w.legacy_display_id) AS wo_no, w.status, w.opened_at, w.closed_at, w.unit_id,
              u.unit_number, w.load_id, w.vendor_work_order_number, w.external_vendor_invoice_number,
              coalesce(w.actual_cost_cents, round(w.total_actual_cost * 100)::bigint, w.estimated_cost_cents) AS cost_cents,
              CASE WHEN w.roadside_provider_vendor_id = $2::uuid THEN 'roadside'
                   WHEN w.external_vendor_id = $2::uuid THEN 'external' ELSE 'shop' END AS role
         FROM maintenance.work_orders w
         LEFT JOIN mdata.units u ON u.id = w.unit_id
        WHERE w.operating_company_id = $1::uuid
          AND (w.vendor_id = $2::uuid OR w.external_vendor_id = $2::uuid OR w.roadside_provider_vendor_id = $2::uuid)
          AND w.voided_by_user_id IS NULL
        ORDER BY coalesce(w.opened_at, w.created_at) DESC
        LIMIT 50`,
      [companyId, vendorId]
    )
  ).rows.map((r) => ({ ...r, cost_cents: r.cost_cents == null ? null : n(r.cost_cents) }));

  // 6. Fuel bought from this vendor (last 90 days + recent rows).
  const fuelTotals = (
    await client.query(
      `SELECT count(*)::int AS txns, coalesce(sum(gallons), 0) AS gallons, coalesce(round(sum(total_cost) * 100), 0)::bigint AS total_cents,
              max(coalesce(purchased_at, transaction_at)) AS last_at
         FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid AND vendor_id = $2::uuid AND voided_at IS NULL AND archived_at IS NULL
          AND coalesce(purchased_at, transaction_at) >= now() - interval '90 days'`,
      [companyId, vendorId]
    )
  ).rows[0];
  const fuelRecent = (
    await client.query(
      `SELECT f.id, coalesce(f.purchased_at, f.transaction_at) AS at, f.gallons, f.price_per_gallon,
              round(f.total_cost * 100)::bigint AS total_cents, f.location_city, f.location_state, f.unit_id, u.unit_number, f.load_id
         FROM fuel.fuel_transactions f LEFT JOIN mdata.units u ON u.id = f.unit_id
        WHERE f.operating_company_id = $1::uuid AND f.vendor_id = $2::uuid AND f.voided_at IS NULL AND f.archived_at IS NULL
        ORDER BY coalesce(f.purchased_at, f.transaction_at) DESC
        LIMIT 25`,
      [companyId, vendorId]
    )
  ).rows.map((r) => ({ ...r, gallons: r.gallons == null ? null : n(r.gallons), total_cents: n(r.total_cents) }));

  // 7. Lanes & locations — the vendor's linked locations + where its fuel was bought.
  const locations = (
    await client.query(
      `SELECT l.id, l.location_name, l.location_type::text AS location_type, l.city, l.state, 'linked location' AS source, NULL::int AS visits
         FROM mdata.locations l WHERE l.operating_company_id = $1::uuid AND l.linked_vendor_id = $2::uuid
       UNION ALL
       SELECT NULL, NULL, 'fuel stop', f.location_city, f.location_state, 'fuel purchases', count(*)::int
         FROM fuel.fuel_transactions f
        WHERE f.operating_company_id = $1::uuid AND f.vendor_id = $2::uuid AND f.voided_at IS NULL AND f.location_city IS NOT NULL
        GROUP BY f.location_city, f.location_state
       ORDER BY 7 DESC NULLS FIRST, 4`,
      [companyId, vendorId]
    )
  ).rows;

  // 8. Terms
  const terms = {
    payment_terms_id: v.payment_terms_id ?? null,
    terms_name: v.terms_name ?? null,
    days_until_due: v.days_until_due == null ? null : n(v.days_until_due),
    early_payment_discount_pct: v.early_payment_discount_pct == null ? null : n(v.early_payment_discount_pct),
    early_payment_discount_days: v.early_payment_discount_days == null ? null : n(v.early_payment_discount_days),
    default_expense_account_id: v.default_expense_account_id ?? null,
    default_expense_account: v.default_expense_account_name
      ? `${v.default_expense_account_number ? `${v.default_expense_account_number} ` : ""}${v.default_expense_account_name}` : null,
  };

  // 9. History — bills, bill payments and expenses, newest first.
  const history = (
    await client.query(
      `SELECT * FROM (
         SELECT 'bill' AS kind, b.id, coalesce(b.display_id, b.bill_number) AS ref, b.bill_date AS txn_date, b.amount_cents, b.status
           FROM accounting.bills b WHERE b.operating_company_id = $1::uuid AND ${BILL_VENDOR_SQL} AND b.voided_at IS NULL AND b.revoked_at IS NULL
         UNION ALL
         SELECT 'bill_payment', bp.id, coalesce(bp.check_number, bp.reference_number), bp.payment_date, -bp.amount_cents, bp.status
           FROM accounting.bill_payments bp WHERE bp.operating_company_id = $1::uuid AND bp.vendor_id = $2::text AND bp.voided_at IS NULL AND bp.revoked_at IS NULL
         UNION ALL
         SELECT 'expense', e.id, NULL, e.transaction_date, e.total_amount_cents, e.status
           FROM accounting.expenses e WHERE e.operating_company_id = $1::uuid AND e.vendor_uuid = $2::uuid AND e.voided_at IS NULL
       ) h ORDER BY txn_date DESC NULLS LAST LIMIT 50`,
      [companyId, vendorId]
    )
  ).rows.map((r) => ({ ...r, amount_cents: n(r.amount_cents) }));

  const block = <T>(value: T, reason: string | null): ProfileBlock<T> => ({ value, empty_reason: reason });
  const authorityKnown = authority.mc_number || authority.dot_number || authority.safer_status;

  return {
    vendor: { id: v.id, name: v.vendor_name, vendor_type: v.vendor_type, vendor_category: v.vendor_category, deactivated_at: v.deactivated_at },
    ap_aging: block(aging, aging.open_bill_count === 0 ? "No open bill — every bill is paid or none has been entered." : null),
    open_bills: block(openBills, openBills.length === 0 ? "No open bill." : null),
    form_1099: block(form1099, null),
    insurance_authority: block(
      { policies, authority },
      policies.length === 0 && !authorityKnown ? "No insurance policy is linked and no MC / DOT / SAFER record is on file." : null
    ),
    work_orders: block(workOrders, workOrders.length === 0 ? "No work order names this vendor as shop, external or roadside provider." : null),
    fuel: block(
      { txns_90d: n(fuelTotals.txns), gallons_90d: n(fuelTotals.gallons), total_cents_90d: n(fuelTotals.total_cents), last_at: fuelTotals.last_at ?? null, recent: fuelRecent },
      fuelRecent.length === 0 ? "No fuel purchase is recorded against this vendor." : null
    ),
    lanes: block(locations, locations.length === 0 ? "No linked location and no fuel-stop location for this vendor." : null),
    terms: block(terms, terms.payment_terms_id == null ? "No payment terms are set on this vendor." : null),
    history: block(history, history.length === 0 ? "No bill, bill payment or expense with this vendor." : null),
  };
}
