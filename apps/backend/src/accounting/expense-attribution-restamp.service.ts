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
import { relayFillUnitIdSql } from "../fuel/relay-fill-unit.sql.js";

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

export type RelayFillUnitRestamp =
  | { expense_id: string; outcome: "stamped"; relay_fill_id: string; unit_id: string; lines: number }
  | { expense_id: string; outcome: "refused"; reason: string };

/** The fill + its same-company unit for one unit-less live Relay-fill document (shared by the writer and its dry-run preview). $1 company, $2 expense. */
export const RELAY_FILL_UNIT_LOOKUP_SQL = `SELECT min(r.id::text) AS relay_fill_id, count(DISTINCT r.id)::text AS fills,
              min((${relayFillUnitIdSql("r")})::text) AS unit_id, min(e.unit_id::text) AS before_unit
         FROM accounting.expenses e
         JOIN accounting.journal_entries je ON je.id = e.journal_entry_id AND je.operating_company_id = e.operating_company_id
                                            AND je.status = 'posted' AND je.voided_at IS NULL
         JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id AND p.operating_company_id = e.operating_company_id
                                                 AND p.source_transaction_type = 'fuel_event'
         JOIN integrations.relay_fuel_transactions r ON r.id::text = p.source_transaction_id::text
                                                    AND r.operating_company_id = e.operating_company_id
        WHERE e.operating_company_id = $1::uuid AND e.id = $2::uuid AND e.voided_at IS NULL AND e.unit_id IS NULL`;

/**
 * LEAD 443.192 (ruling 11:40Z) — a Relay fill's expense document that carries no unit takes the unit of its fill by the
 * ONE same-company rule (fuel/relay-fill-unit.sql.ts relayFillUnitIdSql: matched_unit_id, else the printed number when
 * exactly one active unit operated by the fill's company carries it). The fill is found from the document's own evidence:
 * expense.journal_entry_id -> that entry's live fuel_event postings -> source_transaction_id = the fill. Fill-null only
 * (header and lines); refuses — writes nothing — when the document has no single fill or the rule resolves no unit (e.g. a
 * printed unit operated by another company). Moves no money: journal entries, postings, amounts and accounts are never
 * touched. One audit event per stamped expense.
 */
export async function restampRelayFillExpenseUnit(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; expenseIds: string[] }
): Promise<RelayFillUnitRestamp[]> {
  const out: RelayFillUnitRestamp[] = [];
  for (const expenseId of input.expenseIds) {
    const found = await client.query<{ relay_fill_id: string | null; fills: string; unit_id: string | null; before_unit: string | null }>(
      RELAY_FILL_UNIT_LOOKUP_SQL,
      [input.operatingCompanyId, expenseId]
    );
    const f = found.rows[0];
    if (!f || f.fills !== "1" || !f.relay_fill_id) {
      out.push({ expense_id: expenseId, outcome: "refused", reason: `not a unit-less live document of exactly one Relay fill (fills=${f?.fills ?? "0"})` });
      continue;
    }
    if (!f.unit_id) {
      out.push({ expense_id: expenseId, outcome: "refused", reason: `fill ${f.relay_fill_id}: the same-company unit rule resolves no unit` });
      continue;
    }
    const header = await client.query(
      `UPDATE accounting.expenses SET unit_id = $3::uuid, updated_at = now()
        WHERE operating_company_id = $1::uuid AND id = $2::uuid AND voided_at IS NULL AND unit_id IS NULL`,
      [input.operatingCompanyId, expenseId, f.unit_id]
    );
    if ((header.rowCount ?? 0) !== 1) {
      out.push({ expense_id: expenseId, outcome: "refused", reason: "header changed concurrently (no unit-less live row to stamp)" });
      continue;
    }
    const lines = await client.query(
      `UPDATE accounting.expense_lines SET unit_id = $2::uuid WHERE expense_id = $1::uuid AND unit_id IS NULL`,
      [expenseId, f.unit_id]
    );
    const row = { expense_id: expenseId, outcome: "stamped" as const, relay_fill_id: f.relay_fill_id, unit_id: f.unit_id, lines: lines.rowCount ?? 0 };
    out.push(row);
    await appendCrudAudit(
      client,
      input.actorUserId,
      "expense.attribution_restamped_from_relay_fill",
      { ...row, before_unit_id: f.before_unit, after_unit_id: f.unit_id, operating_company_id: input.operatingCompanyId, rule: "relayFillUnitIdSql (same-company operator)", round: "LEAD 443.192" },
      "info",
      "LEAD-443-192"
    );
  }
  return out;
}
