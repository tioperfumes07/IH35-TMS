/**
 * LEAD 443.186 re-stamp — an expense that names its load but not the load's driver / unit takes them from that load
 * (evidence already on the row: its load_id), header first, then every line on that load from the header — the same
 * values every writer now stamps (insertExpenseLine completes a line from its header). Fill-null only: a driver or unit
 * already on the row is never changed. Same company only (the driver must be the load company's driver; the unit is the
 * one unit rule, sameEntityLoadUnitSql). Moves no money: amounts, accounts and postings are not touched. One audit
 * event per expense.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { sameEntityLoadUnitSql } from "./load-unit.sql.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export type ExpenseAttributionRestamp = { expense_id: string; load_id: string; driver_id: string | null; unit_id: string | null; lines: number };

const LOAD_DRIVER_SQL = `(SELECT d.id FROM mdata.loads l JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id AND d.operating_company_id = l.operating_company_id
                           WHERE l.id = e.load_id AND l.operating_company_id = e.operating_company_id)`;

export async function restampExpenseAttributionFromLoad(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; expenseIds: string[] }
): Promise<ExpenseAttributionRestamp[]> {
  if (!input.expenseIds.length) return [];
  const headers = await client.query<{ expense_id: string; load_id: string; driver_id: string | null; unit_id: string | null }>(
    `UPDATE accounting.expenses e
        SET driver_uuid = COALESCE(e.driver_uuid, ${LOAD_DRIVER_SQL}),
            unit_id = COALESCE(e.unit_id, ${sameEntityLoadUnitSql("e.load_id", "e.operating_company_id")}),
            updated_at = now()
      WHERE e.operating_company_id = $1::uuid
        AND e.id = ANY($2::uuid[])
        AND e.voided_at IS NULL
        AND e.load_id IS NOT NULL
        AND ((e.driver_uuid IS NULL AND ${LOAD_DRIVER_SQL} IS NOT NULL)
          OR (e.unit_id IS NULL AND ${sameEntityLoadUnitSql("e.load_id", "e.operating_company_id")} IS NOT NULL))
      RETURNING e.id::text AS expense_id, e.load_id::text AS load_id, e.driver_uuid::text AS driver_id, e.unit_id::text AS unit_id`,
    [input.operatingCompanyId, input.expenseIds]
  );
  const out: ExpenseAttributionRestamp[] = [];
  for (const h of headers.rows) {
    const lines = await client.query(
      `UPDATE accounting.expense_lines el
          SET driver_id = COALESCE(el.driver_id, $2::uuid),
              unit_id = COALESCE(el.unit_id, $3::uuid)
        WHERE el.expense_id = $1::uuid
          AND el.load_id IS NOT DISTINCT FROM $4::uuid
          AND ((el.driver_id IS NULL AND $2::uuid IS NOT NULL) OR (el.unit_id IS NULL AND $3::uuid IS NOT NULL))`,
      [h.expense_id, h.driver_id, h.unit_id, h.load_id]
    );
    const row = { ...h, lines: lines.rowCount ?? 0 };
    out.push(row);
    await appendCrudAudit(
      client,
      input.actorUserId,
      "expense.attribution_restamped_from_load",
      { ...row, operating_company_id: input.operatingCompanyId, rule: "load primary driver (same company) + sameEntityLoadUnitSql", round: "LEAD 443.186" },
      "info",
      "LEAD-443-186"
    );
  }
  return out;
}
