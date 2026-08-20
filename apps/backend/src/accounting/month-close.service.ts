import { appendCrudAudit } from "../audit/crud-audit.js";
import { bankTransactionHiddenFilterSql, isBankAccountHideEnabled } from "../banking/bank-account-visibility.js";
import { withCompanyScope } from "./shared.js";
import { insertRetainedEarningsClosingJournalIfNeeded } from "./period-close-retained-earnings.service.js";
import { writePeriodCashBasisSnapshotAtClose } from "./cash-basis/period-close-snapshot.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";

// ACCT-F5656 — AF-7 money-control gate. `POST /api/v1/accounting/periods/:id/close`
// (p7-wave2.routes.ts) already refuses to close/lock a period or post the retained-earnings JE
// unless this flag is ON for the entity, resolved BEFORE BEGIN so an OFF entity never mutates
// anything. `lockMonthClose` is the SECOND door that does the exact same thing (locks the period,
// posts the same retained-earnings JE) and had no such check at all — an entity whose owner
// deliberately left period-close OFF could still close a period and post a retained-earnings JE
// through this route. Same check, same fail-closed-before-BEGIN placement, matching the sibling
// route exactly.
const MONEY_CONTROL_PERIOD_CLOSE_FLAG_KEY = "MONEY_CONTROL_PERIOD_CLOSE_ENABLED";

type BankReconPendingAccount = {
  bank_account_id: string;
  bank_account_name: string;
  total_transactions: number;
  covered_transactions: number;
};

export type MonthCloseStatus = {
  period: string;
  period_start: string;
  period_end: string;
  period_id: string | null;
  period_status: string | null;
  bank_recon: {
    complete: boolean;
    accounts_pending: BankReconPendingAccount[];
  };
  ar_aging_review: {
    complete: boolean;
    overdue_count: number;
    reviewed: boolean;
  };
  ap_aging_review: {
    complete: boolean;
    overdue_count: number;
    reviewed: boolean;
  };
  fuel_tax: {
    complete: boolean;
    ifta_filed: boolean;
    quarter_label: string;
    due_this_month: boolean;
  };
  adjusting_entries: {
    count: number;
  };
  can_lock: boolean;
};

type Client = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

function parsePeriod(period: string) {
  const [yearRaw, monthRaw] = period.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("invalid_period");
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
  };
}

// ACCT-F52: IFTA fuel tax is filed QUARTERLY (canonical `reports.ifta_filings`, quarter label
// "YYYY-Q#" per apps/backend/src/reports/ifta/mileage-aggregator.service.ts#parseQuarterLabel — NOT
// `accounting.sales_tax_returns`, which is an unrelated state sales-tax table). The checklist item
// only blocks close on the LAST month of a quarter (Mar/Jun/Sep/Dec); other months have nothing due.
function iftaQuarterInfo(year: number, month: number): { quarterLabel: string; dueThisMonth: boolean } {
  const quarter = Math.ceil(month / 3);
  return {
    quarterLabel: `${year}-Q${quarter}`,
    dueThisMonth: month % 3 === 0,
  };
}

type ChecklistItem = "ar_aging_review" | "ap_aging_review";

async function loadChecklistAcknowledgments(
  client: Client,
  input: { operatingCompanyId: string; period: string }
): Promise<Record<ChecklistItem, boolean>> {
  const ackRes = await client.query<{ checklist_item: string }>(
    `
      SELECT DISTINCT payload->>'checklist_item' AS checklist_item
      FROM audit.audit_events
      WHERE event_class = 'accounting.month_close_checklist_ack'
        AND payload->>'operating_company_id' = $1
        AND payload->>'period' = $2
    `,
    [input.operatingCompanyId, input.period]
  );
  const acked = new Set(ackRes.rows.map((row) => row.checklist_item));
  return {
    ar_aging_review: acked.has("ar_aging_review"),
    ap_aging_review: acked.has("ap_aging_review"),
  };
}

