/**
 * 0280-02-revenue-gl-linkage — read-only dual-basis Home revenue cross-check.
 *
 * ROOT CAUSE: /home/today-revenue and /home/weekly-revenue summed accounting.invoices.total_cents
 * only (UTC CURRENT_DATE), with no journal_entry_postings cross-check and no invoice-basis label.
 * Silent catch → fabricated $0.
 *
 * FIX: entity-scoped read that exposes invoice-basis (pre-tax) revenue alongside GL-posted revenue
 * for the same delivery-recognition period (company TZ; final active delivery stop actual_departure_at,
 * excluding cancelled stops; issue_date fallback), governed Income/OtherIncome accounts, explicit
 * basis/source metadata, mutually exclusive discrepancy categories, and forward drill ids.
 * Reuses source_transaction_* + transaction_source_links + posting_batches (P&L-aligned posted|reversed).
 * Missing canonical linkage surface → status=unverifiable (never fabricate zero).
 *
 * Standards: QuickBooks P&L dual-view honesty + McLeod/Alvys ops revenue tiles that label basis;
 * CPA locked accrual recognition = load delivery; invoice posting-eligible = sent|partial|paid|factored.
 */
import { COMPANY_TIME_ZONE, companyBusinessDate } from "../lib/company-business-date.js";

export type DbClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[] }>;
};

export type RevenueBasisMeta = {
  label: "invoice_basis" | "gl_posted";
  source: string;
  recognition: string;
  governed_accounts?: string;
  amount_basis?: string;
};

export type RevenueDiscrepancyReason =
  | "missing_je"
  | "wrong_account"
  | "amount_mismatch"
  | "voided_je"
  | "unlinked_gl_revenue";

export type RevenueInvoiceDrill = {
  invoice_id: string;
  display_id: string | null;
  recognition_date: string;
  invoice_revenue_cents: number;
  gl_revenue_cents: number;
  journal_entry_ids: string[];
  reason: RevenueDiscrepancyReason;
  href: string;
};

export type RevenueJournalDrill = {
  journal_entry_id: string;
  entry_date: string;
  gl_revenue_cents: number;
  invoice_id: string | null;
  account_ids: string[];
  reason: RevenueDiscrepancyReason;
  href: string;
};

export type RevenueDayPoint = {
  date: string;
  invoice_basis_cents: number;
  gl_posted_revenue_cents: number;
  /** Backward-compat alias of invoice_basis_cents when status is ok/empty. */
  cents: number;
};

export type RevenueGlLinkageResult = {
  status: "ok" | "empty" | "unverifiable";
  unverifiable_reason: string | null;
  period: {
    from: string;
    to: string;
    timezone: string;
    recognition_model: "delivery_with_issue_date_fallback";
  };
  basis: {
    invoice: RevenueBasisMeta;
    gl: RevenueBasisMeta;
  };
  /** Pre-tax invoice revenue (total − tax) for eligible invoices in the recognition period. */
  invoice_basis_cents: number;
  /** Net credits to Income/OtherIncome in the same period (P&L-aligned posted|reversed batches). */
  gl_posted_revenue_cents: number;
  /**
   * Backward-compat headline. Null when unverifiable so clients cannot treat a fabricated 0 as revenue.
   * When ok/empty, equals invoice_basis_cents (pre-tax).
   */
  revenue_cents: number | null;
  discrepancy_count: number;
  discrepancy_cents: number;
  days: RevenueDayPoint[];
  drill: {
    mismatched_invoices: RevenueInvoiceDrill[];
    mismatched_journal_entries: RevenueJournalDrill[];
  };
};

/** Canonical posting-eligible invoice statuses (posting-engine INVOICE_ELIGIBLE_STATUSES). */
export const INVOICE_BASIS_ELIGIBLE_STATUSES = ["sent", "partial", "paid", "factored"] as const;

const REVENUE_ACCOUNT_TYPES = ["Income", "OtherIncome"] as const;

/** Align with profit-loss.service / trial-balance: posted + reversed; never pending. */
const POSTED_BATCH_STATUSES = ["posted", "reversed"] as const;

