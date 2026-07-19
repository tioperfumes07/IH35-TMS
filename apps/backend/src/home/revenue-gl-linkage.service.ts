/**
 * 0280-02-revenue-gl-linkage — read-only dual-basis Home revenue cross-check.
 *
 * ROOT CAUSE: /home/today-revenue and /home/weekly-revenue summed accounting.invoices.total_cents
 * only (UTC CURRENT_DATE), with no journal_entry_postings cross-check and no invoice-basis label.
 * Silent catch → fabricated $0.
 *
 * FIX: entity-scoped read that exposes invoice-basis revenue alongside GL-posted revenue for the
 * same delivery-recognition period (company TZ; COALESCE(final delivery-stop actual_departure_at CT date, issue_date)),
 * governed Income/OtherIncome accounts, explicit basis/source metadata, discrepancy count/amount,
 * and forward drill ids. Reuses existing source_transaction_* + transaction_source_links spine from
 * the invoice poster — NO new GL math/writes. Missing canonical linkage surface → status=unverifiable
 * (never fabricate zero).
 *
 * Standards: QuickBooks P&L dual-view honesty + McLeod/Alvys ops revenue tiles that label basis;
 * CPA locked accrual recognition = load delivery (invoice = billing readiness).
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
  /** Invoice total_cents (non-void) attributed to the recognition period — widget headline. */
  invoice_basis_cents: number;
  /** Net credits to Income/OtherIncome in the same period (P&L-aligned). */
  gl_posted_revenue_cents: number;
  /**
   * Backward-compat headline. Null when unverifiable so clients cannot treat a fabricated 0 as revenue.
   * When ok/empty, equals invoice_basis_cents.
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

const REVENUE_ACCOUNT_TYPES = ["Income", "OtherIncome"] as const;

const INVOICE_BASIS_META: RevenueBasisMeta = {
  label: "invoice_basis",
  source: "accounting.invoices",
  recognition:
    "COALESCE((final delivery stop actual_departure_at AT TIME ZONE company_tz)::date, invoices.issue_date)",
};

const GL_BASIS_META: RevenueBasisMeta = {
  label: "gl_posted",
  source: "accounting.journal_entry_postings",
  recognition: "journal_entries.entry_date (non-voided)",
  governed_accounts: "catalogs.accounts.account_type IN (Income, OtherIncome)",
};

function addDaysIso(ymd: string, delta: number): string {
  // Interpret YMD as a calendar date in company TZ by anchoring at noon UTC (safe for ±14h zones).
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
  }>(
    `
      SELECT
        to_regclass('accounting.invoices') IS NOT NULL AS invoices_ok,
        to_regclass('accounting.journal_entries') IS NOT NULL AS je_ok,
        to_regclass('accounting.journal_entry_postings') IS NOT NULL AS jep_ok,
        to_regclass('accounting.transaction_source_links') IS NOT NULL AS tsl_ok,
        to_regclass('catalogs.accounts') IS NOT NULL AS accounts_ok,
        to_regclass('mdata.load_stops') IS NOT NULL AS load_stops_ok
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

  const cols = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'accounting'
        AND table_name = 'journal_entry_postings'
        AND column_name = ANY($1::text[])
    `,
    [["source_transaction_type", "source_transaction_id", "journal_entry_uuid", "debit_or_credit", "amount_cents", "account_id"]]
  );
  const have = new Set(cols.rows.map((r) => r.column_name));
  for (const required of [
    "source_transaction_type",
    "source_transaction_id",
    "journal_entry_uuid",
    "debit_or_credit",
    "amount_cents",
    "account_id",
  ]) {
    if (!have.has(required)) {
      return { ok: false, reason: `missing_column:accounting.journal_entry_postings.${required}` };
    }
  }

  // Final-delivery-stop actual_departure_at is preferred for recognition; missing stops table
  // forces issue_date-only (still verifiable — CPA fallback, not unverifiable).
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

type InvoiceRow = {
  invoice_id: string;
  display_id: string | null;
  recognition_date: string;
  total_cents: string | number;
  tax_cents: string | number;
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

  // CPA locked accrual recognition = final active delivery stop actual_departure_at
  // (booking-gap / McLeod-style delivery evidence). Fall back to issue_date when unlinked.
  const recognitionExpr = `
    COALESCE(
      (
        SELECT (MAX(ls.actual_departure_at) AT TIME ZONE $4)::date
        FROM mdata.load_stops ls
        WHERE ls.load_id = i.source_load_id
          AND ls.stop_type = 'delivery'
          AND ls.actual_departure_at IS NOT NULL
          AND ls.soft_deleted_at IS NULL
      ),
      i.issue_date
    )
  `;

  const invoiceRes = await client.query<InvoiceRow>(
    `
      SELECT
        i.id::text AS invoice_id,
        i.display_id,
        (${recognitionExpr})::text AS recognition_date,
        i.total_cents::bigint AS total_cents,
        COALESCE(i.tax_cents, 0)::bigint AS tax_cents,
        i.status::text AS status
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid
        AND i.voided_at IS NULL
        AND i.status <> 'void'
        AND (${recognitionExpr}) BETWEEN $2::date AND $3::date
      ORDER BY recognition_date ASC, i.display_id ASC NULLS LAST
    `,
    [operatingCompanyId, fromDate, toDate, COMPANY_TIME_ZONE]
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
        AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
      GROUP BY je.entry_date
      ORDER BY je.entry_date ASC
    `,
    [operatingCompanyId, fromDate, toDate, REVENUE_ACCOUNT_TYPES as unknown as string[]]
  );

  // Per-invoice linked GL revenue credits on governed revenue accounts (and non-revenue credits for wrong_account).
  const linkRes = await client.query<InvoiceGlLinkRow>(
    `
      WITH invoice_ids AS (
        SELECT i.id
        FROM accounting.invoices i
        WHERE i.operating_company_id = $1::uuid
          AND i.voided_at IS NULL
          AND i.status <> 'void'
          AND COALESCE(
            (
              SELECT (MAX(ls.actual_departure_at) AT TIME ZONE $4)::date
              FROM mdata.load_stops ls
              WHERE ls.load_id = i.source_load_id
                AND ls.stop_type = 'delivery'
                AND ls.actual_departure_at IS NOT NULL
                AND ls.soft_deleted_at IS NULL
            ),
            i.issue_date
          ) BETWEEN $2::date AND $3::date
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
        WHERE p.operating_company_id = $1::uuid
          AND p.source_transaction_type = 'invoice'
          AND p.source_transaction_id IN (SELECT id::text FROM invoice_ids)

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
        WHERE tsl.operating_company_id = $1::uuid
          AND tsl.linked_object_type = 'invoice'
          AND tsl.linked_object_id IN (SELECT id::text FROM invoice_ids)
      )
      SELECT
        lp.invoice_id::text AS invoice_id,
        lp.journal_entry_id::text AS journal_entry_id,
        lp.entry_date::text AS entry_date,
        lp.je_status,
        COALESCE(
          SUM(
            CASE
              WHEN lp.account_type = ANY($5::text[]) AND lp.debit_or_credit = 'credit' THEN lp.amount_cents
              WHEN lp.account_type = ANY($5::text[]) AND lp.debit_or_credit = 'debit' THEN -lp.amount_cents
              ELSE 0
            END
          ),
          0
        )::bigint AS gl_revenue_cents,
        -- "Wrong account" = revenue-shaped credit landed on an expense/COGS/equity account
        -- (not A/R debit, not sales-tax payable liability). Tax credits must not false-positive.
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
        array_agg(DISTINCT lp.account_id::text) FILTER (WHERE lp.account_type = ANY($5::text[])) AS account_ids
      FROM linked_postings lp
      GROUP BY lp.invoice_id, lp.journal_entry_id, lp.entry_date, lp.je_status
    `,
    [operatingCompanyId, fromDate, toDate, COMPANY_TIME_ZONE, REVENUE_ACCOUNT_TYPES as unknown as string[]]
  );

  // GL revenue in period tagged to an invoice that is outside the recognition window / unknown / wrong.
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
        AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
        AND (
          p.source_transaction_type IS DISTINCT FROM 'invoice'
          OR p.source_transaction_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM accounting.invoices i
            WHERE i.operating_company_id = $1::uuid
              AND i.id::text = p.source_transaction_id
              AND i.voided_at IS NULL
              AND i.status <> 'void'
              AND COALESCE(
                (
                  SELECT (MAX(ls.actual_departure_at) AT TIME ZONE $5)::date
                  FROM mdata.load_stops ls
                  WHERE ls.load_id = i.source_load_id
                    AND ls.stop_type = 'delivery'
                    AND ls.actual_departure_at IS NOT NULL
                    AND ls.soft_deleted_at IS NULL
                ),
                i.issue_date
              ) BETWEEN $2::date AND $3::date
          )
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
    [operatingCompanyId, fromDate, toDate, REVENUE_ACCOUNT_TYPES as unknown as string[], COMPANY_TIME_ZONE]
  );

  const invoiceBasisCents = invoiceRes.rows.reduce((sum, r) => sum + Number(r.total_cents ?? 0), 0);
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
    const invoiceRevenue = Math.max(0, Number(inv.total_cents ?? 0) - Number(inv.tax_cents ?? 0));
    const links = linksByInvoice.get(inv.invoice_id) ?? [];
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

    if (wrongAccountCents > 0 && glRevenue === 0) {
      mismatchedInvoices.push({
        invoice_id: inv.invoice_id,
        display_id: inv.display_id,
        recognition_date: inv.recognition_date,
        invoice_revenue_cents: invoiceRevenue,
        gl_revenue_cents: glRevenue,
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
      discrepancyCents += Math.abs(invoiceRevenue - glRevenue) + wrongAccountCents;
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

  // Deduplicate journal drills by (je, reason)
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
    invoiceByDay.set(inv.recognition_date, (invoiceByDay.get(inv.recognition_date) ?? 0) + Number(inv.total_cents ?? 0));
  }
  const glByDay = new Map<string, number>();
  for (const row of glDayRes.rows) {
    glByDay.set(row.d, Number(row.cents ?? 0));
  }
  const allDates = new Set<string>([...invoiceByDay.keys(), ...glByDay.keys()]);
  // Fill calendar span so weekly chart has continuous days when either side has activity.
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

  const discrepancyCount = mismatchedInvoices.length + uniqueJeDrills.filter((d) => d.reason === "unlinked_gl_revenue").length;
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

/** Today window in company business timezone. */
export function todayRevenueWindow(now: Date = new Date()): { fromDate: string; toDate: string } {
  const today = companyBusinessDate(now);
  return { fromDate: today, toDate: today };
}

/** Weekly window matching prior widget behavior: [today - days, today] inclusive. */
export function weeklyRevenueWindow(days: number, now: Date = new Date()): { fromDate: string; toDate: string } {
  const today = companyBusinessDate(now);
  const fromDate = addDaysIso(today, -Math.max(1, days));
  return { fromDate, toDate: today };
}

/** Pure helpers exported for unit tests (no DB). */
export const __test__ = {
  addDaysIso,
  emptyResult,
  unverifiableResult,
  INVOICE_BASIS_META,
  GL_BASIS_META,
  REVENUE_ACCOUNT_TYPES,
};
