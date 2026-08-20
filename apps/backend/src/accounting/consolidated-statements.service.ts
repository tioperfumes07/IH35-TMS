import { withCurrentUser } from "../auth/db.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { getProfitLossReport, type ProfitLossReport } from "./profit-loss.service.js";
import { getBalanceSheetReport, type BalanceSheetReport } from "./balance-sheet.service.js";
import { getCashFlowReport, type CashFlowReport } from "./cash-flow.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDATED FINANCIAL STATEMENTS WITH INTERCOMPANY ELIMINATION (item 4)
//
// READ-ONLY. This module POSTS NOTHING. It runs each owned entity's EXISTING per-entity statement
// builder (getProfitLossReport / getBalanceSheetReport / getCashFlowReport — no new GL math is
// written here), sums them, and then applies an intercompany ELIMINATION so that a lease or an
// AR↔AP balance between two entities that are BOTH inside the consolidation set nets to zero in the
// consolidated view. Today the multi-entity roll-up (accounting/multi-entity/routes.ts) is a naive
// SUM with no elimination — this is the elimination layer.
//
// Intercompany identification reuses the SAME vendor/customer name-identity pattern the A/P-aging
// service uses (ap-aging.service.ts resolveDisplayGroup / is_intercompany): a bill whose vendor —
// or an invoice whose customer — resolves by name to ANOTHER company in the consolidation set is an
// intercompany counterparty. There is no owner-editable entity-pair map table in the schema yet, so
// the consolidation set itself IS the ownership map (every company the caller asks to consolidate is,
// by definition, an owned entity), and the counterparty is matched by name identity. If an explicit
// owner-editable map is later added, swap `loadCompanyNames` for a lookup — the elimination math
// below is unchanged.
//
// Elimination is applied on the MATCHED (mirrored) portion only — min(receivable, payable) per
// directed pair for the balance sheet, min(revenue, expense) per directed pair for the P&L. Matched
// elimination is inherently balance-preserving: it reduces AR and AP by the same amount (balance
// sheet stays balanced) and reduces revenue and expense by the same amount (net income unchanged).
// Any UNMATCHED remainder is never silently forced to zero — it is surfaced as a reconciling
// difference so a divergence between the two entities' books is visible, not hidden.
// ─────────────────────────────────────────────────────────────────────────────

const UUID_TEXT_RE = "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

export type ConsolidatedCompany = {
  operating_company_id: string;
  company_name: string;
};

type CounterpartyName = {
  operating_company_id: string;
  names: string[]; // lower-cased short_name + legal_name, length >= 2
};

export type IntercompanyPairElimination = {
  creditor_company_id: string;
  debtor_company_id: string;
  // Balance-sheet legs (as-of): receivable on the creditor's books, payable on the debtor's books.
  receivable_cents: number;
  payable_cents: number;
  bs_eliminated_cents: number; // min(receivable, payable) — removed from both consolidated AR and AP
  bs_unmatched_cents: number; // |receivable - payable| — reconciling difference, NOT eliminated
  // P&L legs (period): revenue on the creditor's books, expense on the debtor's books.
  revenue_cents: number;
  expense_cents: number;
  pl_eliminated_cents: number; // min(revenue, expense) — removed from both consolidated rev and exp
  pl_unmatched_cents: number; // |revenue - expense| — reconciling difference, NOT eliminated
};

export type ConsolidatedProfitLossReport = {
  period: { from_date?: string; to_date?: string };
  companies: ConsolidatedCompany[];
  by_company: Array<{ operating_company_id: string; report: ProfitLossReport }>;
  naive_sum: { revenue: number; cogs: number; gross_profit: number; operating_expenses: number; net_income: number };
  intercompany: {
    method: "name-identity (ap-aging pattern), consolidation-set = ownership map";
    eliminated_revenue_cents: number;
    eliminated_expense_cents: number;
    unmatched_cents: number;
    pairs: IntercompanyPairElimination[];
  };
  consolidated: { revenue: number; cogs: number; gross_profit: number; operating_expenses: number; net_income: number };
};

