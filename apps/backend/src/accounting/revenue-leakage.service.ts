/**
 * ACCT-R-16 — ASC 606 revenue leakage / unbilled tracking (READ-ONLY).
 *
 * Surfaces delivered (or later) loads missing the earn latch, earn-without-bill
 * gaps, and a cents rollup of unbilled (earn posted, bill not yet). No posting.
 * Matches QBO/NetSuite unbilled AR seriousness without inventing GL math.
 */
import type { PoolClient } from "pg";

const DELIVERED_LIKE = [
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
] as const;

export type RevenueLeakageRow = {
  load_id: string;
  load_number: string | null;
  status: string;
  rate_total_cents: number;
  customer_id: string | null;
  gap: "missing_earn" | "earn_missing_bill";
  earn_journal_entry_id: string | null;
  earn_amount_cents: number | null;
};

export type RevenueLeakageSummary = {
  delivered_like_count: number;
  missing_earn_count: number;
  earn_missing_bill_count: number;
  unbilled_open_cents: number;
  rows: RevenueLeakageRow[];
};

export async function getRevenueLeakage(
  client: PoolClient,
  operatingCompanyId: string,
  limit = 100,
): Promise<RevenueLeakageSummary> {
  const lim = Math.min(Math.max(limit, 1), 500);

  const counts = await client.query<{
    delivered_like_count: string;
    missing_earn_count: string;
    earn_missing_bill_count: string;
    unbilled_open_cents: string;
  }>(
    `
      WITH delivered AS (
        SELECT l.id, l.rate_total_cents
        FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.status::text = ANY($2::text[])
      ),
      earn AS (
        SELECT p.load_id, p.amount_cents, p.journal_entry_id
        FROM accounting.load_revenue_recognition_postings p
        WHERE p.operating_company_id = $1::uuid
          AND p.event = 'earn'
          AND coalesce(p.is_active, true) = true
          AND p.voided_at IS NULL
      ),
      bill AS (
        SELECT p.load_id
        FROM accounting.load_revenue_recognition_postings p
        WHERE p.operating_company_id = $1::uuid
          AND p.event = 'bill'
          AND coalesce(p.is_active, true) = true
          AND p.voided_at IS NULL
      )
      SELECT
        (SELECT COUNT(*)::text FROM delivered) AS delivered_like_count,
        (SELECT COUNT(*)::text FROM delivered d
          WHERE NOT EXISTS (SELECT 1 FROM earn e WHERE e.load_id = d.id)) AS missing_earn_count,
        (SELECT COUNT(*)::text FROM earn e
          WHERE NOT EXISTS (SELECT 1 FROM bill b WHERE b.load_id = e.load_id)) AS earn_missing_bill_count,
        (SELECT COALESCE(SUM(e.amount_cents), 0)::text FROM earn e
          WHERE NOT EXISTS (SELECT 1 FROM bill b WHERE b.load_id = e.load_id)) AS unbilled_open_cents
    `,
    [operatingCompanyId, DELIVERED_LIKE as unknown as string[]],
  );

  const rowRes = await client.query<{
    load_id: string;
    load_number: string | null;
    status: string;
    rate_total_cents: string;
    customer_id: string | null;
    gap: "missing_earn" | "earn_missing_bill";
    earn_journal_entry_id: string | null;
    earn_amount_cents: string | null;
  }>(
    `
      (
        SELECT
          l.id::text AS load_id,
          l.load_number,
          l.status::text AS status,
          COALESCE(l.rate_total_cents, 0)::text AS rate_total_cents,
          l.customer_id::text AS customer_id,
          'missing_earn'::text AS gap,
          NULL::text AS earn_journal_entry_id,
          NULL::text AS earn_amount_cents
        FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.status::text = ANY($2::text[])
          AND NOT EXISTS (
            SELECT 1
            FROM accounting.load_revenue_recognition_postings p
            WHERE p.load_id = l.id
              AND p.operating_company_id = l.operating_company_id
              AND p.event = 'earn'
              AND coalesce(p.is_active, true) = true
              AND p.voided_at IS NULL
          )
      )
      UNION ALL
      (
        SELECT
          l.id::text AS load_id,
          l.load_number,
          l.status::text AS status,
          COALESCE(l.rate_total_cents, 0)::text AS rate_total_cents,
          l.customer_id::text AS customer_id,
          'earn_missing_bill'::text AS gap,
          e.journal_entry_id::text AS earn_journal_entry_id,
          e.amount_cents::text AS earn_amount_cents
        FROM accounting.load_revenue_recognition_postings e
        JOIN mdata.loads l
          ON l.id = e.load_id
         AND l.operating_company_id = e.operating_company_id
        WHERE e.operating_company_id = $1::uuid
          AND e.event = 'earn'
          AND coalesce(e.is_active, true) = true
          AND e.voided_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM accounting.load_revenue_recognition_postings b
            WHERE b.load_id = e.load_id
              AND b.operating_company_id = e.operating_company_id
              AND b.event = 'bill'
              AND coalesce(b.is_active, true) = true
              AND b.voided_at IS NULL
          )
      )
      ORDER BY gap, load_number NULLS LAST
      LIMIT $3
    `,
    [operatingCompanyId, DELIVERED_LIKE as unknown as string[], lim],
  );

  const c = counts.rows[0];
  return {
    delivered_like_count: Number(c?.delivered_like_count ?? 0),
    missing_earn_count: Number(c?.missing_earn_count ?? 0),
    earn_missing_bill_count: Number(c?.earn_missing_bill_count ?? 0),
    unbilled_open_cents: Number(c?.unbilled_open_cents ?? 0),
    rows: rowRes.rows.map((r) => ({
      load_id: r.load_id,
      load_number: r.load_number,
      status: r.status,
      rate_total_cents: Number(r.rate_total_cents ?? 0),
      customer_id: r.customer_id,
      gap: r.gap,
      earn_journal_entry_id: r.earn_journal_entry_id,
      earn_amount_cents: r.earn_amount_cents != null ? Number(r.earn_amount_cents) : null,
    })),
  };
}
