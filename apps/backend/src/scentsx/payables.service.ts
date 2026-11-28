/**
 * SCENTSX payables — owner 2026-11-27 15:05 CT "fully wire … liabilities … ap … vendors": the vendor side of Receivables. A/P aging
 * by vendor (Current = not yet due · 1–30 · 31–60 · 61–90 · 90+ days past due, the way the books' A/P aging ages) and the vendor
 * account (open bills, every bill, every payment), read from ScentsX LLC's own books.
 *
 * READ ONLY — no new money math. A bill's open balance as of a date is the SAME reconstruction the accounting A/P aging uses
 * (accounting/ap-aging.service.ts AP_AGING_OPEN_BILLS_SQL: amount − bill payments on or before the date, not revoked − vendor-credit
 * applications − payment applications to the bill; drafts, voids, revoked and sample bills excluded), so this screen ties to the
 * A/P control account and to the books' A/P aging to the cent (purchase-bill.test.ts / payables.test.ts tie it). Bills are paid
 * and voided by the existing bill engine (POST /api/v1/accounting/bills/:id/pay, /bills/:id/void) — this file never writes.
 */
import type pg from "pg";
import { z } from "zod";
import { scopeToScentsx, ScentsxLinkNotFound } from "./links.service.js";

/** A supplier (perfume.vendors) that is not yet a ScentsX vendor — no A/P account exists for it on ScentsX's books. */
export class ScentsxVendorNotOnBooks extends Error {
  constructor(readonly supplierName: string) { super(`${supplierName} is not a ScentsX vendor yet`); }
}

type Q = Pick<pg.PoolClient, "query">;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const payablesQuery = z.object({ as_of: isoDate.optional() });

export type ApBuckets = { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number; total: number };
const zero = (): ApBuckets => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 });

/** The books' A/P bucket for a bill `pastDue` days past its due date (≤ 0 = not yet due = Current). */
export function apBucketOf(pastDue: number): keyof Omit<ApBuckets, "total"> {
  if (pastDue <= 0) return "current";
  if (pastDue <= 30) return "d1_30";
  if (pastDue <= 60) return "d31_60";
  if (pastDue <= 90) return "d61_90";
  return "d90_plus";
}

/** Paid (bill payments), vendor credits and payment applications on a bill as of $2 — AP_AGING_OPEN_BILLS_SQL's three nettings. */
const SETTLED_SQL = (b: string) => `(
      coalesce((SELECT sum(coalesce(bp.amount_cents, 0)) FROM accounting.bill_payments bp
                 WHERE bp.bill_id = ${b}.id AND bp.operating_company_id = ${b}.operating_company_id AND bp.payment_date <= $2::date
                   AND (bp.revoked_at IS NULL OR bp.revoked_at::date > $2::date)), 0)
    + coalesce((SELECT sum(vca.applied_cents) FROM accounting.vendor_credit_applications vca
                 WHERE vca.bill_id = ${b}.id AND vca.operating_company_id = $1::uuid AND vca.voided_at IS NULL
                   AND (vca.applied_at AT TIME ZONE 'UTC')::date <= $2::date), 0)
    + coalesce((SELECT sum(pa.amount_cents) FROM accounting.payment_applications pa
                 WHERE pa.target_kind = 'bill' AND pa.target_id = ${b}.id AND pa.operating_company_id = $1::uuid AND pa.unapplied_at IS NULL
                   AND (pa.applied_at AT TIME ZONE 'UTC')::date <= $2::date), 0))`;

export const ON_BOOKS = (b: string) => `${b}.operating_company_id = $1::uuid AND ${b}.bill_date <= $2::date AND ${b}.amount_cents IS NOT NULL
      AND (${b}.revoked_at IS NULL OR ${b}.revoked_at::date > $2::date) AND ${b}.status NOT IN ('void', 'voided', 'draft') AND ${b}.is_sample_data = false`;

export const VENDOR_OF = (b: string) =>
  `CASE WHEN ${b}.vendor_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN ${b}.vendor_uuid::uuid ELSE NULL END`;