export type ConsolidatedBalanceSheetReport = {
  as_of_date: string;
  companies: ConsolidatedCompany[];
  by_company: Array<{ operating_company_id: string; report: BalanceSheetReport }>;
  naive_sum: { assets: number; liabilities: number; equity: number; total_liabilities_and_equity: number };
  intercompany: {
    method: "name-identity (ap-aging pattern), consolidation-set = ownership map";
    eliminated_receivable_cents: number;
    eliminated_payable_cents: number;
    unmatched_cents: number;
    pairs: IntercompanyPairElimination[];
  };
  consolidated: {
    assets: number;
    liabilities: number;
    equity: number;
    total_liabilities_and_equity: number;
    balanced: boolean;
  };
};

export type ConsolidatedCashFlowReport = {
  period: { from_date?: string; to_date?: string };
  companies: ConsolidatedCompany[];
  by_company: Array<{ operating_company_id: string; report: CashFlowReport }>;
  // Group net cash change is the SUM of each entity's actual cash-account movements. An intercompany
  // cash transfer between two entities that are BOTH in the set already nets to zero in that sum
  // (payer −X, payee +X), so no separate net-cash elimination is required. Category-level (operating/
  // investing/financing) reclassification of intercompany financing flows is a documented deferral —
  // see the PR body. The `intercompany.note` field makes this explicit rather than silent.
  consolidated: {
    operating: number;
    investing: number;
    financing: number;
    net_cash_change: number;
    cash_at_start: number;
    cash_at_end: number;
    reconciled: boolean;
  };
  intercompany: {
    method: "name-identity (ap-aging pattern), consolidation-set = ownership map";
    net_cash_note: string;
    category_reclass_deferred: true;
  };
};

function nameMatches(counterpartyNames: string[], candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const hay = candidate.toLowerCase();
  return counterpartyNames.some((n) => hay.includes(n));
}

async function loadCompanyNames(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  companyIds: string[]
): Promise<{ display: ConsolidatedCompany[]; counterparties: CounterpartyName[] }> {
  const res = await client.query(
    `
      SELECT c.id::text AS operating_company_id,
             COALESCE(c.short_name, c.legal_name, '')::text AS company_name,
             COALESCE(c.short_name, '')::text AS short_name,
             COALESCE(c.legal_name, '')::text AS legal_name
      FROM org.companies c
      WHERE c.id = ANY($1::uuid[])
    `,
    [companyIds]
  );
  const display: ConsolidatedCompany[] = [];
  const counterparties: CounterpartyName[] = [];
  for (const row of res.rows) {
    const id = String(row.operating_company_id);
    display.push({ operating_company_id: id, company_name: String(row.company_name ?? "") });
    const names = [String(row.short_name ?? ""), String(row.legal_name ?? "")]
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n.length >= 2);
    counterparties.push({ operating_company_id: id, names });
  }
  // Preserve caller order.
  display.sort((a, b) => companyIds.indexOf(a.operating_company_id) - companyIds.indexOf(b.operating_company_id));
  return { display, counterparties };
}

type BillRow = { counterparty_name: string | null; outstanding_cents: number; gross_cents: number };
type InvoiceRow = { counterparty_name: string | null; open_cents: number; revenue_cents: number };

// ACCT-F5670 — the reconstruction date for the dated open-balance subqueries below. An as-of report
// reconstructs at its as-of; a period (P&L) report reconstructs at its period end; neither exists →
// today. A future date clamps to today (same rule as ar-aging/ap-aging: never invent future openness).
function reconstructionDate(bounds: { asOf?: string; from?: string; to?: string }): string {
  const today = companyBusinessDate();
  const raw = bounds.asOf ?? bounds.to ?? today;
  return raw > today ? today : raw;
}