const INVOICE_BASIS_META: RevenueBasisMeta = {
  label: "invoice_basis",
  source: "accounting.invoices",
  recognition:
    "COALESCE((final active delivery stop by MAX sequence_number: stop_type=delivery, status<>cancelled, soft_deleted_at IS NULL → that stop's actual_departure_at AT company_tz)::date, invoices.issue_date)",
  amount_basis: "GREATEST(0, total_cents - COALESCE(tax_cents,0)) pre-tax; status IN (sent,partial,paid,factored)",
};

const GL_BASIS_META: RevenueBasisMeta = {
  label: "gl_posted",
  source: "accounting.journal_entry_postings",
  recognition: "journal_entries.entry_date (non-voided); posting_batches.batch_status IN (posted,reversed) or NULL batch",
  governed_accounts: "catalogs.accounts.account_type IN (Income, OtherIncome)",
  amount_basis: "net credit − debit on governed revenue accounts (P&L-aligned)",
};

function addDaysIso(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return companyBusinessDate(dt);
}

function invoiceHref(invoiceId: string): string {
  return `/accounting/invoices/${invoiceId}`;
}

function journalHref(journalEntryId: string): string {
  return `/accounting/journal-entries/${journalEntryId}`;
}

function pretaxCents(total: string | number | null | undefined, tax: string | number | null | undefined): number {
  return Math.max(0, Number(total ?? 0) - Number(tax ?? 0));
}

type SchemaProbe = {
  ok: boolean;
  reason: string | null;
};