async function loadChecklist(client: Client, input: { operatingCompanyId: string; periodStart: string; periodEnd: string; period: string }) {
  const periodRes = await client.query<{
    id: string;
    status: string;
    period_start: string;
    period_end: string;
  }>(
    `
      SELECT
        id::text,
        status::text,
        period_start::text,
        period_end::text
      FROM accounting.periods
      WHERE operating_company_id = $1::uuid
        AND period_start <= $2::date
        AND period_end >= $3::date
      ORDER BY period_end DESC, created_at DESC
      LIMIT 1
    `,
    [input.operatingCompanyId, input.periodStart, input.periodEnd]
  );
  const period = periodRes.rows[0] ?? null;

  // BANK-ACCOUNT-HIDE: an account hidden for THIS entity is excluded from the month-close bank-recon
  // coverage requirement entirely (flag OFF by default — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
  const hideOnForClose = await isBankAccountHideEnabled(client, input.operatingCompanyId);
  const bankReconRes = await client.query<{
    bank_account_id: string;
    bank_account_name: string;
    total_transactions: number;
    covered_transactions: number;
  }>(
    `
      WITH coverage AS (
        SELECT
          bt.bank_account_id,
          COUNT(*)::int AS total_transactions,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM banking.reconciliation_matches rm
              WHERE rm.bank_transaction_id = bt.id
                AND rm.operating_company_id = bt.operating_company_id
                AND rm.match_state IN ('auto_matched', 'user_matched', 'rejected')
            )
          )::int AS covered_transactions
        FROM banking.bank_transactions bt
        WHERE bt.operating_company_id = $1::uuid
          AND bt.transaction_date BETWEEN $2::date AND $3::date
          ${bankTransactionHiddenFilterSql(hideOnForClose, "bt")}
        GROUP BY bt.bank_account_id
      )
      SELECT
        c.bank_account_id::text,
        COALESCE(ba.account_name, c.bank_account_id::text) AS bank_account_name,
        c.total_transactions,
        c.covered_transactions
      FROM coverage c
      LEFT JOIN banking.bank_accounts ba
        ON ba.id = c.bank_account_id
       AND ba.operating_company_id = $1::uuid
      WHERE c.covered_transactions < c.total_transactions
      ORDER BY bank_account_name ASC
    `,
    [input.operatingCompanyId, input.periodStart, input.periodEnd]
  );

  const arOverdueRes = await client.query<{ overdue_count: number }>(
    `
      SELECT COUNT(*)::int AS overdue_count
      FROM accounting.invoices inv
      WHERE inv.operating_company_id = $1::uuid
        AND inv.voided_at IS NULL
        AND COALESCE(inv.amount_open_cents, 0) > 0
        AND inv.due_date < $2::date
    `,
    [input.operatingCompanyId, input.periodEnd]
  );

  const apOverdueRes = await client.query<{ overdue_count: number }>(
    `
      -- ACCT-F183 class (this is the third leaf found carrying it — bills.service.ts and
      -- fin20-aging.service.ts were already fixed): accounting.bills.status is written as
      -- 'unpaid'/'partial' by current code and 'open'/'partially_paid' by legacy/other writers —
      -- live prod carries both 'unpaid' (1113 rows) and 'partial' (526 rows) today. Matching only
      -- ('open','partial') silently dropped every 'unpaid' bill from the month-close AP-overdue
      -- count. Measured live before this fix: 526 of 1512 true overdue-with-balance bills counted
      -- (986 'unpaid' bills invisible to this warning, prod-wide).
      SELECT COUNT(*)::int AS overdue_count
      FROM accounting.bills b
      WHERE b.operating_company_id = $1::uuid
        AND b.revoked_at IS NULL
        AND b.status IN ('open', 'unpaid', 'partial', 'partially_paid')
        AND COALESCE(b.amount_cents - b.paid_cents, 0) > 0
        AND COALESCE(b.due_date, b.bill_date) < $2::date
    `,
    [input.operatingCompanyId, input.periodEnd]
  );

  const periodEndYear = Number(input.periodEnd.slice(0, 4));
  const periodEndMonth = Number(input.periodEnd.slice(5, 7));
  const { quarterLabel: iftaQuarterLabel, dueThisMonth: iftaDueThisMonth } = iftaQuarterInfo(
    periodEndYear,
    periodEndMonth
  );
  const fuelTaxRes = await client.query<{ ifta_filed: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM reports.ifta_filings f
        WHERE f.operating_company_id = $1::uuid
          AND f.quarter = $2::text
          AND f.status = 'filed'
      ) AS ifta_filed
    `,
    [input.operatingCompanyId, iftaQuarterLabel]
  );

  const adjustingEntriesRes = await client.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM accounting.journal_entries je
      WHERE je.operating_company_id = $1::uuid
        AND je.status <> 'voided'
        AND je.source = 'manual'
        AND je.entry_date BETWEEN $2::date AND $3::date
    `,
    [input.operatingCompanyId, input.periodStart, input.periodEnd]
  );

  const accountsPending = bankReconRes.rows.map((row) => ({
    bank_account_id: row.bank_account_id,
    bank_account_name: row.bank_account_name,
    total_transactions: Number(row.total_transactions ?? 0),
    covered_transactions: Number(row.covered_transactions ?? 0),
  }));
  const arOverdueCount = Number(arOverdueRes.rows[0]?.overdue_count ?? 0);
  const apOverdueCount = Number(apOverdueRes.rows[0]?.overdue_count ?? 0);
  const iftaFiled = Boolean(fuelTaxRes.rows[0]?.ifta_filed ?? false);
  const adjustingCount = Number(adjustingEntriesRes.rows[0]?.count ?? 0);
  const acknowledgments = await loadChecklistAcknowledgments(client, {
    operatingCompanyId: input.operatingCompanyId,
    period: input.period,
  });

  const bankReconComplete = accountsPending.length === 0;
  const arComplete = arOverdueCount === 0 || acknowledgments.ar_aging_review;
  const apComplete = apOverdueCount === 0 || acknowledgments.ap_aging_review;
  // Nothing is due for a non-quarter-end month; only the quarter's closing month can block on it.
  const fuelTaxComplete = !iftaDueThisMonth || iftaFiled;
  const periodOpen = period?.status === "open";
  const canLock = periodOpen && bankReconComplete && arComplete && apComplete && fuelTaxComplete;

  return {
    period,
    accountsPending,
    arOverdueCount,
    apOverdueCount,
    iftaFiled,
    iftaQuarterLabel,
    iftaDueThisMonth,
    adjustingCount,
    canLock,
    acknowledgments,
  };
}

