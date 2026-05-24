import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCompanyScope } from "./shared.js";
import { insertRetainedEarningsClosingJournalIfNeeded } from "./period-close-retained-earnings.service.js";
import { writePeriodCashBasisSnapshotAtClose } from "./cash-basis/period-close-snapshot.service.js";

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
  };
  ap_aging_review: {
    complete: boolean;
    overdue_count: number;
  };
  fuel_tax: {
    complete: boolean;
    ifta_filed: boolean;
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

async function loadChecklist(client: Client, input: { operatingCompanyId: string; periodStart: string; periodEnd: string }) {
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
              FROM bank.reconciliation_matches rm
              WHERE rm.bank_transaction_id = bt.id
                AND rm.operating_company_id = bt.operating_company_id
                AND rm.match_state IN ('auto_matched', 'user_matched', 'rejected')
            )
          )::int AS covered_transactions
        FROM banking.bank_transactions bt
        WHERE bt.operating_company_id = $1::uuid
          AND bt.transaction_date BETWEEN $2::date AND $3::date
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
      SELECT COUNT(*)::int AS overdue_count
      FROM accounting.bills b
      WHERE b.operating_company_id = $1::uuid
        AND b.revoked_at IS NULL
        AND b.status IN ('open', 'partial')
        AND COALESCE(b.amount_cents - b.paid_cents, 0) > 0
        AND COALESCE(b.due_date, b.bill_date) < $2::date
    `,
    [input.operatingCompanyId, input.periodEnd]
  );

  const fuelTaxRes = await client.query<{ ifta_filed: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM accounting.sales_tax_returns r
        WHERE r.operating_company_id = $1::uuid
          AND r.period_start = $2::date
          AND r.period_end = $3::date
          AND r.status IN ('filed', 'paid')
      ) AS ifta_filed
    `,
    [input.operatingCompanyId, input.periodStart, input.periodEnd]
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

  const bankReconComplete = accountsPending.length === 0;
  const arComplete = arOverdueCount === 0;
  const apComplete = apOverdueCount === 0;
  const fuelTaxComplete = iftaFiled;
  const periodOpen = period?.status === "open";
  const canLock = periodOpen && bankReconComplete && arComplete && apComplete && fuelTaxComplete;

  return {
    period,
    accountsPending,
    arOverdueCount,
    apOverdueCount,
    iftaFiled,
    adjustingCount,
    canLock,
  };
}

export async function getMonthCloseStatus(input: { userId: string; operatingCompanyId: string; period: string }): Promise<MonthCloseStatus> {
  const periodBounds = parsePeriod(input.period);

  return withCompanyScope(input.userId, input.operatingCompanyId, async (client) => {
    const checklist = await loadChecklist(client, {
      operatingCompanyId: input.operatingCompanyId,
      periodStart: periodBounds.period_start,
      periodEnd: periodBounds.period_end,
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
        complete: checklist.arOverdueCount === 0,
        overdue_count: checklist.arOverdueCount,
      },
      ap_aging_review: {
        complete: checklist.apOverdueCount === 0,
        overdue_count: checklist.apOverdueCount,
      },
      fuel_tax: {
        complete: checklist.iftaFiled,
        ifta_filed: checklist.iftaFiled,
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
    await client.query("BEGIN");
    try {
      const checklist = await loadChecklist(client, {
        operatingCompanyId: input.operatingCompanyId,
        periodStart: periodBounds.period_start,
        periodEnd: periodBounds.period_end,
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