async function probeCanonicalLinkageSurface(client: DbClient): Promise<SchemaProbe> {
  const rel = await client.query<{
    invoices_ok: boolean;
    je_ok: boolean;
    jep_ok: boolean;
    tsl_ok: boolean;
    accounts_ok: boolean;
    load_stops_ok: boolean;
    batches_ok: boolean;
  }>(
    `
      SELECT
        to_regclass('accounting.invoices') IS NOT NULL AS invoices_ok,
        to_regclass('accounting.journal_entries') IS NOT NULL AS je_ok,
        to_regclass('accounting.journal_entry_postings') IS NOT NULL AS jep_ok,
        to_regclass('accounting.transaction_source_links') IS NOT NULL AS tsl_ok,
        to_regclass('catalogs.accounts') IS NOT NULL AS accounts_ok,
        to_regclass('mdata.load_stops') IS NOT NULL AS load_stops_ok,
        to_regclass('accounting.posting_batches') IS NOT NULL AS batches_ok
    `
  );
  const row = rel.rows[0];
  if (!row?.invoices_ok) {
    return { ok: false, reason: "missing_table:accounting.invoices" };
  }
  if (!row.je_ok || !row.jep_ok) {
    return { ok: false, reason: "missing_table:accounting.journal_entries|journal_entry_postings" };
  }
  if (!row.tsl_ok) {
    return { ok: false, reason: "missing_table:accounting.transaction_source_links" };
  }
  if (!row.accounts_ok) {
    return { ok: false, reason: "missing_table:catalogs.accounts" };
  }
  if (!row.load_stops_ok) {
    return { ok: false, reason: "missing_table:mdata.load_stops" };
  }
  if (!row.batches_ok) {
    return { ok: false, reason: "missing_table:accounting.posting_batches" };
  }

  const cols = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'accounting'
        AND table_name = 'journal_entry_postings'
        AND column_name = ANY($1::text[])
    `,
    [
      [
        "source_transaction_type",
        "source_transaction_id",
        "journal_entry_uuid",
        "debit_or_credit",
        "amount_cents",
        "account_id",
        "posting_batch_id",
      ],
    ]
  );
  const have = new Set(cols.rows.map((r) => r.column_name));
  for (const required of [
    "source_transaction_type",
    "source_transaction_id",
    "journal_entry_uuid",
    "debit_or_credit",
    "amount_cents",
    "account_id",
    "posting_batch_id",
  ]) {
    if (!have.has(required)) {
      return { ok: false, reason: `missing_column:accounting.journal_entry_postings.${required}` };
    }
  }

  return { ok: true, reason: null };
}

function emptyResult(from: string, to: string): RevenueGlLinkageResult {
  return {
    status: "empty",
    unverifiable_reason: null,
    period: {
      from,
      to,
      timezone: COMPANY_TIME_ZONE,
      recognition_model: "delivery_with_issue_date_fallback",
    },
    basis: { invoice: INVOICE_BASIS_META, gl: GL_BASIS_META },
    invoice_basis_cents: 0,
    gl_posted_revenue_cents: 0,
    revenue_cents: 0,
    discrepancy_count: 0,
    discrepancy_cents: 0,
    days: [],
    drill: { mismatched_invoices: [], mismatched_journal_entries: [] },
  };
}

function unverifiableResult(from: string, to: string, reason: string): RevenueGlLinkageResult {
  return {
    status: "unverifiable",
    unverifiable_reason: reason,
    period: {
      from,
      to,
      timezone: COMPANY_TIME_ZONE,
      recognition_model: "delivery_with_issue_date_fallback",
    },
    basis: { invoice: INVOICE_BASIS_META, gl: GL_BASIS_META },
    invoice_basis_cents: 0,
    gl_posted_revenue_cents: 0,
    revenue_cents: null,
    discrepancy_count: 0,
    discrepancy_cents: 0,
    days: [],
    drill: { mismatched_invoices: [], mismatched_journal_entries: [] },
  };
}

/**
 * Final active delivery evidence (canonical):
 * among stop_type=delivery AND status<>'cancelled' AND soft_deleted_at IS NULL,
 * pick the row with the highest sequence_number, then use THAT stop's actual_departure_at.
 * Do NOT MAX(timestamp) across stops — an earlier redelivery can have a later clock stamp.
 * $4 = company timezone name.
 */
const FINAL_ACTIVE_DELIVERY_RECOGNITION_SQL = `
    COALESCE(
      (
        SELECT (ls.actual_departure_at AT TIME ZONE $4)::date
        FROM mdata.load_stops ls
        WHERE ls.load_id = i.source_load_id
          AND ls.stop_type = 'delivery'
          AND ls.soft_deleted_at IS NULL
          AND ls.status <> 'cancelled'
        ORDER BY ls.sequence_number DESC
        LIMIT 1
      ),
      i.issue_date
    )
`;

/** Same recognition with timezone param position $5 (for unlinked-GL query). */
const FINAL_ACTIVE_DELIVERY_RECOGNITION_SQL_TZ5 = `
    COALESCE(
      (
        SELECT (ls.actual_departure_at AT TIME ZONE $5)::date
        FROM mdata.load_stops ls
        WHERE ls.load_id = i.source_load_id
          AND ls.stop_type = 'delivery'
          AND ls.soft_deleted_at IS NULL
          AND ls.status <> 'cancelled'
        ORDER BY ls.sequence_number DESC
        LIMIT 1
      ),
      i.issue_date
    )
`;

/** Pure stop-selection mirror of FINAL_ACTIVE_DELIVERY_RECOGNITION_SQL (unit-testable). */
export type DeliveryStopEvidence = {
  sequence_number: number;
  status: string;
  soft_deleted_at: string | null;
  actual_departure_at: string | null;
};

export function selectFinalActiveDeliveryStop(
  stops: DeliveryStopEvidence[]
): DeliveryStopEvidence | null {
  let best: DeliveryStopEvidence | null = null;
  for (const s of stops) {
    if (s.status === "cancelled") continue;
    if (s.soft_deleted_at != null) continue;
    if (best == null || s.sequence_number > best.sequence_number) {
      best = s;
    }
  }
  return best;
}

type InvoiceRow = {
  invoice_id: string;
  display_id: string | null;
  recognition_date: string;
  total_cents: string | number;
  tax_cents: string | number;
  pretax_revenue_cents: string | number;
  status: string;
};

type GlDayRow = {
  d: string;
  cents: string | number;
};

type InvoiceGlLinkRow = {
  invoice_id: string;
  journal_entry_id: string;
  entry_date: string;
  je_status: string;
  gl_revenue_cents: string | number;
  non_revenue_credit_cents: string | number;
  account_ids: string[] | null;
};

type UnlinkedGlRow = {
  journal_entry_id: string;
  entry_date: string;
  gl_revenue_cents: string | number;
  account_ids: string[] | null;
  invoice_id: string | null;
};

/**
 * Compute dual-basis revenue for [fromDate, toDate] inclusive (YYYY-MM-DD, company business calendar).
 * Caller must already have set app.operating_company_id (withCompanyScope).
 */
export async function computeRevenueGlLinkage(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    fromDate: string;
    toDate: string;
  }
): Promise<RevenueGlLinkageResult> {
  const { operatingCompanyId, fromDate, toDate } = input;
  const probe = await probeCanonicalLinkageSurface(client);
  if (!probe.ok) {
    return unverifiableResult(fromDate, toDate, probe.reason ?? "canonical_linkage_unverifiable");
  }

  const eligible = [...INVOICE_BASIS_ELIGIBLE_STATUSES];
  const revenueTypes = [...REVENUE_ACCOUNT_TYPES];
  const postedBatch = [...POSTED_BATCH_STATUSES];

  const invoiceRes = await client.query<InvoiceRow>(
    `
      SELECT
        i.id::text AS invoice_id,
        i.display_id,
        (${FINAL_ACTIVE_DELIVERY_RECOGNITION_SQL})::text AS recognition_date,
        i.total_cents::bigint AS total_cents,
        COALESCE(i.tax_cents, 0)::bigint AS tax_cents,
        GREATEST(0, i.total_cents - COALESCE(i.tax_cents, 0))::bigint AS pretax_revenue_cents,
        i.status::text AS status
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid
        AND i.voided_at IS NULL
        AND i.status = ANY($5::text[])
        AND (${FINAL_ACTIVE_DELIVERY_RECOGNITION_SQL}) BETWEEN $2::date AND $3::date
      ORDER BY recognition_date ASC, i.display_id ASC NULLS LAST
    `,
    [operatingCompanyId, fromDate, toDate, COMPANY_TIME_ZONE, eligible]
  );

  const glDayRes = await client.query<GlDayRow>(
    `
      SELECT
        je.entry_date::text AS d,
        COALESCE(
          SUM(
            CASE
              WHEN p.debit_or_credit = 'credit' THEN p.amount_cents
              WHEN p.debit_or_credit = 'debit' THEN -p.amount_cents
              ELSE 0
            END
          ),
          0
        )::bigint AS cents
      FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries je
        ON je.id = p.journal_entry_uuid
       AND je.operating_company_id = p.operating_company_id
      JOIN catalogs.accounts a
        ON a.id = p.account_id
       AND a.operating_company_id = p.operating_company_id
      LEFT JOIN accounting.posting_batches pb
        ON pb.id = p.posting_batch_id
       AND pb.operating_company_id = p.operating_company_id
      WHERE p.operating_company_id = $1::uuid
        AND je.status <> 'voided'
        AND je.voided_at IS NULL
        AND je.entry_date BETWEEN $2::date AND $3::date
        AND a.account_type = ANY($4::text[])
        AND (p.posting_batch_id IS NULL OR pb.batch_status = ANY($5::text[]))
      GROUP BY je.entry_date
      ORDER BY je.entry_date ASC
    `,
    [operatingCompanyId, fromDate, toDate, revenueTypes, postedBatch]
  );

  // Per-invoice linked GL — only P&L-admitted batches (posted|reversed), matching day totals.
  const linkRes = await client.query<InvoiceGlLinkRow>(
    `
      WITH invoice_ids AS (
        SELECT i.id
        FROM accounting.invoices i
        WHERE i.operating_company_id = $1::uuid
          AND i.voided_at IS NULL
          AND i.status = ANY($5::text[])
          AND (${FINAL_ACTIVE_DELIVERY_RECOGNITION_SQL}) BETWEEN $2::date AND $3::date
      ),
      linked_postings AS (
        SELECT DISTINCT
          p.id AS posting_id,
          p.source_transaction_id AS invoice_id,
          p.journal_entry_uuid AS journal_entry_id,
          je.entry_date,
          je.status::text AS je_status,
          p.debit_or_credit,
          p.amount_cents,
          p.account_id,
          a.account_type
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je
          ON je.id = p.journal_entry_uuid
         AND je.operating_company_id = p.operating_company_id
        JOIN catalogs.accounts a
          ON a.id = p.account_id
         AND a.operating_company_id = p.operating_company_id
        LEFT JOIN accounting.posting_batches pb
          ON pb.id = p.posting_batch_id
         AND pb.operating_company_id = p.operating_company_id
        WHERE p.operating_company_id = $1::uuid
          AND p.source_transaction_type = 'invoice'
          AND p.source_transaction_id IN (SELECT id::text FROM invoice_ids)
          AND (p.posting_batch_id IS NULL OR pb.batch_status = ANY($6::text[]))

        UNION

        SELECT DISTINCT
          p.id AS posting_id,
          tsl.linked_object_id AS invoice_id,
          p.journal_entry_uuid AS journal_entry_id,
          je.entry_date,
          je.status::text AS je_status,
          p.debit_or_credit,
          p.amount_cents,
          p.account_id,
          a.account_type
        FROM accounting.transaction_source_links tsl
        JOIN accounting.journal_entry_postings p
          ON p.id = tsl.journal_entry_posting_id
         AND p.operating_company_id = tsl.operating_company_id
        JOIN accounting.journal_entries je
          ON je.id = p.journal_entry_uuid
         AND je.operating_company_id = p.operating_company_id
        JOIN catalogs.accounts a
          ON a.id = p.account_id
         AND a.operating_company_id = p.operating_company_id
        LEFT JOIN accounting.posting_batches pb
          ON pb.id = p.posting_batch_id
         AND pb.operating_company_id = p.operating_company_id
        WHERE tsl.operating_company_id = $1::uuid
          AND tsl.linked_object_type = 'invoice'
          AND tsl.linked_object_id IN (SELECT id::text FROM invoice_ids)
          AND (p.posting_batch_id IS NULL OR pb.batch_status = ANY($6::text[]))
      )
      SELECT
        lp.invoice_id::text AS invoice_id,
        lp.journal_entry_id::text AS journal_entry_id,
        lp.entry_date::text AS entry_date,
        lp.je_status,
        COALESCE(
          SUM(
            CASE
              WHEN lp.account_type = ANY($7::text[]) AND lp.debit_or_credit = 'credit' THEN lp.amount_cents
              WHEN lp.account_type = ANY($7::text[]) AND lp.debit_or_credit = 'debit' THEN -lp.amount_cents
              ELSE 0
            END
          ),
          0
        )::bigint AS gl_revenue_cents,
        COALESCE(
          SUM(
            CASE
              WHEN lp.debit_or_credit = 'credit'
                   AND lp.account_type IN ('Expense', 'OtherExpense', 'CostOfGoodsSold', 'Equity')
              THEN lp.amount_cents
              ELSE 0
            END
          ),
          0
        )::bigint AS non_revenue_credit_cents,
        array_agg(DISTINCT lp.account_id::text) FILTER (WHERE lp.account_type = ANY($7::text[])) AS account_ids
      FROM linked_postings lp
      GROUP BY lp.invoice_id, lp.journal_entry_id, lp.entry_date, lp.je_status
    `,
    [operatingCompanyId, fromDate, toDate, COMPANY_TIME_ZONE, eligible, postedBatch, revenueTypes]
  );

  // Unlinked GL revenue: not tied to an eligible in-window invoice via DIRECT source cols OR TSL.
  const unlinkedGlRes = await client.query<UnlinkedGlRow>(
    `
      SELECT
        je.id::text AS journal_entry_id,
        je.entry_date::text AS entry_date,
        COALESCE(
          SUM(
            CASE
              WHEN p.debit_or_credit = 'credit' THEN p.amount_cents
              WHEN p.debit_or_credit = 'debit' THEN -p.amount_cents
              ELSE 0
            END
          ),
          0
        )::bigint AS gl_revenue_cents,
        array_agg(DISTINCT p.account_id::text) AS account_ids,
        NULLIF(MAX(p.source_transaction_id), '') AS invoice_id
      FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries je
        ON je.id = p.journal_entry_uuid
       AND je.operating_company_id = p.operating_company_id
      JOIN catalogs.accounts a
        ON a.id = p.account_id
       AND a.operating_company_id = p.operating_company_id
      LEFT JOIN accounting.posting_batches pb
        ON pb.id = p.posting_batch_id
       AND pb.operating_company_id = p.operating_company_id
      WHERE p.operating_company_id = $1::uuid
        AND je.status <> 'voided'
        AND je.voided_at IS NULL
        AND je.entry_date BETWEEN $2::date AND $3::date
        AND a.account_type = ANY($4::text[])
        AND (p.posting_batch_id IS NULL OR pb.batch_status = ANY($6::text[]))
        AND NOT EXISTS (
          -- Direct source_transaction_* link to eligible invoice in recognition window
          SELECT 1
          FROM accounting.invoices i
          WHERE i.operating_company_id = $1::uuid
            AND p.source_transaction_type = 'invoice'
            AND i.id::text = p.source_transaction_id
            AND i.voided_at IS NULL
            AND i.status = ANY($7::text[])
            AND (${FINAL_ACTIVE_DELIVERY_RECOGNITION_SQL_TZ5}) BETWEEN $2::date AND $3::date
        )
        AND NOT EXISTS (
          -- TSL-only link (no false unlinked when poster wrote links without denormalized source cols)
          SELECT 1
          FROM accounting.transaction_source_links tsl
          JOIN accounting.invoices i
            ON i.id::text = tsl.linked_object_id
           AND i.operating_company_id = tsl.operating_company_id
          WHERE tsl.operating_company_id = $1::uuid
            AND tsl.journal_entry_posting_id = p.id
            AND tsl.linked_object_type = 'invoice'
            AND i.voided_at IS NULL
            AND i.status = ANY($7::text[])
            AND (${FINAL_ACTIVE_DELIVERY_RECOGNITION_SQL_TZ5}) BETWEEN $2::date AND $3::date
        )
      GROUP BY je.id, je.entry_date
      HAVING COALESCE(
        SUM(
          CASE
            WHEN p.debit_or_credit = 'credit' THEN p.amount_cents
            WHEN p.debit_or_credit = 'debit' THEN -p.amount_cents
            ELSE 0
          END
        ),
        0
      ) <> 0
    `,
    [operatingCompanyId, fromDate, toDate, revenueTypes, COMPANY_TIME_ZONE, postedBatch, eligible]
  );

  const invoiceBasisCents = invoiceRes.rows.reduce(
    (sum, r) => sum + pretaxCents(r.total_cents, r.tax_cents),
    0
  );
  const glPostedCents = glDayRes.rows.reduce((sum, r) => sum + Number(r.cents ?? 0), 0);

  const linksByInvoice = new Map<string, InvoiceGlLinkRow[]>();
  for (const row of linkRes.rows) {
    const list = linksByInvoice.get(row.invoice_id) ?? [];
    list.push(row);
    linksByInvoice.set(row.invoice_id, list);
  }

  const mismatchedInvoices: RevenueInvoiceDrill[] = [];
  const mismatchedJournals: RevenueJournalDrill[] = [];
  let discrepancyCents = 0;

  for (const inv of invoiceRes.rows) {
    const invoiceRevenue = pretaxCents(inv.total_cents, inv.tax_cents);
    const links = linksByInvoice.get(inv.invoice_id) ?? [];

    // Mutually exclusive categories — first match wins; cents counted once.
    if (links.length === 0) {
      mismatchedInvoices.push({
        invoice_id: inv.invoice_id,
        display_id: inv.display_id,
        recognition_date: inv.recognition_date,
        invoice_revenue_cents: invoiceRevenue,
        gl_revenue_cents: 0,
        journal_entry_ids: [],
        reason: "missing_je",
        href: invoiceHref(inv.invoice_id),
      });
      discrepancyCents += invoiceRevenue;
      continue;
    }

    const voidedLinks = links.filter((l) => l.je_status === "voided");
    const activeLinks = links.filter((l) => l.je_status !== "voided");
    if (activeLinks.length === 0 && voidedLinks.length > 0) {
      const jeIds = [...new Set(voidedLinks.map((l) => l.journal_entry_id))];
      mismatchedInvoices.push({
        invoice_id: inv.invoice_id,
        display_id: inv.display_id,
        recognition_date: inv.recognition_date,
        invoice_revenue_cents: invoiceRevenue,
        gl_revenue_cents: 0,
        journal_entry_ids: jeIds,
        reason: "voided_je",
        href: invoiceHref(inv.invoice_id),
      });
      for (const jeId of jeIds) {
        mismatchedJournals.push({
          journal_entry_id: jeId,
          entry_date: voidedLinks.find((l) => l.journal_entry_id === jeId)?.entry_date ?? inv.recognition_date,
          gl_revenue_cents: 0,
          invoice_id: inv.invoice_id,
          account_ids: [],
          reason: "voided_je",
          href: journalHref(jeId),
        });
      }
      discrepancyCents += invoiceRevenue;
      continue;
    }

    const glRevenue = activeLinks.reduce((sum, l) => sum + Number(l.gl_revenue_cents ?? 0), 0);
    const wrongAccountCents = activeLinks.reduce((sum, l) => sum + Number(l.non_revenue_credit_cents ?? 0), 0);
    const jeIds = [...new Set(activeLinks.map((l) => l.journal_entry_id))];

    // wrong_account: revenue-shaped credit landed off Income/OtherIncome; gl_revenue is 0.
    // Count invoice pretax once — do NOT also add wrongAccountCents (double-count veto).
    if (wrongAccountCents > 0 && glRevenue === 0) {
      mismatchedInvoices.push({
        invoice_id: inv.invoice_id,
        display_id: inv.display_id,
        recognition_date: inv.recognition_date,
        invoice_revenue_cents: invoiceRevenue,
        gl_revenue_cents: 0,
        journal_entry_ids: jeIds,
        reason: "wrong_account",
        href: invoiceHref(inv.invoice_id),
      });
      for (const link of activeLinks) {
        if (Number(link.non_revenue_credit_cents ?? 0) > 0) {
          mismatchedJournals.push({
            journal_entry_id: link.journal_entry_id,
            entry_date: link.entry_date,
            gl_revenue_cents: Number(link.gl_revenue_cents ?? 0),
            invoice_id: inv.invoice_id,
            account_ids: link.account_ids ?? [],
            reason: "wrong_account",
            href: journalHref(link.journal_entry_id),
          });
        }
      }
      discrepancyCents += invoiceRevenue;
      continue;
    }

    if (glRevenue !== invoiceRevenue) {
      mismatchedInvoices.push({
        invoice_id: inv.invoice_id,
        display_id: inv.display_id,
        recognition_date: inv.recognition_date,
        invoice_revenue_cents: invoiceRevenue,
        gl_revenue_cents: glRevenue,
        journal_entry_ids: jeIds,
        reason: "amount_mismatch",
        href: invoiceHref(inv.invoice_id),
      });
      for (const jeId of jeIds) {
        const link = activeLinks.find((l) => l.journal_entry_id === jeId)!;
        mismatchedJournals.push({
          journal_entry_id: jeId,
          entry_date: link.entry_date,
          gl_revenue_cents: Number(link.gl_revenue_cents ?? 0),
          invoice_id: inv.invoice_id,
          account_ids: link.account_ids ?? [],
          reason: "amount_mismatch",
          href: journalHref(jeId),
        });
      }
      discrepancyCents += Math.abs(invoiceRevenue - glRevenue);
    }
  }

  for (const row of unlinkedGlRes.rows) {
    const cents = Number(row.gl_revenue_cents ?? 0);
    if (cents === 0) continue;
    mismatchedJournals.push({
      journal_entry_id: row.journal_entry_id,
      entry_date: row.entry_date,
      gl_revenue_cents: cents,
      invoice_id: row.invoice_id,
      account_ids: row.account_ids ?? [],
      reason: "unlinked_gl_revenue",
      href: journalHref(row.journal_entry_id),
    });
    discrepancyCents += Math.abs(cents);
  }

  const jeSeen = new Set<string>();
  const uniqueJeDrills: RevenueJournalDrill[] = [];
  for (const d of mismatchedJournals) {
    const key = `${d.journal_entry_id}:${d.reason}`;
    if (jeSeen.has(key)) continue;
    jeSeen.add(key);
    uniqueJeDrills.push(d);
  }

  const invoiceByDay = new Map<string, number>();
  for (const inv of invoiceRes.rows) {
    invoiceByDay.set(
      inv.recognition_date,
      (invoiceByDay.get(inv.recognition_date) ?? 0) + pretaxCents(inv.total_cents, inv.tax_cents)
    );
  }
  const glByDay = new Map<string, number>();
  for (const row of glDayRes.rows) {
    glByDay.set(row.d, Number(row.cents ?? 0));
  }
  const allDates = new Set<string>([...invoiceByDay.keys(), ...glByDay.keys()]);
  for (let cursor = fromDate; cursor <= toDate; cursor = addDaysIso(cursor, 1)) {
    allDates.add(cursor);
  }
  const days: RevenueDayPoint[] = [...allDates]
    .sort()
    .filter((d) => d >= fromDate && d <= toDate)
    .map((date) => {
      const invoice_basis_cents = invoiceByDay.get(date) ?? 0;
      const gl_posted_revenue_cents = glByDay.get(date) ?? 0;
      return {
        date,
        invoice_basis_cents,
        gl_posted_revenue_cents,
        cents: invoice_basis_cents,
      };
    });

  const discrepancyCount =
    mismatchedInvoices.length + uniqueJeDrills.filter((d) => d.reason === "unlinked_gl_revenue").length;
  const status: RevenueGlLinkageResult["status"] =
    invoiceBasisCents === 0 && glPostedCents === 0 && discrepancyCount === 0 ? "empty" : "ok";

  return {
    status,
    unverifiable_reason: null,
    period: {
      from: fromDate,
      to: toDate,
      timezone: COMPANY_TIME_ZONE,
      recognition_model: "delivery_with_issue_date_fallback",
    },
    basis: { invoice: INVOICE_BASIS_META, gl: GL_BASIS_META },
    invoice_basis_cents: invoiceBasisCents,
    gl_posted_revenue_cents: glPostedCents,
    revenue_cents: invoiceBasisCents,
    discrepancy_count: discrepancyCount,
    discrepancy_cents: discrepancyCents,
    days,
    drill: {
      mismatched_invoices: mismatchedInvoices,
      mismatched_journal_entries: uniqueJeDrills,
    },
  };
}

export function todayRevenueWindow(now: Date = new Date()): { fromDate: string; toDate: string } {
  const today = companyBusinessDate(now);
  return { fromDate: today, toDate: today };
}

export function weeklyRevenueWindow(days: number, now: Date = new Date()): { fromDate: string; toDate: string } {
  const today = companyBusinessDate(now);
  const fromDate = addDaysIso(today, -Math.max(1, days));
  return { fromDate, toDate: today };
}

/** h-05: Home KPI range presets. All windows are inclusive, company business calendar. */
export const HOME_KPI_RANGES = ["today", "7d", "30d", "mtd", "ytd"] as const;
export type HomeKpiRange = (typeof HOME_KPI_RANGES)[number];

/**
 * h-05: resolve a Home KPI range preset to an inclusive [fromDate, toDate] window in the
 * company timezone. 7d/30d are rolling windows INCLUDING today (7d = today plus the prior
 * 6 days — matches QBO dashboard "Last 7 days" semantics); mtd/ytd are calendar-anchored.
 */
export function revenueRangeWindow(range: HomeKpiRange, now: Date = new Date()): { fromDate: string; toDate: string } {
  const today = companyBusinessDate(now);
  if (range === "today") return { fromDate: today, toDate: today };
  if (range === "7d") return { fromDate: addDaysIso(today, -6), toDate: today };
  if (range === "30d") return { fromDate: addDaysIso(today, -29), toDate: today };
  if (range === "mtd") return { fromDate: `${today.slice(0, 7)}-01`, toDate: today };
  // ytd
  return { fromDate: `${today.slice(0, 4)}-01-01`, toDate: today };
}

export const __test__ = {
  addDaysIso,
  emptyResult,
  unverifiableResult,
  pretaxCents,
  INVOICE_BASIS_META,
  GL_BASIS_META,
  REVENUE_ACCOUNT_TYPES,
  INVOICE_BASIS_ELIGIBLE_STATUSES,
  POSTED_BATCH_STATUSES,
  FINAL_ACTIVE_DELIVERY_RECOGNITION_SQL,
  selectFinalActiveDeliveryStop,
};
