import { getApAgingReport, type ApAgingTotals } from "../ap-aging.service.js";
import { getArAgingReport, type ArAgingTotals } from "../ar-aging.service.js";
import { withCompanyScope } from "../shared.js";

export type AgingBuckets = {
  current_cents: number;
  d1_30_cents: number;
  d31_60_cents: number;
  d61_90_cents: number;
  d90_plus_cents: number;
  total_outstanding_cents: number;
};

export type AccountingHomeData = {
  as_of_date: string;
  ar_aging: AgingBuckets;
  ap_aging: AgingBuckets;
  period_close: {
    period_label: string | null;
    period_end: string | null;
    status: string | null;
    days_to_close: number | null;
  };
  pending_journal_approvals: number;
  qbo: {
    outbox_depth: number;
    last_sync_at: string | null;
    failed_outbox_count: number;
  };
  early_pay_discounts_expiring_this_week: number;
};

function mapAgingTotals(totals: ArAgingTotals | ApAgingTotals): AgingBuckets {
  return {
    current_cents: totals.current,
    d1_30_cents: totals.d1_30,
    d31_60_cents: totals.d31_60,
    d61_90_cents: totals.d61_90,
    d90_plus_cents: totals.d90_plus,
    total_outstanding_cents: totals.total_outstanding,
  };
}

export function computeDaysToClose(periodEnd: string | null, asOfDate: string): number | null {
  if (!periodEnd) return null;
  const endMs = new Date(`${periodEnd}T00:00:00.000Z`).getTime();
  const asOfMs = new Date(`${asOfDate}T00:00:00.000Z`).getTime();
  if (Number.isNaN(endMs) || Number.isNaN(asOfMs)) return null;
  return Math.max(0, Math.ceil((endMs - asOfMs) / 86_400_000));
}

async function tableExists(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }> }, table: string) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [table]);
  return Boolean(res.rows[0]?.ok);
}

async function columnExists(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }> },
  schema: string,
  table: string,
  column: string
) {
  const res = await client.query(
    `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3) AS ok`,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

export async function getAccountingHomeData(input: {
  userId: string;
  operating_company_id: string;
}): Promise<AccountingHomeData> {
  const asOfDate = new Date().toISOString().slice(0, 10);

  const [arReport, apReport, supplemental] = await Promise.all([
    getArAgingReport({
      userId: input.userId,
      operating_company_id: input.operating_company_id,
      as_of_date: asOfDate,
    }),
    getApAgingReport({
      userId: input.userId,
      operating_company_id: input.operating_company_id,
      as_of_date: asOfDate,
    }),
    withCompanyScope(input.userId, input.operating_company_id, async (client) => {
      const periodRes = await client.query(
        `
          SELECT period_label, period_end::text AS period_end, status
          FROM accounting.periods
          WHERE operating_company_id = $1::uuid
            AND status = 'open'
          ORDER BY period_start DESC
          LIMIT 1
        `,
        [input.operating_company_id]
      );
      const openPeriod = (periodRes.rows[0] as { period_label: string; period_end: string; status: string } | undefined) ?? null;

      let pendingJournalApprovals = 0;
      if (await tableExists(client, "accounting.period_close_warnings")) {
        const warnRes = await client.query(
          `
            SELECT COUNT(*)::text AS c
            FROM accounting.period_close_warnings
            WHERE operating_company_id = $1::uuid
          `,
          [input.operating_company_id]
        );
        pendingJournalApprovals = Number((warnRes.rows[0] as { c?: string } | undefined)?.c ?? 0);
      }

      let outboxDepth = 0;
      let lastSyncAt: string | null = null;
      let failedOutboxCount = 0;

      if (await tableExists(client, "integrations.qbo_sync_queue")) {
        const queueRes = await client.query(
          `
            SELECT
              COUNT(*) FILTER (WHERE sync_status IN ('pending', 'in_flight'))::text AS pending,
              MAX(synced_at) FILTER (WHERE sync_status = 'synced')::text AS last_sync
            FROM integrations.qbo_sync_queue
            WHERE operating_company_id = $1::uuid
          `,
          [input.operating_company_id]
        );
        const queueRow = queueRes.rows[0] as { pending?: string; last_sync?: string | null } | undefined;
        outboxDepth = Number(queueRow?.pending ?? 0);
        lastSyncAt = queueRow?.last_sync ?? null;
      }

      if (await tableExists(client, "outbox.events")) {
        const failedRes = await client.query(
          `
            SELECT COUNT(*)::text AS c
            FROM outbox.events e
            WHERE e.failed_at IS NOT NULL
              AND COALESCE(e.payload->>'operating_company_id', '') = $1::text
          `,
          [input.operating_company_id]
        );
        failedOutboxCount = Number((failedRes.rows[0] as { c?: string } | undefined)?.c ?? 0);
      }

      let earlyPayExpiring = 0;
      // accounting.bills has no payment_terms_id linkage yet (the early-pay-discount window can't be
      // computed for bills until a future migration adds it). Guard on the column's existence so the
      // home page never 500s on a phantom column; lights up automatically once the column is added.
      if (
        (await tableExists(client, "catalogs.payment_terms")) &&
        (await columnExists(client, "accounting", "bills", "payment_terms_id"))
      ) {
        const earlyRes = await client.query(
          `
            SELECT COUNT(*)::text AS c
            FROM accounting.bills b
            JOIN catalogs.payment_terms pt ON pt.id = b.payment_terms_id
            WHERE b.operating_company_id = $1::uuid
              AND b.revoked_at IS NULL
              AND b.status IN ('unpaid', 'partial')
              AND pt.early_payment_discount_pct IS NOT NULL
              AND pt.early_payment_discount_days IS NOT NULL
              AND (b.bill_date + (pt.early_payment_discount_days || ' days')::interval)::date
                BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')::date
              AND GREATEST(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0), 0) > 0
          `,
          [input.operating_company_id]
        );
        earlyPayExpiring = Number((earlyRes.rows[0] as { c?: string } | undefined)?.c ?? 0);
      }

      return {
        openPeriod,
        pendingJournalApprovals,
        outboxDepth,
        lastSyncAt,
        failedOutboxCount,
        earlyPayExpiring,
      };
    }),
  ]);

  const periodEnd = supplemental.openPeriod?.period_end ?? null;

  return {
    as_of_date: asOfDate,
    ar_aging: mapAgingTotals(arReport.totals),
    ap_aging: mapAgingTotals(apReport.totals),
    period_close: {
      period_label: supplemental.openPeriod?.period_label ?? null,
      period_end: periodEnd,
      status: supplemental.openPeriod?.status ?? null,
      days_to_close: computeDaysToClose(periodEnd, asOfDate),
    },
    pending_journal_approvals: supplemental.pendingJournalApprovals,
    qbo: {
      outbox_depth: supplemental.outboxDepth,
      last_sync_at: supplemental.lastSyncAt,
      failed_outbox_count: supplemental.failedOutboxCount,
    },
    early_pay_discounts_expiring_this_week: supplemental.earlyPayExpiring,
  };
}