async function readBills(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  companyId: string,
  bounds: { asOf?: string; from?: string; to?: string }
): Promise<BillRow[]> {
  // $1 = company, $2 = reconstruction date; existence filters start at $3.
  const values: unknown[] = [companyId, reconstructionDate(bounds)];
  const dateFilters: string[] = [];
  if (bounds.asOf) {
    values.push(bounds.asOf);
    dateFilters.push(`b.bill_date <= $${values.length}::date`);
  }
  if (bounds.from) {
    values.push(bounds.from);
    dateFilters.push(`b.bill_date >= $${values.length}::date`);
  }
  if (bounds.to) {
    values.push(bounds.to);
    dateFilters.push(`b.bill_date <= $${values.length}::date`);
  }
  const dateSql = dateFilters.length > 0 ? `\n          AND ${dateFilters.join("\n          AND ")}` : "";
  const res = await client.query(
    `
      SELECT
        v.vendor_name AS counterparty_name,
        -- ACCT-F5670 — dated reconstruction (ported from AP_AGING_OPEN_BILLS_SQL), replacing the LIVE
        -- generated paid_cents column: an as-of consolidated balance sheet must eliminate the
        -- intercompany payable that existed ON that date, not today's residue. A bill fully paid
        -- after the as-of previously eliminated $0, overstating consolidated assets AND liabilities
        -- equally — with balanced:true still reporting.
        GREATEST(
          COALESCE(b.amount_cents, 0)
            - COALESCE((
                SELECT SUM(COALESCE(bp.amount_cents, 0))
                FROM accounting.bill_payments bp
                WHERE bp.bill_id = b.id
                  AND bp.operating_company_id = b.operating_company_id
                  AND bp.payment_date <= $2::date
                  AND (bp.revoked_at IS NULL OR bp.revoked_at::date > $2::date)
              ), 0)
            - COALESCE((
                SELECT SUM(vca.applied_cents)
                FROM accounting.vendor_credit_applications vca
                WHERE vca.bill_id = b.id
                  AND vca.operating_company_id = $1::uuid
                  AND vca.voided_at IS NULL
                  AND (vca.applied_at AT TIME ZONE 'UTC')::date <= $2::date
              ), 0)
        , 0)::bigint AS outstanding_cents,
        COALESCE(b.amount_cents, 0)::bigint AS gross_cents
      FROM accounting.bills b
      LEFT JOIN mdata.vendors v
        ON v.id = CASE
          WHEN b.vendor_uuid ~* '${UUID_TEXT_RE}' THEN b.vendor_uuid::uuid
          ELSE NULL
        END
        AND v.operating_company_id = b.operating_company_id
      WHERE b.operating_company_id = $1::uuid
        AND b.amount_cents IS NOT NULL
        AND (b.revoked_at IS NULL OR b.revoked_at::date > $2::date)
        -- LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS — same fix as ap-aging.service.ts: bills.status
        -- carries 'void', never 'voided'. The revoked_at check above excludes voided bills as-of-aware
        -- (ACCT-F5670: a bill revoked AFTER the as-of still owed on that date); 'void' is kept so the
        -- status clause is not purely decorative.
        AND b.status NOT IN ('void', 'voided', 'draft')${dateSql}
    `,
    values
  );
  return res.rows.map((r) => ({
    counterparty_name: r.counterparty_name == null ? null : String(r.counterparty_name),
    outstanding_cents: Number(r.outstanding_cents ?? 0),
    gross_cents: Number(r.gross_cents ?? 0),
  }));
}

