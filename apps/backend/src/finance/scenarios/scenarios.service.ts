/**
 * LV-FINANCE-PLANNING-PLACEHOLDER-ROUTES — finance forecast/scenario planning engine.
 *
 * Writes ONLY to finance.forecast_scenarios / finance.forecast_lines (its own tables, migration
 * 202612600000). NO GL posting — no accounting.* writes, no journal entries, no invented GL math.
 * A scenario is versioned (draft/active/superseded), never deleted: activating a new scenario
 * supersedes the company's current active one atomically in the same transaction.
 */
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export const lineTemplateSchema = z.object({
  category_kind: z.enum(["revenue", "expense"]),
  category_label: z.string().trim().min(1).max(120),
  assumption_note: z.string().trim().min(1).max(1000),
  monthly_estimate_cents: z.number().int(),
  gl_account_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
});
export type LineTemplateInput = z.infer<typeof lineTemplateSchema>;

export const createScenarioInputSchema = z.object({
  operating_company_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  period_basis: z.enum(["monthly", "quarterly"]),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_count: z.number().int().min(1).max(60),
  notes: z.string().trim().max(2000).nullable().optional(),
  line_templates: z.array(lineTemplateSchema).min(1).max(50),
});
export type CreateScenarioInput = z.infer<typeof createScenarioInputSchema>;

export const recordActualInputSchema = z.object({
  operating_company_id: z.string().uuid(),
  actual_amount_cents: z.number().int(),
});
export type RecordActualInput = z.infer<typeof recordActualInputSchema>;