async function asOfDate(c: Q, asOf?: string) {
  if (asOf) return asOf;
  return (await c.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Chicago')::date::text AS d`)).rows[0]!.d;
}

type OpenBill = { id: string; display_id: string | null; bill_number: string | null; vendor_id: string | null; bill_date: string; due_date: string;
  past_due: number; amount_cents: number; settled_cents: number; open_cents: number; bucket: keyof Omit<ApBuckets, "total">; purchase_order_id: string | null; po_number: string | null };

async function openBills(c: Q, co: string, asOf: string, vendorId: string | null): Promise<OpenBill[]> {
  const r = await c.query<{ id: string; display_id: string | null; bill_number: string | null; vendor_id: string | null; bill_date: string; due_date: string;
    past_due: number; amount_cents: string; settled_cents: string; purchase_order_id: string | null; po_number: string | null }>(
    `SELECT b.id::text, b.display_id, b.bill_number, (${VENDOR_OF("b")})::text AS vendor_id, b.bill_date::text, coalesce(b.due_date, b.bill_date)::text AS due_date,
            ($2::date - coalesce(b.due_date, b.bill_date))::int AS past_due, b.amount_cents::text, ${SETTLED_SQL("b")}::text AS settled_cents,
            (SELECT x.purchase_order_id::text FROM scentsx.purchase_order_bill_lines x WHERE x.bill_id = b.id LIMIT 1) AS purchase_order_id,
            (SELECT p.number FROM scentsx.purchase_order_bill_lines x JOIN perfume.purchase_orders p ON p.id = x.purchase_order_id WHERE x.bill_id = b.id LIMIT 1) AS po_number
       FROM accounting.bills b
      WHERE ${ON_BOOKS("b")} AND ($3::uuid IS NULL OR ${VENDOR_OF("b")} = $3::uuid)
        AND coalesce(b.amount_cents, 0) - ${SETTLED_SQL("b")} > 0
      ORDER BY coalesce(b.due_date, b.bill_date), b.bill_date, b.display_id`,
    [co, asOf, vendorId]
  );
  return r.rows.map((x) => {
    const amount = Number(x.amount_cents), settled = Number(x.settled_cents);
    return { ...x, amount_cents: amount, settled_cents: settled, open_cents: Math.max(0, amount - settled), bucket: apBucketOf(x.past_due) };
  });
}

/** A/P aging by vendor as of a date, with the grand totals (Current · 1–30 · 31–60 · 61–90 · 90+ past due). */
export async function payablesAging(c: Q, f: z.infer<typeof payablesQuery>) {
  const co = await scopeToScentsx(c);
  const asOf = await asOfDate(c, f.as_of);
  const bills = await openBills(c, co, asOf, null);
  const names = new Map((await c.query<{ id: string; name: string; perfume_vendor_id: string | null }>(
    `SELECT v.id::text, v.vendor_name AS name,
            (SELECT l.perfume_vendor_id::text FROM scentsx.vendor_links l WHERE l.vendor_id = v.id AND l.voided_at IS NULL LIMIT 1) AS perfume_vendor_id
       FROM mdata.vendors v WHERE v.operating_company_id = $1::uuid`, [co])).rows.map((v) => [v.id, v]));
  const byVendor = new Map<string, ApBuckets & { vendor_id: string | null; vendor: string; perfume_vendor_id: string | null; bills: number; oldest_past_due: number }>();
  const totals = zero();
  for (const b of bills) {
    const key = b.vendor_id ?? "__none__";
    const v = b.vendor_id ? names.get(b.vendor_id) : undefined;
    const row = byVendor.get(key) ?? { ...zero(), vendor_id: b.vendor_id, vendor: v?.name ?? "Unknown vendor", perfume_vendor_id: v?.perfume_vendor_id ?? null, bills: 0, oldest_past_due: b.past_due };
    row[b.bucket] += b.open_cents; row.total += b.open_cents; row.bills += 1; row.oldest_past_due = Math.max(row.oldest_past_due, b.past_due);
    totals[b.bucket] += b.open_cents; totals.total += b.open_cents;
    byVendor.set(key, row);
  }
  return { as_of: asOf, operating_company_id: co, totals, vendors: [...byVendor.values()].sort((a, b) => b.total - a.total || a.vendor.localeCompare(b.vendor)) };
}

/** One vendor's account: its buckets, open bills, every bill and every payment on its bills, plus ScentsX's bank accounts to pay from. */
export async function vendorAccount(c: Q, requestedId: string, f: z.infer<typeof payablesQuery>) {
  const co = await scopeToScentsx(c);
  const asOf = await asOfDate(c, f.as_of);
  const v = (await c.query<{ id: string; name: string; perfume_vendor_id: string | null; perfume_vendor: string | null }>(
    `SELECT v.id::text, v.vendor_name AS name, l.perfume_vendor_id::text, pv.name AS perfume_vendor
       FROM mdata.vendors v LEFT JOIN scentsx.vendor_links l ON l.vendor_id = v.id AND l.voided_at IS NULL LEFT JOIN perfume.vendors pv ON pv.id = l.perfume_vendor_id
      WHERE v.operating_company_id = $2::uuid
        AND (v.id = $1::uuid
             OR v.id IN (SELECT x.vendor_id FROM scentsx.vendor_links x WHERE x.perfume_vendor_id = $1::uuid AND x.voided_at IS NULL))
      ORDER BY (v.id = $1::uuid) DESC LIMIT 1`, [requestedId, co])).rows[0];
  if (!v) {
    // L.37 red (CC3): a supplier opened from the Vendors desk carries its perfume.vendors id. When that supplier is not yet a
    // ScentsX vendor there is no account to show — say so (409 vendor_not_on_books, with the supplier's name) instead of a bare 404.
    const pv = (await c.query<{ name: string }>(`SELECT name FROM perfume.vendors WHERE id = $1::uuid LIMIT 1`, [requestedId])).rows[0];
    if (pv) throw new ScentsxVendorNotOnBooks(pv.name);
    throw new ScentsxLinkNotFound();
  }
  const vendorId = v.id;
  const open = await openBills(c, co, asOf, vendorId);
  const buckets = zero();
  for (const b of open) { buckets[b.bucket] += b.open_cents; buckets.total += b.open_cents; }
  const bills = (await c.query(
    `SELECT b.id::text, b.display_id, b.bill_number, b.bill_date::text, coalesce(b.due_date, b.bill_date)::text AS due_date, b.status,
            b.amount_cents::bigint::float8 AS amount_cents, (b.status IN ('void', 'voided') OR b.revoked_at IS NOT NULL) AS voided,
            (SELECT p.number FROM scentsx.purchase_order_bill_lines x JOIN perfume.purchase_orders p ON p.id = x.purchase_order_id WHERE x.bill_id = b.id LIMIT 1) AS po_number,
            (SELECT x.purchase_order_id::text FROM scentsx.purchase_order_bill_lines x WHERE x.bill_id = b.id LIMIT 1) AS purchase_order_id
       FROM accounting.bills b
      WHERE b.operating_company_id = $1::uuid AND ${VENDOR_OF("b")} = $2::uuid AND b.is_sample_data = false
      ORDER BY b.bill_date DESC, b.display_id DESC LIMIT 500`, [co, vendorId])).rows;
  const payments = (await c.query(
    `SELECT bp.id::text, bp.payment_date::text AS date, bp.payment_method AS method, bp.check_number, bp.reference_number,
            bp.amount_cents::bigint::float8 AS amount_cents, b.id::text AS bill_id, b.display_id AS bill, ba.account_name AS paid_from,
            bp.revoked_at IS NOT NULL AS voided
       FROM accounting.bill_payments bp JOIN accounting.bills b ON b.id = bp.bill_id AND b.operating_company_id = bp.operating_company_id
       LEFT JOIN banking.bank_accounts ba ON ba.id = bp.from_bank_account_id
      WHERE bp.operating_company_id = $1::uuid AND ${VENDOR_OF("b")} = $2::uuid AND bp.settlement_deduction_noncash IS NOT TRUE
      ORDER BY bp.payment_date DESC, bp.created_at DESC LIMIT 500`, [co, vendorId])).rows;
  // Vendor credits with something left to apply (returns credited after billing, #29960) — applied to a bill through the one
  // vendor-credit apply engine (POST /api/v1/accounting/vendor-credits/:id/apply).
  const credits = (await c.query(
    `SELECT vc.id::text, vc.display_id, vc.issue_date::text, vc.status, vc.notes,
            vc.amount_cents::float8 AS amount_cents, vc.amount_applied_cents::float8 AS applied_cents, vc.amount_unapplied_cents::float8 AS unapplied_cents
       FROM accounting.vendor_credits vc
      WHERE vc.operating_company_id = $1::uuid AND vc.vendor_id = $2 AND vc.status <> 'voided'
      ORDER BY vc.issue_date DESC, vc.display_id DESC LIMIT 500`, [co, vendorId])).rows;
  const banks = (await c.query(
    `SELECT b.id::text, b.account_name AS name, b.account_type, a.account_number
       FROM banking.bank_accounts b LEFT JOIN catalogs.accounts a ON a.id = b.ledger_account_id
      WHERE b.operating_company_id = $1::uuid AND b.is_active = true AND b.deactivated_at IS NULL ORDER BY a.account_number NULLS LAST, b.account_name`, [co])).rows;
  // ROUND L.31 M6 — supplier deposits (money paid to this vendor BEFORE the goods, a deposit bill coded to 1310 Supplier Deposits) less
  // what was already used on a bill (a vendor credit on 1310 applied to it). Read only; the deposit and its use go through the bill /
  // bill-payment / vendor-credit engines.
  const dep = (await c.query<{ paid: string; used: string; account_id: string | null }>(
    `WITH a AS (SELECT id FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = '1310' AND deactivated_at IS NULL LIMIT 1)
     SELECT (SELECT id::text FROM a) AS account_id,
            coalesce((SELECT sum(round(bl.amount * 100))::bigint FROM accounting.bill_lines bl JOIN accounting.bills b ON b.id = bl.bill_id
                       WHERE bl.account_id = (SELECT id FROM a) AND bl.voided_at IS NULL AND ${ON_BOOKS("b")} AND ${VENDOR_OF("b")} = $3::uuid), 0)::text AS paid,
            coalesce((SELECT sum(vc.amount_cents)::bigint FROM accounting.vendor_credits vc
                       WHERE vc.operating_company_id = $1::uuid AND vc.vendor_id = $3::text AND vc.account_id = (SELECT id FROM a) AND vc.status <> 'voided' AND vc.voided_at IS NULL), 0)::text AS used`,
    [co, asOf, vendorId])).rows[0]!;
  const deposits = { account_id: dep.account_id, paid_cents: Number(dep.paid), used_cents: Number(dep.used), available_cents: Math.max(0, Number(dep.paid) - Number(dep.used)) };
  return { as_of: asOf, operating_company_id: co, vendor: v, buckets, open_bills: open, bills, payments, credits, bank_accounts: banks, deposits };
}