async function readInvoices(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  companyId: string,
  bounds: { asOf?: string; from?: string; to?: string }
): Promise<InvoiceRow[]> {
  // $1 = company, $2 = reconstruction date; existence filters start at $3.
  const values: unknown[] = [companyId, reconstructionDate(bounds)];
  const dateFilters: string[] = [];
  if (bounds.asOf) {
    values.push(bounds.asOf);
    dateFilters.push(`i.issue_date <= $${values.length}::date`);
  }
  if (bounds.from) {
    values.push(bounds.from);
    dateFilters.push(`i.issue_date >= $${values.length}::date`);
  }
  if (bounds.to) {
    values.push(bounds.to);
    dateFilters.push(`i.issue_date <= $${values.length}::date`);
  }
  const dateSql = dateFilters.length > 0 ? `\n          AND ${dateFilters.join("\n          AND ")}` : "";
  const res = await client.query(
    `
      SELECT
        c.customer_name AS counterparty_name,
        -- ACCT-F5670 — dated reconstruction (ported from ar-aging.service.ts), replacing the LIVE
        -- generated amount_open_cents column: the receivable leg must be the open balance ON the
        -- reconstruction date. A 'factored' invoice's A/R has already moved off trade A/R at the GL
        -- (Dr factoring_recoursed_ar / Cr ar_control), so its receivable leg is 0 — same reason the
        -- whole aging family excludes it — while its REVENUE leg below stays (factored revenue is
        -- still revenue: revenue-gl-linkage status set is sent/partial/paid/factored).
        CASE WHEN i.status = 'factored' THEN 0 ELSE GREATEST(
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
        , 0) END::bigint AS open_cents,
        -- ACCT-F5670 — P&L elimination leg aligned to the documented PRE-TAX revenue basis
        -- (revenue-gl-linkage.service.ts: GREATEST(0, total_cents - COALESCE(tax_cents,0)); the
        -- posting engine posts tax_cents to sales_tax_payable, never to revenue). The old
        -- tax-inclusive total_cents systematically over-stated the revenue leg vs the revenue it
        -- offsets.
        GREATEST(COALESCE(i.total_cents, 0) - COALESCE(i.tax_cents, 0), 0)::bigint AS revenue_cents
      FROM accounting.invoices i
      LEFT JOIN mdata.customers c
        ON c.id = i.customer_id
        AND c.operating_company_id = i.operating_company_id
      WHERE i.operating_company_id = $1::uuid
        AND i.total_cents IS NOT NULL
        AND (i.voided_at IS NULL OR i.voided_at::date > $2::date)
        -- ACCT-F223 — same exclusion as A/R aging: a proforma posts no GL, so showing it on a
        -- customer statement bills them for money the ledger says they do not owe. ACCT-F5670 adds
        -- 'voided' (sibling parity) and makes voided_at as-of-aware; 'factored' is handled per-leg
        -- above, NOT excluded here.
        AND i.status NOT IN ('void', 'voided', 'draft', 'proforma')${dateSql}
    `,
    values
  );
  return res.rows.map((r) => ({
    counterparty_name: r.counterparty_name == null ? null : String(r.counterparty_name),
    open_cents: Number(r.open_cents ?? 0),
    revenue_cents: Number(r.revenue_cents ?? 0),
  }));
}

// Directed-pair map keyed "creditorId::debtorId".
type PairAccumulator = { receivable: number; payable: number; revenue: number; expense: number };

function pairKey(creditor: string, debtor: string): string {
  return `${creditor}::${debtor}`;
}

/**
 * Build the intercompany elimination schedule across the consolidation set. For every ordered pair
 * of DISTINCT owned entities we accumulate:
 *   - receivable / revenue on the CREDITOR (the seller/lessor) — from its invoices to the debtor
 *   - payable / expense on the DEBTOR (the buyer/lessee) — from its bills to the creditor
 * then eliminate the matched (mirrored) portion. READ-ONLY.
 */
async function buildEliminationSchedule(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  counterparties: CounterpartyName[],
  bounds: { asOf?: string; from?: string; to?: string }
): Promise<Map<string, PairAccumulator>> {
  const pairs = new Map<string, PairAccumulator>();
  const ensure = (creditor: string, debtor: string): PairAccumulator => {
    const key = pairKey(creditor, debtor);
    let acc = pairs.get(key);
    if (!acc) {
      acc = { receivable: 0, payable: 0, revenue: 0, expense: 0 };
      pairs.set(key, acc);
    }
    return acc;
  };

  for (const reader of counterparties) {
    const others = counterparties.filter((c) => c.operating_company_id !== reader.operating_company_id);
    if (others.length === 0) continue;

    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [reader.operating_company_id]);

    // Reader's BILLS → reader is the DEBTOR; counterparty (vendor name) is the CREDITOR.
    const bills = await readBills(client, reader.operating_company_id, bounds);
    for (const bill of bills) {
      const creditor = others.find((o) => nameMatches(o.names, bill.counterparty_name));
      if (!creditor) continue;
      const acc = ensure(creditor.operating_company_id, reader.operating_company_id);
      acc.payable += bill.outstanding_cents;
      acc.expense += bill.gross_cents;
    }

    // Reader's INVOICES → reader is the CREDITOR; counterparty (customer name) is the DEBTOR.
    const invoices = await readInvoices(client, reader.operating_company_id, bounds);
    for (const inv of invoices) {
      const debtor = others.find((o) => nameMatches(o.names, inv.counterparty_name));
      if (!debtor) continue;
      const acc = ensure(reader.operating_company_id, debtor.operating_company_id);
      acc.receivable += inv.open_cents;
      acc.revenue += inv.revenue_cents;
    }
  }
  return pairs;
}