export async function getMonthCloseStatus(input: { userId: string; operatingCompanyId: string; period: string }): Promise<MonthCloseStatus> {
  const periodBounds = parsePeriod(input.period);

  return withCompanyScope(input.userId, input.operatingCompanyId, async (client) => {
    const checklist = await loadChecklist(client, {
      operatingCompanyId: input.operatingCompanyId,
      periodStart: periodBounds.period_start,
      periodEnd: periodBounds.period_end,
      period: input.period,
    });

    return {
      period: input.period,
      period_start: periodBounds.period_start,
      period_end: periodBounds.period_end,
      period_id: checklist.period?.id ?? null,
      period_status: checklist.period?.status ?? null,
      bank_recon: {
        complete: checklist.accountsPending.length === 0,
        accounts_pending: checklist.accountsPending,
      },
      ar_aging_review: {
        complete: checklist.arOverdueCount === 0 || checklist.acknowledgments.ar_aging_review,
        overdue_count: checklist.arOverdueCount,
        reviewed: checklist.acknowledgments.ar_aging_review,
      },
      ap_aging_review: {
        complete: checklist.apOverdueCount === 0 || checklist.acknowledgments.ap_aging_review,
        overdue_count: checklist.apOverdueCount,
        reviewed: checklist.acknowledgments.ap_aging_review,
      },
      fuel_tax: {
        complete: !checklist.iftaDueThisMonth || checklist.iftaFiled,
        ifta_filed: checklist.iftaFiled,
        quarter_label: checklist.iftaQuarterLabel,
        due_this_month: checklist.iftaDueThisMonth,
      },
      adjusting_entries: {
        count: checklist.adjustingCount,
      },
      can_lock: checklist.canLock,
    };
  });
}

