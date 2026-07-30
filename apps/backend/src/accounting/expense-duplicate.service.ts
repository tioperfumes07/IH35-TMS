/**
 * ACCT-R-17 — duplicate expense detection (READ-ONLY list + fingerprint helper).
 *
 * Fingerprint (QBO-like): same operating company + vendor + transaction_date + total_amount_cents.
 * Does not void/auto-merge — surfaces candidates for accountant review. No GL math.
 */
import type { PoolClient } from "pg";

export type ExpenseDuplicateMember = {
  id: string;
  expense_number: string | null;
  vendor_uuid: string;
  vendor_name: string | null;
  transaction_date: string;
  total_amount_cents: number;
  status: string;
  journal_entry_id: string | null;
};

export type ExpenseDuplicateGroup = {
  vendor_uuid: string;
  vendor_name: string | null;
  transaction_date: string;
  total_amount_cents: number;
  count: number;
  members: ExpenseDuplicateMember[];
};

export type ExpenseDuplicateSummary = {
  group_count: number;
  expense_count: number;
  groups: ExpenseDuplicateGroup[];
};

export async function listExpenseDuplicateGroups(
  client: PoolClient,
  operatingCompanyId: string,
  limit = 50,
): Promise<ExpenseDuplicateSummary> {
  const lim = Math.min(Math.max(limit, 1), 200);

  const groupsRes = await client.query<{
    vendor_uuid: string;
    vendor_name: string | null;
    transaction_date: string;
    total_amount_cents: string;
    count: string;
  }>(
    `
      SELECT
        e.vendor_uuid::text AS vendor_uuid,
        v.vendor_name,
        e.transaction_date::text AS transaction_date,
        e.total_amount_cents::text AS total_amount_cents,
        COUNT(*)::text AS count
      FROM accounting.expenses e
      LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid
      WHERE e.operating_company_id = $1::uuid
        AND e.voided_at IS NULL
        AND e.deleted_at IS NULL
        AND coalesce(e.is_active, true) = true
        AND e.vendor_uuid IS NOT NULL
      GROUP BY e.vendor_uuid, v.vendor_name, e.transaction_date, e.total_amount_cents
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, e.transaction_date DESC
      LIMIT $2
    `,
    [operatingCompanyId, lim],
  );

  const countRes = await client.query<{ group_count: string; expense_count: string }>(
    `
      SELECT
        COUNT(*)::text AS group_count,
        COALESCE(SUM(n), 0)::text AS expense_count
      FROM (
        SELECT COUNT(*)::int AS n
        FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NULL
          AND e.deleted_at IS NULL
          AND coalesce(e.is_active, true) = true
          AND e.vendor_uuid IS NOT NULL
        GROUP BY e.vendor_uuid, e.transaction_date, e.total_amount_cents
        HAVING COUNT(*) > 1
      ) d
    `,
    [operatingCompanyId],
  );

  const groups: ExpenseDuplicateGroup[] = [];
  for (const g of groupsRes.rows) {
    const mem = await client.query<{
      id: string;
      expense_number: string | null;
      vendor_uuid: string;
      vendor_name: string | null;
      transaction_date: string;
      total_amount_cents: string;
      status: string;
      journal_entry_id: string | null;
    }>(
      `
        SELECT
          e.id::text AS id,
          e.expense_number,
          e.vendor_uuid::text AS vendor_uuid,
          v.vendor_name,
          e.transaction_date::text AS transaction_date,
          e.total_amount_cents::text AS total_amount_cents,
          e.status::text AS status,
          e.journal_entry_id::text AS journal_entry_id
        FROM accounting.expenses e
        LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid
        WHERE e.operating_company_id = $1::uuid
          AND e.vendor_uuid = $2::uuid
          AND e.transaction_date = $3::date
          AND e.total_amount_cents = $4::bigint
          AND e.voided_at IS NULL
          AND e.deleted_at IS NULL
          AND coalesce(e.is_active, true) = true
        ORDER BY e.created_at ASC
        LIMIT 25
      `,
      [operatingCompanyId, g.vendor_uuid, g.transaction_date, Number(g.total_amount_cents)],
    );

    groups.push({
      vendor_uuid: g.vendor_uuid,
      vendor_name: g.vendor_name,
      transaction_date: g.transaction_date,
      total_amount_cents: Number(g.total_amount_cents),
      count: Number(g.count),
      members: mem.rows.map((m) => ({
        id: m.id,
        expense_number: m.expense_number,
        vendor_uuid: m.vendor_uuid,
        vendor_name: m.vendor_name,
        transaction_date: m.transaction_date,
        total_amount_cents: Number(m.total_amount_cents),
        status: m.status,
        journal_entry_id: m.journal_entry_id,
      })),
    });
  }

  return {
    group_count: Number(countRes.rows[0]?.group_count ?? 0),
    expense_count: Number(countRes.rows[0]?.expense_count ?? 0),
    groups,
  };
}

/** Count prior matches for create soft-warn (same fingerprint, excluding optional id). */
export async function countExpenseFingerprintMatches(
  client: PoolClient,
  input: {
    operating_company_id: string;
    vendor_uuid: string;
    transaction_date: string;
    total_amount_cents: number;
    exclude_id?: string;
  },
): Promise<number> {
  const res = await client.query<{ n: string }>(
    `
      SELECT COUNT(*)::text AS n
      FROM accounting.expenses e
      WHERE e.operating_company_id = $1::uuid
        AND e.vendor_uuid = $2::uuid
        AND e.transaction_date = $3::date
        AND e.total_amount_cents = $4::bigint
        AND e.voided_at IS NULL
        AND e.deleted_at IS NULL
        AND coalesce(e.is_active, true) = true
        AND ($5::uuid IS NULL OR e.id <> $5::uuid)
    `,
    [
      input.operating_company_id,
      input.vendor_uuid,
      input.transaction_date,
      input.total_amount_cents,
      input.exclude_id ?? null,
    ],
  );
  return Number(res.rows[0]?.n ?? 0);
}