function toPairEliminations(pairs: Map<string, PairAccumulator>): IntercompanyPairElimination[] {
  const out: IntercompanyPairElimination[] = [];
  for (const [key, acc] of pairs.entries()) {
    const [creditor, debtor] = key.split("::");
    const bsEliminated = Math.min(acc.receivable, acc.payable);
    const plEliminated = Math.min(acc.revenue, acc.expense);
    out.push({
      creditor_company_id: creditor,
      debtor_company_id: debtor,
      receivable_cents: acc.receivable,
      payable_cents: acc.payable,
      bs_eliminated_cents: bsEliminated,
      bs_unmatched_cents: Math.abs(acc.receivable - acc.payable),
      revenue_cents: acc.revenue,
      expense_cents: acc.expense,
      pl_eliminated_cents: plEliminated,
      pl_unmatched_cents: Math.abs(acc.revenue - acc.expense),
    });
  }
  out.sort(
    (a, b) =>
      a.creditor_company_id.localeCompare(b.creditor_company_id) ||
      a.debtor_company_id.localeCompare(b.debtor_company_id)
  );
  return out;
}

export async function getConsolidatedProfitLoss(input: {
  userId: string;
  operating_company_ids: string[];
  from_date?: string;
  to_date?: string;
}): Promise<ConsolidatedProfitLossReport> {
  const companyIds = Array.from(new Set(input.operating_company_ids));

  const byCompany = await Promise.all(
    companyIds.map(async (operating_company_id) => ({
      operating_company_id,
      report: await getProfitLossReport({
        userId: input.userId,
        operating_company_id,
        from_date: input.from_date,
        to_date: input.to_date,
      }),
    }))
  );

  const naive = byCompany.reduce(
    (acc, { report }) => ({
      revenue: acc.revenue + report.revenue.total,
      cogs: acc.cogs + report.cogs.total,
      gross_profit: acc.gross_profit + report.gross_profit,
      operating_expenses: acc.operating_expenses + report.operating_expenses.total,
      net_income: acc.net_income + report.net_income,
    }),
    { revenue: 0, cogs: 0, gross_profit: 0, operating_expenses: 0, net_income: 0 }
  );

  const { display, pairs } = await withCurrentUser(input.userId, async (client) => {
    const names = await loadCompanyNames(client, companyIds);
    const schedule = await buildEliminationSchedule(client, names.counterparties, {
      from: input.from_date,
      to: input.to_date,
    });
    return { display: names.display, pairs: toPairEliminations(schedule) };
  });

  const eliminatedRevenue = pairs.reduce((s, p) => s + p.pl_eliminated_cents, 0);
  const eliminatedExpense = pairs.reduce((s, p) => s + p.pl_eliminated_cents, 0);
  const unmatched = pairs.reduce((s, p) => s + p.pl_unmatched_cents, 0);

  // Matched elimination removes equal revenue and expense → net income is unchanged by the match.
  const consolidated = {
    revenue: naive.revenue - eliminatedRevenue,
    cogs: naive.cogs,
    gross_profit: naive.gross_profit - eliminatedRevenue,
    operating_expenses: naive.operating_expenses - eliminatedExpense,
    net_income: naive.net_income - eliminatedRevenue + eliminatedExpense,
  };

  return {
    period: { from_date: input.from_date, to_date: input.to_date },
    companies: display,
    by_company: byCompany,
    naive_sum: naive,
    intercompany: {
      method: "name-identity (ap-aging pattern), consolidation-set = ownership map",
      eliminated_revenue_cents: eliminatedRevenue,
      eliminated_expense_cents: eliminatedExpense,
      unmatched_cents: unmatched,
      pairs,
    },
    consolidated,
  };
}

