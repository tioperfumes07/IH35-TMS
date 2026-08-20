import { withCurrentUser } from "../auth/db.js";

export type MaintenanceShopHubRow = {
  kind: "bill" | "expense";
  financial_id: string;
  financial_label: string | null;
  txn_date: string | null;
  amount_cents: number;
  status: string | null;
  work_order_id: string;
  work_order_display_id: string | null;
  unit_id: string | null;
  unit_code: string | null;
};

export type ListMaintenanceShopHubOptions = {
  workOrderId?: string;
  limit: number;
  offset: number;
};

type HubRowRecord = {
  kind: "bill" | "expense";
  financial_id: string;
  financial_label: string | null;
  txn_date: string | null;
  amount_cents: string | number | null;
  status: string | null;
  work_order_id: string;
  work_order_display_id: string | null;
  unit_id: string | null;
  unit_code: string | null;
};

async function columnExists(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rowCount?: number }> },
  schema: string,
  table: string,
  column: string
): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`,
    [schema, table, column]
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Accounting Maintenance & shop hub — read-only rollup of WO↔bill/expense HARD links
 * (linked_work_order_uuid). Powers the /accounting/maintenance-shop leaf under Accounting sub-nav;
 * reverse drill-through for Law §9 (WO detail is the forward half).
 */
export async function listMaintenanceShopHub(
  userId: string,
  operatingCompanyId: string,
  options: ListMaintenanceShopHubOptions
): Promise<{ total: number; items: MaintenanceShopHubRow[] }> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

    const hasBillLink = await columnExists(client, "accounting", "bills", "linked_work_order_uuid");
    const hasExpenseLink = await columnExists(client, "accounting", "expenses", "linked_work_order_uuid");
    if (!hasBillLink && !hasExpenseLink) {
      return { total: 0, items: [] };
    }

    const parts: string[] = [];
    const values: unknown[] = [operatingCompanyId];
    let woFilter = "";

    if (options.workOrderId) {
      values.push(options.workOrderId);
      woFilter = ` AND wo.id = $${values.length}::uuid`;
    }

    if (hasBillLink) {
      parts.push(`
        SELECT
          'bill'::text AS kind,
          b.id::text AS financial_id,
          b.bill_number AS financial_label,
          b.bill_date::text AS txn_date,
          COALESCE(b.amount_cents, 0)::bigint AS amount_cents,
          b.status,
          wo.id::text AS work_order_id,
          wo.display_id AS work_order_display_id,
          wo.unit_id::text AS unit_id,
          u.unit_number AS unit_code
        FROM accounting.bills b
        INNER JOIN maintenance.work_orders wo
          ON wo.id = b.linked_work_order_uuid
         AND wo.operating_company_id = b.operating_company_id
        LEFT JOIN mdata.units u ON u.id = wo.unit_id AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = wo.operating_company_id
        WHERE b.operating_company_id = $1::uuid
          AND b.linked_work_order_uuid IS NOT NULL
          AND b.revoked_at IS NULL
          ${woFilter}
      `);
    }

    if (hasExpenseLink) {
      parts.push(`
        SELECT
          'expense'::text AS kind,
          e.id::text AS financial_id,
          e.expense_number AS financial_label,
          e.transaction_date::text AS txn_date,
          COALESCE(e.total_amount_cents, 0)::bigint AS amount_cents,
          e.status,
          wo.id::text AS work_order_id,
          wo.display_id AS work_order_display_id,
          wo.unit_id::text AS unit_id,
          u.unit_number AS unit_code
        FROM accounting.expenses e
        INNER JOIN maintenance.work_orders wo
          ON wo.id = e.linked_work_order_uuid
         AND wo.operating_company_id = e.operating_company_id
        LEFT JOIN mdata.units u ON u.id = wo.unit_id AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = wo.operating_company_id
        WHERE e.operating_company_id = $1::uuid
          AND e.linked_work_order_uuid IS NOT NULL
          AND lower(coalesce(e.status, '')) <> 'void'
          ${woFilter}
      `);
    }

    const unionSql = parts.join("\nUNION ALL\n");

    const countRes = await client.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total FROM (${unionSql}) hub`,
      values
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    values.push(options.limit, options.offset);
    const res = await client.query<HubRowRecord>(
      `
        SELECT *
        FROM (${unionSql}) hub
        ORDER BY txn_date DESC NULLS LAST, financial_id DESC
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    );

    const items: MaintenanceShopHubRow[] = res.rows.map((row) => ({
      kind: row.kind,
      financial_id: row.financial_id,
      financial_label: row.financial_label,
      txn_date: row.txn_date,
      amount_cents: Number(row.amount_cents ?? 0),
      status: row.status,
      work_order_id: row.work_order_id,
      work_order_display_id: row.work_order_display_id,
      unit_id: row.unit_id,
      unit_code: row.unit_code,
    }));

    return { total, items };
  });
}