export type ScenarioRecord = {
  id: string;
  name: string;
  period_basis: "monthly" | "quarterly";
  period_start: string;
  period_count: number;
  notes: string | null;
  status: "draft" | "active" | "superseded";
  superseded_by_scenario_id: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ForecastLineRecord = {
  id: string;
  scenario_id: string;
  period_index: number;
  period_label: string;
  category_kind: "revenue" | "expense";
  category_label: string;
  gl_account_id: string | null;
  customer_id: string | null;
  vendor_id: string | null;
  // Human labels for the linkage column — resolved by an entity-scoped join in getScenarioDetail(),
  // never derived from the id. Null when the row has no linkage on that field, or the joined record
  // could not be resolved in this company (FAIL-CP1 — EntityLink must never fall back to a raw uuid).
  customer_name: string | null;
  vendor_name: string | null;
  account_name: string | null;
  assumption_note: string;
  estimate_amount_cents: number;
  actual_amount_cents: number | null;
  actual_source: "manual" | "gl_actual" | null;
  actual_recorded_at: string | null;
};

/** period_index is 0-based; label is computed once at creation time and stored (never recomputed). */
export function periodLabel(basis: "monthly" | "quarterly", periodStart: string, periodIndex: number): string {
  const [y, m] = periodStart.split("-").map(Number);
  if (basis === "monthly") {
    const totalMonths = (m - 1) + periodIndex;
    const year = y + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  // quarterly: periodIndex counts QUARTERS from the quarter containing period_start.
  const startQuarterIndex = Math.floor((m - 1) / 3);
  const totalQuarters = startQuarterIndex + periodIndex;
  const year = y + Math.floor(totalQuarters / 4);
  const quarter = (totalQuarters % 4) + 1;
  return `Q${quarter} ${year}`;
}

function mapScenarioRow(row: Record<string, unknown>): ScenarioRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    period_basis: row.period_basis as "monthly" | "quarterly",
    period_start: String(row.period_start).slice(0, 10),
    period_count: Number(row.period_count),
    notes: row.notes == null ? null : String(row.notes),
    status: row.status as ScenarioRecord["status"],
    superseded_by_scenario_id: row.superseded_by_scenario_id == null ? null : String(row.superseded_by_scenario_id),
    superseded_at: row.superseded_at == null ? null : new Date(String(row.superseded_at)).toISOString(),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapLineRow(row: Record<string, unknown>): ForecastLineRecord {
  return {
    id: String(row.id),
    scenario_id: String(row.scenario_id),
    period_index: Number(row.period_index),
    period_label: String(row.period_label),
    category_kind: row.category_kind as "revenue" | "expense",
    category_label: String(row.category_label),
    gl_account_id: row.gl_account_id == null ? null : String(row.gl_account_id),
    customer_id: row.customer_id == null ? null : String(row.customer_id),
    vendor_id: row.vendor_id == null ? null : String(row.vendor_id),
    customer_name: row.customer_name == null ? null : String(row.customer_name),
    vendor_name: row.vendor_name == null ? null : String(row.vendor_name),
    account_name: row.account_name == null ? null : String(row.account_name),
    assumption_note: String(row.assumption_note),
    estimate_amount_cents: Number(row.estimate_amount_cents),
    actual_amount_cents: row.actual_amount_cents == null ? null : Number(row.actual_amount_cents),
    actual_source: row.actual_source == null ? null : (row.actual_source as "manual" | "gl_actual"),
    actual_recorded_at: row.actual_recorded_at == null ? null : new Date(String(row.actual_recorded_at)).toISOString(),
  };
}

export async function createScenario(
  client: DbClient,
  actorUserId: string,
  input: CreateScenarioInput
): Promise<{ scenario: ScenarioRecord; lines: ForecastLineRecord[] }> {
  const ins = await client.query<Record<string, unknown>>(
    `
      INSERT INTO finance.forecast_scenarios (
        operating_company_id, name, period_basis, period_start, period_count, notes,
        created_by_user_id, updated_by_user_id
      ) VALUES ($1::uuid,$2,$3,$4::date,$5,$6,$7::uuid,$7::uuid)
      RETURNING *
    `,
    [
      input.operating_company_id, input.name, input.period_basis, input.period_start,
      input.period_count, input.notes ?? null, actorUserId,
    ]
  );
  const scenarioRow = ins.rows[0];
  if (!scenarioRow) throw new Error("scenario_create_failed");
  const scenario = mapScenarioRow(scenarioRow);

  const lines: ForecastLineRecord[] = [];
  for (const template of input.line_templates) {
    for (let periodIndex = 0; periodIndex < input.period_count; periodIndex += 1) {
      const label = periodLabel(input.period_basis, input.period_start, periodIndex);
      const lineIns = await client.query<Record<string, unknown>>(
        `
          INSERT INTO finance.forecast_lines (
            operating_company_id, scenario_id, period_index, period_label, category_kind,
            category_label, gl_account_id, customer_id, vendor_id, assumption_note,
            estimate_amount_cents, created_by_user_id, updated_by_user_id
          ) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::uuid,$8::uuid,$9::uuid,$10,$11,$12::uuid,$12::uuid)
          RETURNING *
        `,
        [
          input.operating_company_id, scenario.id, periodIndex, label, template.category_kind,
          template.category_label, template.gl_account_id ?? null, template.customer_id ?? null,
          template.vendor_id ?? null, template.assumption_note, template.monthly_estimate_cents,
          actorUserId,
        ]
      );
      const lineRow = lineIns.rows[0];
      if (lineRow) lines.push(mapLineRow(lineRow));
    }
  }

  await appendCrudAudit(client, actorUserId, "finance.forecast_scenario.created", {
    scenario_id: scenario.id,
    operating_company_id: input.operating_company_id,
    name: scenario.name,
    period_basis: scenario.period_basis,
    period_count: scenario.period_count,
    line_count: lines.length,
  });

  return { scenario, lines };
}

export async function listScenarios(client: DbClient, operatingCompanyId: string): Promise<ScenarioRecord[]> {
  const res = await client.query<Record<string, unknown>>(
    `SELECT * FROM finance.forecast_scenarios WHERE operating_company_id = $1::uuid ORDER BY created_at DESC`,
    [operatingCompanyId]
  );
  return res.rows.map(mapScenarioRow);
}

export async function getScenarioDetail(
  client: DbClient,
  operatingCompanyId: string,
  scenarioId: string
): Promise<{ scenario: ScenarioRecord; lines: ForecastLineRecord[] } | null> {
  const scenarioRes = await client.query<Record<string, unknown>>(
    `SELECT * FROM finance.forecast_scenarios WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [scenarioId, operatingCompanyId]
  );
  const scenarioRow = scenarioRes.rows[0];
  if (!scenarioRow) return null;
  const linesRes = await client.query<Record<string, unknown>>(
    `
      SELECT fl.*, c.customer_name, v.vendor_name, a.account_name
      FROM finance.forecast_lines fl
      LEFT JOIN mdata.customers c
        ON c.id = fl.customer_id AND c.operating_company_id = fl.operating_company_id
      LEFT JOIN mdata.vendors v
        ON v.id = fl.vendor_id AND v.operating_company_id = fl.operating_company_id
      LEFT JOIN catalogs.accounts a
        ON a.id = fl.gl_account_id AND a.operating_company_id = fl.operating_company_id
      WHERE fl.scenario_id = $1::uuid AND fl.operating_company_id = $2::uuid
      ORDER BY fl.period_index ASC, fl.category_kind ASC, fl.category_label ASC
    `,
    [scenarioId, operatingCompanyId]
  );
  return { scenario: mapScenarioRow(scenarioRow), lines: linesRes.rows.map(mapLineRow) };
}

/** Supersede the company's current active scenario (if any) and activate this one — atomic. */
export async function activateScenario(
  client: DbClient,
  actorUserId: string,
  operatingCompanyId: string,
  scenarioId: string
): Promise<ScenarioRecord> {
  const target = await client.query<Record<string, unknown>>(
    `SELECT * FROM finance.forecast_scenarios WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [scenarioId, operatingCompanyId]
  );
  if (!target.rows[0]) throw new Error("scenario_not_found");
  if (target.rows[0].status === "superseded") throw new Error("scenario_already_superseded");

  const currentActive = await client.query<{ id: string }>(
    `SELECT id FROM finance.forecast_scenarios WHERE operating_company_id = $1::uuid AND status = 'active' AND id <> $2::uuid`,
    [operatingCompanyId, scenarioId]
  );
  if (currentActive.rows[0]) {
    await client.query(
      `UPDATE finance.forecast_scenarios
       SET status = 'superseded', superseded_by_scenario_id = $2::uuid, superseded_at = now(),
           updated_at = now(), updated_by_user_id = $3::uuid
       WHERE id = $1::uuid`,
      [currentActive.rows[0].id, scenarioId, actorUserId]
    );
    await appendCrudAudit(client, actorUserId, "finance.forecast_scenario.superseded", {
      scenario_id: currentActive.rows[0].id,
      operating_company_id: operatingCompanyId,
      superseded_by_scenario_id: scenarioId,
    });
  }

  const res = await client.query<Record<string, unknown>>(
    `UPDATE finance.forecast_scenarios SET status = 'active', updated_at = now(), updated_by_user_id = $2::uuid
     WHERE id = $1::uuid RETURNING *`,
    [scenarioId, actorUserId]
  );
  const row = res.rows[0];
  if (!row) throw new Error("scenario_activate_failed");

  await appendCrudAudit(client, actorUserId, "finance.forecast_scenario.activated", {
    scenario_id: scenarioId,
    operating_company_id: operatingCompanyId,
  });

  return mapScenarioRow(row);
}

/** Record (or correct) the actual amount for a single line. Manual entry only — no GL rollup. */
export async function recordLineActual(
  client: DbClient,
  actorUserId: string,
  operatingCompanyId: string,
  lineId: string,
  actualAmountCents: number
): Promise<ForecastLineRecord> {
  const res = await client.query<Record<string, unknown>>(
    `
      UPDATE finance.forecast_lines
      SET actual_amount_cents = $3, actual_source = 'manual', actual_recorded_at = now(),
          actual_recorded_by_user_id = $4::uuid, updated_at = now(), updated_by_user_id = $4::uuid
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      RETURNING *
    `,
    [lineId, operatingCompanyId, actualAmountCents, actorUserId]
  );
  const row = res.rows[0];
  if (!row) throw new Error("forecast_line_not_found");

  await appendCrudAudit(client, actorUserId, "finance.forecast_line.actual_recorded", {
    line_id: lineId,
    operating_company_id: operatingCompanyId,
    actual_amount_cents: actualAmountCents,
  });

  return mapLineRow(row);
}

export type ScenarioSummary = {
  scenario: ScenarioRecord;
  totals: {
    estimate_revenue_cents: number;
    estimate_expense_cents: number;
    estimate_net_cents: number;
    actual_revenue_cents: number;
    actual_expense_cents: number;
    actual_net_cents: number;
    has_any_actuals: boolean;
  };
};

/** The company's currently ACTIVE scenario, rolled up for the Overview KPI tiles. Null if none active. */
export async function getActiveScenarioSummary(client: DbClient, operatingCompanyId: string): Promise<ScenarioSummary | null> {
  const detail = await client.query<Record<string, unknown>>(
    `SELECT * FROM finance.forecast_scenarios WHERE operating_company_id = $1::uuid AND status = 'active'`,
    [operatingCompanyId]
  );
  const scenarioRow = detail.rows[0];
  if (!scenarioRow) return null;
  const scenario = mapScenarioRow(scenarioRow);

  const totalsRes = await client.query<Record<string, unknown>>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN category_kind = 'revenue' THEN estimate_amount_cents ELSE 0 END), 0)::bigint AS estimate_revenue_cents,
        COALESCE(SUM(CASE WHEN category_kind = 'expense' THEN estimate_amount_cents ELSE 0 END), 0)::bigint AS estimate_expense_cents,
        COALESCE(SUM(CASE WHEN category_kind = 'revenue' THEN actual_amount_cents ELSE 0 END), 0)::bigint AS actual_revenue_cents,
        COALESCE(SUM(CASE WHEN category_kind = 'expense' THEN actual_amount_cents ELSE 0 END), 0)::bigint AS actual_expense_cents,
        bool_or(actual_amount_cents IS NOT NULL) AS has_any_actuals
      FROM finance.forecast_lines
      WHERE scenario_id = $1::uuid AND operating_company_id = $2::uuid
    `,
    [scenario.id, operatingCompanyId]
  );
  const t = totalsRes.rows[0] ?? {};
  const estimateRevenue = Number(t.estimate_revenue_cents ?? 0);
  const estimateExpense = Number(t.estimate_expense_cents ?? 0);
  const actualRevenue = Number(t.actual_revenue_cents ?? 0);
  const actualExpense = Number(t.actual_expense_cents ?? 0);

  return {
    scenario,
    totals: {
      estimate_revenue_cents: estimateRevenue,
      estimate_expense_cents: estimateExpense,
      estimate_net_cents: estimateRevenue - estimateExpense,
      actual_revenue_cents: actualRevenue,
      actual_expense_cents: actualExpense,
      actual_net_cents: actualRevenue - actualExpense,
      has_any_actuals: Boolean(t.has_any_actuals),
    },
  };
}
