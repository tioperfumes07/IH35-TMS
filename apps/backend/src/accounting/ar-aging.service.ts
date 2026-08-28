import { withCurrentUser } from "../auth/db.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

type ArAgingInvoiceRowDb = {
  customer_id: string;
  customer_name: string;
  due_date: string;
  amount_open_cents: string | number;
};

export type ArAgingCustomerRow = {
  customer_id: string;
  customer_name: string;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total_outstanding: number;
};

export type ArAgingTotals = {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total_outstanding: number;
};

export type ArAgingReport = {
  customers: ArAgingCustomerRow[];
  totals: ArAgingTotals;
};

function parseIsoDateOnly(value: string): number {
  return new Date(`${value}T00:00:00.000Z`).getTime();
}

export async function getArAgingReport(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
}): Promise<ArAgingReport> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    // ACCT-F5658 — mirror ap-aging.service.ts's own clamp: a FUTURE as_of is treated as today for
    // the open reconstruction (never invent future openness).
    const today = companyBusinessDate();
    const effectiveAsOf = input.as_of_date > today ? today : input.as_of_date;

    // ACCT-F5658 — this query previously read the LIVE open balance (the invoices table's
    // GENERATED open-balance column, reflecting TODAY's payments) and merely re-labeled it with the caller's
    // as_of_date, while the sibling ap-aging.service.ts (AP_AGING_OPEN_BILLS_SQL) fully
    // reconstructs what was open ON that date. Two consequences, both live on the exported
    // statement (statement-export.service.ts drives the ARAgingPage's Export PDF/XLSX from THIS
    // service while the on-screen table uses the separate /reports/ar-aging path): (1) an invoice issued
    // AFTER the as_of date was still included ("Current" bucket via a negative daysOverdue) —
    // inventing receivables on a backdated statement; (2) an invoice genuinely open ON the as_of
    // date but paid since then was dropped entirely (live amount_open_cents = 0, and the old
    // status filter excluded 'paid' outright). This rewrite ports the A/P sibling's own
    // already-decided reconstruction pattern column-for-column: existence gated on
    // issue_date <= as_of; outstanding = total_cents minus payment applications whose PAYMENT
    // dates on-or-before as_of (voided/unapplied only if that happened on-or-before as_of too)
    // minus credit-memo applications applied on-or-before as_of (ACCT-F5612's netting, now
    // as-of-dated); GREATEST(0) clamp; the 'paid' status exclusion is deliberately REMOVED —
    // paid-ness is now decided by the reconstruction itself, so a since-paid invoice correctly
    // appears on a historical statement and correctly disappears from today's.
    //
    // ACCT-F171 / CLS-VOID-LITERAL-DEAD — 'void' exclusion retained: accounting.invoices.status
    // spells a void as 'void' ('voided' is unreachable per the CHECK constraint but kept to avoid
    // churn; guarded by verify-void-status-literal-matches-column.mjs). The voided_at half is now
    // as-of-aware (an invoice voided AFTER the as_of date was still a receivable ON it), mirroring
    // the A/P sibling's own revoked_at treatment.
    // ACCT-F223 — 'proforma' exclusion retained: a proforma posts NO journal entry; counting it made
    // A/R aging disagree with the GL by $22,720.00 on USMCA alone. 'draft' likewise.
    // ACCT-F5659 — 'factored' EXCLUDED. The chargeback poster's own comment
    // (factoring-posting/poster.service.ts, applyChargebackSubledgerRelief) states the status exists
    // precisely "so the invoice leaves the ar_aging sent/partial pool without being misreported as
    // collected": its A/R-relief leg (Dr factoring_recoursed_ar / Cr ar_control) has already moved
    // the receivable OFF trade A/R at the GL, and amount_paid_cents is intentionally untouched (no
    // cash arrived) — so counting it here reconstructed the FULL face value into the oldest bucket.
    // Every sibling surface already excludes it (views.ar_aging allow-lists sent/partial;
    // ar_aging_as_of and fin20-aging both exclude 'factored'); this service was the lone dissenter,
    // making the Export PDF/weekly A/R email disagree with the on-screen table by the whole
    // factored-and-recoursed balance and dunning customers for invoices the factor already recoursed.
    const res = await client.query<ArAgingInvoiceRowDb>(
      `
        SELECT
          i.customer_id::text AS customer_id,
          COALESCE(c.customer_name, '') AS customer_name,
          i.due_date::text AS due_date,
          GREATEST(
            COALESCE(i.total_cents, 0)
              - COALESCE((
                  SELECT SUM(COALESCE(pa.amount_cents, 0))
                  FROM accounting.payment_applications pa
                  JOIN accounting.payments p
                    ON p.id = pa.payment_id
                   AND p.operating_company_id = i.operating_company_id
                  WHERE pa.invoice_id = i.id
                    AND pa.operating_company_id = i.operating_company_id
                    AND p.payment_date <= $2::date
                    AND (p.voided_at IS NULL OR p.voided_at::date > $2::date)
                    AND (pa.unapplied_at IS NULL OR (pa.unapplied_at AT TIME ZONE 'UTC')::date > $2::date)
                ), 0)
              - COALESCE((
                  SELECT SUM(cma.applied_cents)
                  FROM accounting.credit_memo_applications cma
                  WHERE cma.invoice_id = i.id
                    AND cma.operating_company_id = $1::uuid
                    AND cma.voided_at IS NULL
                    AND (cma.applied_at AT TIME ZONE 'UTC')::date <= $2::date
                ), 0)
          , 0)::bigint AS amount_open_cents
        FROM accounting.invoices i
        LEFT JOIN mdata.customers c
          ON c.id = i.customer_id
          AND c.operating_company_id = i.operating_company_id
        WHERE i.operating_company_id = $1::uuid
          AND i.issue_date <= $2::date
          AND i.total_cents IS NOT NULL
          AND (i.voided_at IS NULL OR i.voided_at::date > $2::date)
          AND i.status NOT IN ('void', 'voided', 'draft', 'proforma', 'factored')
          -- VEND-F-TEST-DATA-NOT-FLAGGED-SAMPLE (GO-0009 G1) — AR sibling of the same ap-aging fix:
          -- a demo/test invoice has no real receivable. Mirrors balance-sheet.service.ts /
          -- trial-balance.service.ts's existing is_sample_data exclusion.
          AND i.is_sample_data = false
          AND GREATEST(
            COALESCE(i.total_cents, 0)
              - COALESCE((
                  SELECT SUM(COALESCE(pa.amount_cents, 0))
                  FROM accounting.payment_applications pa
                  JOIN accounting.payments p
                    ON p.id = pa.payment_id
                   AND p.operating_company_id = i.operating_company_id
                  WHERE pa.invoice_id = i.id
                    AND pa.operating_company_id = i.operating_company_id
                    AND p.payment_date <= $2::date
                    AND (p.voided_at IS NULL OR p.voided_at::date > $2::date)
                    AND (pa.unapplied_at IS NULL OR (pa.unapplied_at AT TIME ZONE 'UTC')::date > $2::date)
                ), 0)
              - COALESCE((
                  SELECT SUM(cma.applied_cents)
                  FROM accounting.credit_memo_applications cma
                  WHERE cma.invoice_id = i.id
                    AND cma.operating_company_id = $1::uuid
                    AND cma.voided_at IS NULL
                    AND (cma.applied_at AT TIME ZONE 'UTC')::date <= $2::date
                ), 0)
          , 0) > 0
        ORDER BY c.customer_name ASC, i.due_date ASC
      `,
      [input.operating_company_id, effectiveAsOf]
    );

    const asOfTime = parseIsoDateOnly(effectiveAsOf);
    const byCustomer = new Map<string, ArAgingCustomerRow>();

    for (const row of res.rows) {
      const amount = Number(row.amount_open_cents ?? 0);
      if (amount <= 0) continue;

      const dueTime = parseIsoDateOnly(row.due_date);
      const daysOverdue = Math.floor((asOfTime - dueTime) / 86_400_000);

      const key = row.customer_id;
      const customer = byCustomer.get(key) ?? {
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        current: 0,
        d1_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 0,
        total_outstanding: 0,
      };

      if (daysOverdue <= 0) {
        customer.current += amount;
      } else if (daysOverdue <= 30) {
        customer.d1_30 += amount;
      } else if (daysOverdue <= 60) {
        customer.d31_60 += amount;
      } else if (daysOverdue <= 90) {
        customer.d61_90 += amount;
      } else {
        customer.d90_plus += amount;
      }

      customer.total_outstanding =
        customer.current + customer.d1_30 + customer.d31_60 + customer.d61_90 + customer.d90_plus;
      byCustomer.set(key, customer);
    }

    const customers = Array.from(byCustomer.values()).sort(
      (a, b) => a.customer_name.localeCompare(b.customer_name) || a.customer_id.localeCompare(b.customer_id)
    );

    const totals: ArAgingTotals = customers.reduce(
      (acc, row) => {
        acc.current += row.current;
        acc.d1_30 += row.d1_30;
        acc.d31_60 += row.d31_60;
        acc.d61_90 += row.d61_90;
        acc.d90_plus += row.d90_plus;
        acc.total_outstanding += row.total_outstanding;
        return acc;
      },
      {
        current: 0,
        d1_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 0,
        total_outstanding: 0,
      }
    );

    return { customers, totals };
  });
}
