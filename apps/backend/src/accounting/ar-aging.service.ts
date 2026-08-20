import { withCurrentUser } from "../auth/db.js";

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

    const res = await client.query<ArAgingInvoiceRowDb>(
      `
        SELECT
          i.customer_id::text AS customer_id,
          COALESCE(c.customer_name, '') AS customer_name,
          i.due_date::text AS due_date,
          -- ACCT-F5612 — amount_open_cents is a GENERATED column (total_cents - amount_paid_cents,
          -- migration 0123) with NO knowledge of accounting.credit_memo_applications (added by
          -- ACCT-F5606). credit-memos.routes.ts already nets applied, non-voided credit-memo cents
          -- off an invoice's TRUE remaining balance for its own over-apply guard; AR aging — a real
          -- collections/DSO report — did not do the same subtraction, so any invoice with an applied
          -- AR credit memo overstated its reported open balance here. Mirrors that route's own
          -- already-applied-ceiling query exactly (SUM applied_cents WHERE voided_at IS NULL).
          (i.amount_open_cents - COALESCE(cma.applied_cents, 0))::bigint AS amount_open_cents
        FROM accounting.invoices i
        LEFT JOIN mdata.customers c
          ON c.id = i.customer_id
          AND c.operating_company_id = i.operating_company_id
        LEFT JOIN (
          SELECT invoice_id, SUM(applied_cents) AS applied_cents
          FROM accounting.credit_memo_applications
          WHERE operating_company_id = $1::uuid
            AND voided_at IS NULL
          GROUP BY invoice_id
        ) cma ON cma.invoice_id = i.id
        WHERE i.operating_company_id = $1::uuid
          AND i.amount_open_cents IS NOT NULL
          AND i.amount_open_cents > 0
          AND i.voided_at IS NULL
          -- ACCT-F171 / CLS-VOID-LITERAL-DEAD — 'void' was MISSING and its absence was live money.
          --
          -- accounting.invoices.status spells a void as 'void'. On prod br-fancy-credit-akjnd07a the
          -- constraint invoices_status_check pins the domain to
          -- (draft, proforma, sent, partial, paid, void, factored) — 'voided' is not in it, so the
          -- database would REJECT that value. The literal this predicate excluded could never match,
          -- so the status half of the filter was dead and the whole exclusion rested on voided_at.
          -- One invoice breaks that pairing (status='void', voided_at NULL — the live half of
          -- LV-VOID-INVARIANT-BOTH-WAYS), and A/R aging counted it: USMCA reported $4,325.50
          -- outstanding where $1,875.50 was real. A voided $2,450.00 invoice was 56.6% of the
          -- entity's reported receivables, and it read as a perfectly ordinary number.
          --
          -- The rest of the file's own neighbours already had it right — invoices.routes.ts:227
          -- excludes ('draft','void','voided','paid'). This one query missed the dominant spelling.
          --
          -- 'voided' is KEPT only because removing it is churn with no behavioural change — the
          -- constraint already makes it unreachable. It is NOT future-proofing: nothing can ever
          -- write that value. Guarded by scripts/verify-void-status-literal-matches-column.mjs,
          -- which fails when a predicate names a literal the column's CHECK constraint forbids, and
          -- fails again when an exclusion names ONLY the unreachable spelling.
          -- ACCT-F223 — 'proforma' EXCLUDED. A proforma invoice posts NO journal entry: it is a
          -- projection created at Book time, not a receivable the customer owes. Verified on prod:
          -- every proforma has ZERO rows in accounting.journal_entry_postings.
          --
          -- Counting them here made A/R aging disagree with the general ledger by $22,720.00 on USMCA
          -- alone (8 proformas), including $4,910 sitting on a load that had been CANCELLED. Aging
          -- drives collections, DSO and the balance-sheet A/R figure, so a projection in this report
          -- is not a harmless extra row -- it is an invented receivable.
          --
          -- 'draft' was already excluded for exactly this reason; 'proforma' is the same class and was
          -- simply missed. If a proforma is genuinely owed, it becomes 'sent' and appears here then.
          AND i.status NOT IN ('paid', 'void', 'voided', 'draft', 'proforma')
        ORDER BY c.customer_name ASC, i.due_date ASC
      `,
      [input.operating_company_id]
    );

    const asOfTime = parseIsoDateOnly(input.as_of_date);
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