export async function lockMonthClose(input: {
  userId: string;
  operatingCompanyId: string;
  period: string;
  closingNotes?: string;
}) {
  const periodBounds = parsePeriod(input.period);

  return withCompanyScope(input.userId, input.operatingCompanyId, async (client) => {
    // ACCT-F5656 — resolved BEFORE BEGIN so an OFF entity never posts the retained-earnings JE or
    // mutates a period, matching the sibling /periods/:id/close route's own placement exactly.
    const closeEnabled = await isEnabled(client, MONEY_CONTROL_PERIOD_CLOSE_FLAG_KEY, {
      operating_company_id: input.operatingCompanyId,
      user_uuid: input.userId,
    });
    if (!closeEnabled) throw new Error("period_close_disabled");
    await client.query("BEGIN");
    try {
      const checklist = await loadChecklist(client, {
        operatingCompanyId: input.operatingCompanyId,
        periodStart: periodBounds.period_start,
        periodEnd: periodBounds.period_end,
        period: input.period,
      });
      if (!checklist.canLock) {
        throw new Error("checklist_incomplete");
      }
      if (!checklist.period?.id) {
        throw new Error("period_not_found");
      }

      const retainedEarningsJeId = await insertRetainedEarningsClosingJournalIfNeeded(client, {
        operating_company_id: input.operatingCompanyId,
        period_start: checklist.period.period_start,
        period_end: checklist.period.period_end,
        fiscal_year: Number(checklist.period.period_start.slice(0, 4)),
        closer_user_id: input.userId,
      });

      await writePeriodCashBasisSnapshotAtClose(client, {
        operatingCompanyId: input.operatingCompanyId,
        periodId: checklist.period.id,
        periodStart: checklist.period.period_start,
        periodEnd: checklist.period.period_end,
        computedByUserUuid: input.userId,
      });

      const closeRes = await client.query(
        `
          UPDATE accounting.periods
          SET status = 'closed',
              closed_at = now(),
              closed_by_user_id = $3::uuid,
              closing_notes = $4,
              locks_txn_dates_le = period_end,
              retained_earnings_entry_id = COALESCE($5::uuid, retained_earnings_entry_id),
              updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND status = 'open'
          RETURNING id::text
        `,
        [checklist.period.id, input.operatingCompanyId, input.userId, input.closingNotes ?? null, retainedEarningsJeId]
      );
      if (!closeRes.rows[0]) {
        throw new Error("period_not_open");
      }

      await appendCrudAudit(
        client,
        input.userId,
        "accounting.month_close_locked",
        {
          period_id: checklist.period.id,
          period: input.period,
          retained_earnings_entry_id: retainedEarningsJeId,
          checklist: {
            bank_recon_pending_accounts: checklist.accountsPending.length,
            ar_overdue_count: checklist.arOverdueCount,
            ap_overdue_count: checklist.apOverdueCount,
            ar_review_acknowledged: checklist.acknowledgments.ar_aging_review,
            ap_review_acknowledged: checklist.acknowledgments.ap_aging_review,
            ifta_filed: checklist.iftaFiled,
            adjusting_entries: checklist.adjustingCount,
          },
        },
        "info",
        "Block-CMC"
      );

      await client.query("COMMIT");
      return {
        ok: true,
        period_id: checklist.period.id,
        retained_earnings_entry_id: retainedEarningsJeId,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}

export async function acknowledgeMonthCloseChecklist(input: {
  userId: string;
  operatingCompanyId: string;
  period: string;
  checklistItem: ChecklistItem;
}) {
  parsePeriod(input.period);

  return withCompanyScope(input.userId, input.operatingCompanyId, async (client) => {
    await appendCrudAudit(
      client,
      input.userId,
      "accounting.month_close_checklist_ack",
      {
        operating_company_id: input.operatingCompanyId,
        period: input.period,
        checklist_item: input.checklistItem,
      },
      "info",
      "Block-CMC"
    );
    return { ok: true as const, checklist_item: input.checklistItem };
  });
}
