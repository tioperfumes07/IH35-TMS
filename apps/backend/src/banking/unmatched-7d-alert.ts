import { bankLineHasLiveDocumentPointerSql, bankLineIsUnmatchedSql } from "./bank-line-match-pointer.js";

/**
 * ENG-7D / ENG-MATCH — owner A1: Alert after 7 days unmatched. One threshold only.
 *
 * Two bank-match defects this module kills:
 *   1. "unmatched" was a CATEGORIZE-account null (GL mapping). Match is a document pointer.
 *   2. the window was recency (created in the last week). A1 is AGE: transaction_date
 *      is 7+ days old AND still unmatched.
 *
 * A COUNT on a page is not an alert. The integrity-alert engine upserts one digest alert
 * per company and pages Owner/Administrator via banking.transaction.flagged.
 *
 * ENG-MATCH: the pointer predicate lives in bank-line-match-pointer.ts so KPI / accept /
 * suggest / reconcile-unmatched cannot drift back to review_state or a CATEGORIZE-account null.
 */

export const BANK_UNMATCHED_7D_RULE_CODE = "bank_unmatched_7d";
export const UNMATCHED_7D_THRESHOLD_DAYS = 7;
export const BANK_UNMATCHED_7D_SUBJECT_KEY = "bank_unmatched_7d:company";
export const BANK_UNMATCHED_7D_RULE_NAME = "Bank line unmatched 7+ days";

/**
 * Catalog rule at the engine door — CREATE-only, posts nothing.
 * ACCT-F406: this is not a money seed and not a migration. A .sql here would arm every
 * live-domain guard (GATE-SCOPE-02) against purge-population 1090/1295 debt.
 */
export async function ensureBankUnmatched7dRule(
  client: QueryableClient,
  operatingCompanyId: string
): Promise<void> {
  await client.query(
    `
      INSERT INTO safety.integrity_alert_rules (
        operating_company_id,
        rule_code,
        rule_name,
        source_view,
        alert_category,
        subject_type,
        threshold_config,
        severity,
        enabled
      ) VALUES (
        $1::uuid,
        $2,
        $3,
        'banking.bank_transactions',
        'accounting_integrity',
        'accounting',
        '{"stale_days": 7}'::jsonb,
        'critical',
        true
      )
      ON CONFLICT (operating_company_id, rule_code) DO NOTHING
    `,
    [operatingCompanyId, BANK_UNMATCHED_7D_RULE_CODE, BANK_UNMATCHED_7D_RULE_NAME]
  );
}

/** Live bank line with no live document pointer, aged 7+ Chicago days. */
export const AGED_UNMATCHED_BANK_LINE_SQL = `
  bt.voided_at IS NULL
  AND bt.transaction_date <= ((now() AT TIME ZONE 'America/Chicago')::date - $2::int)
  AND ${bankLineIsUnmatchedSql("bt")}
`;

type QueryableClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type AgedUnmatchedDigest = {
  unmatched_count: number;
  oldest_transaction_date: string | null;
  newest_transaction_date: string | null;
  sample_bank_transaction_ids: string[];
};

export async function loadAgedUnmatchedDigest(
  client: QueryableClient,
  operatingCompanyId: string,
  staleDays: number = UNMATCHED_7D_THRESHOLD_DAYS
): Promise<AgedUnmatchedDigest> {
  const res = await client.query<{
    unmatched_count: number;
    oldest_transaction_date: string | null;
    newest_transaction_date: string | null;
    sample_bank_transaction_ids: string[] | null;
  }>(
    `
      SELECT
        COUNT(*)::int AS unmatched_count,
        MIN(bt.transaction_date)::text AS oldest_transaction_date,
        MAX(bt.transaction_date)::text AS newest_transaction_date,
        (ARRAY_AGG(bt.id::text ORDER BY bt.transaction_date ASC, bt.id ASC))[1:8] AS sample_bank_transaction_ids
      FROM banking.bank_transactions bt
      WHERE bt.operating_company_id = $1::uuid
        AND ${AGED_UNMATCHED_BANK_LINE_SQL}
    `,
    [operatingCompanyId, staleDays]
  );
  const row = res.rows[0];
  return {
    unmatched_count: Number(row?.unmatched_count ?? 0),
    oldest_transaction_date: row?.oldest_transaction_date ?? null,
    newest_transaction_date: row?.newest_transaction_date ?? null,
    sample_bank_transaction_ids: row?.sample_bank_transaction_ids ?? [],
  };
}

export function detectionSummaryForDigest(digest: AgedUnmatchedDigest, staleDays: number): string {
  if (digest.unmatched_count <= 0) {
    return `No bank lines unmatched for ${staleDays}+ days`;
  }
  const oldest = digest.oldest_transaction_date ? ` oldest ${digest.oldest_transaction_date}` : "";
  return `${digest.unmatched_count} bank line${digest.unmatched_count === 1 ? "" : "s"} unmatched for ${staleDays}+ days${oldest}`;
}

export async function countAgedMatchedBankLines(
  client: QueryableClient,
  operatingCompanyId: string,
  staleDays: number = UNMATCHED_7D_THRESHOLD_DAYS
): Promise<number> {
  const res = await client.query<{ matched_count: number }>(
    `
      SELECT COUNT(*)::int AS matched_count
      FROM banking.bank_transactions bt
      WHERE bt.operating_company_id = $1::uuid
        AND bt.voided_at IS NULL
        AND bt.transaction_date <= ((now() AT TIME ZONE 'America/Chicago')::date - $2::int)
        AND ${bankLineHasLiveDocumentPointerSql("bt")}
    `,
    [operatingCompanyId, staleDays]
  );
  return Number(res.rows[0]?.matched_count ?? 0);
}

export async function resolveBankUnmatched7dEvents(
  client: QueryableClient,
  operatingCompanyId: string,
  ruleId: string
): Promise<number> {
  const events = await client.query<{ integrity_alert_id: string | null }>(
    `
      UPDATE safety.integrity_alert_events
      SET event_status = 'resolved',
          updated_at = now()
      WHERE operating_company_id = $1::uuid
        AND rule_id = $2::uuid
        AND event_status <> 'resolved'
      RETURNING integrity_alert_id
    `,
    [operatingCompanyId, ruleId]
  );
  const alertIds = [...new Set(events.rows.map((r) => r.integrity_alert_id).filter((id): id is string => Boolean(id)))];
  if (alertIds.length > 0) {
    await client.query(
      `
        UPDATE safety.integrity_alerts
        SET resolution_status = 'confirmed_action_taken',
            resolution_action = 'All aged unmatched bank lines now carry a live document pointer (ENG-7D auto-resolve).'
        WHERE operating_company_id = $1::uuid
          AND id = ANY($2::uuid[])
          AND COALESCE(resolution_status, 'unresolved') IN ('unresolved', 'investigating')
      `,
      [operatingCompanyId, alertIds]
    );
  }
  return events.rowCount ?? events.rows.length;
}