export async function getConsolidatedBalanceSheet(input: {
  userId: string;
  operating_company_ids: string[];
  as_of_date: string;
}): Promise<ConsolidatedBalanceSheetReport> {
  const companyIds = Array.from(new Set(input.operating_company_ids));

  const byCompany = await Promise.all(
    companyIds.map(async (operating_company_id) => ({
      operating_company_id,
      report: await getBalanceSheetReport({
        userId: input.userId,
        operating_company_id,
        as_of_date: input.as_of_date,
      }),
    }))
  );

  const naive = byCompany.reduce(
    (acc, { report }) => ({
      assets: acc.assets + report.assets.total,
      liabilities: acc.liabilities + report.liabilities.total,
      equity: acc.equity + report.equity.total,
      total_liabilities_and_equity: acc.total_liabilities_and_equity + report.total_liabilities_and_equity,
    }),
    { assets: 0, liabilities: 0, equity: 0, total_liabilities_and_equity: 0 }
  );

  const { display, pairs } = await withCurrentUser(input.userId, async (client) => {
    const names = await loadCompanyNames(client, companyIds);
    const schedule = await buildEliminationSchedule(client, names.counterparties, { asOf: input.as_of_date });
    return { display: names.display, pairs: toPairEliminations(schedule) };
  });

  const eliminatedReceivable = pairs.reduce((s, p) => s + p.bs_eliminated_cents, 0);
  const eliminatedPayable = pairs.reduce((s, p) => s + p.bs_eliminated_cents, 0);
  const unmatched = pairs.reduce((s, p) => s + p.bs_unmatched_cents, 0);

  // Matched elimination removes equal receivable (asset) and payable (liability) → sheet stays balanced.
  const assets = naive.assets - eliminatedReceivable;
  const liabilities = naive.liabilities - eliminatedPayable;
  const equity = naive.equity;
  const totalLiabilitiesAndEquity = liabilities + equity;

  return {
    as_of_date: input.as_of_date,
    companies: display,
    by_company: byCompany,
    naive_sum: naive,
    intercompany: {
      method: "name-identity (ap-aging pattern), consolidation-set = ownership map",
      eliminated_receivable_cents: eliminatedReceivable,
      eliminated_payable_cents: eliminatedPayable,
      unmatched_cents: unmatched,
      pairs,
    },
    consolidated: {
      assets,
      liabilities,
      equity,
      total_liabilities_and_equity: totalLiabilitiesAndEquity,
      balanced: assets === totalLiabilitiesAndEquity,
    },
  };
}

export async function getConsolidatedCashFlow(input: {
  userId: string;
  operating_company_ids: string[];
  from_date?: string;
  to_date?: string;
}): Promise<ConsolidatedCashFlowReport> {
  const companyIds = Array.from(new Set(input.operating_company_ids));

  const byCompany = await Promise.all(
    companyIds.map(async (operating_company_id) => ({
      operating_company_id,
      report: await getCashFlowReport({
        userId: input.userId,
        operating_company_id,
        from_date: input.from_date,
        to_date: input.to_date,
      }),
    }))
  );

  const consolidated = byCompany.reduce(
    (acc, { report }) => ({
      operating: acc.operating + report.operating.total,
      investing: acc.investing + report.investing.total,
      financing: acc.financing + report.financing.total,
      net_cash_change: acc.net_cash_change + report.net_cash_change,
      cash_at_start: acc.cash_at_start + report.cash_at_start,
      cash_at_end: acc.cash_at_end + report.cash_at_end,
      reconciled: acc.reconciled && report.reconciled,
    }),
    { operating: 0, investing: 0, financing: 0, net_cash_change: 0, cash_at_start: 0, cash_at_end: 0, reconciled: true }
  );

  const display = await withCurrentUser(input.userId, async (client) => {
    const names = await loadCompanyNames(client, companyIds);
    return names.display;
  });

  return {
    period: { from_date: input.from_date, to_date: input.to_date },
    companies: display,
    by_company: byCompany,
    consolidated,
    intercompany: {
      method: "name-identity (ap-aging pattern), consolidation-set = ownership map",
      net_cash_note:
        "Group net cash change is the sum of each entity's actual cash-account movements; an intercompany " +
        "cash transfer between two entities in the set already nets to zero in that sum (payer −X, payee +X).",
      category_reclass_deferred: true,
    },
  };
}
