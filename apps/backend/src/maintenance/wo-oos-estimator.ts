/** Default daily revenue loss per truck when OOS (cents). Override via WO_OOS_DAILY_LOSS_CENTS env. */
export const DEFAULT_DAILY_LOSS_CENTS = 50_000;

export type WoOosDowntimeEstimate = {
  work_order_id: string;
  unit_id: string | null;
  severity: string | null;
  days_oos: number;
  daily_loss_cents: number;
  downtime_cost_cents: number;
  repair_estimate_cents: number | null;
  combined_cost_cents: number;
};

export function resolveDailyLossCents(envValue?: string) {
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  return DEFAULT_DAILY_LOSS_CENTS;
}

export function computeDowntimeCostCents(daysOos: number, dailyLossCents = DEFAULT_DAILY_LOSS_CENTS) {
  const days = Math.max(0, Number(daysOos) || 0);
  return Math.round(days * dailyLossCents);
}

export function isOosSevereSeverity(severity: string | null | undefined) {
  const normalized = String(severity ?? "").trim().toLowerCase();
  return normalized === "out_of_service" || normalized === "oos-severe" || normalized === "oos_severe";
}

export function buildWoOosDowntimeEstimate(input: {
  work_order_id: string;
  unit_id: string | null;
  severity: string | null;
  days_oos: number;
  repair_estimate_cents?: number | null;
  daily_loss_cents?: number;
}): WoOosDowntimeEstimate | null {
  if (!isOosSevereSeverity(input.severity)) return null;
  const dailyLossCents = input.daily_loss_cents ?? DEFAULT_DAILY_LOSS_CENTS;
  const downtimeCostCents = computeDowntimeCostCents(input.days_oos, dailyLossCents);
  const repairEstimateCents =
    input.repair_estimate_cents != null && Number.isFinite(Number(input.repair_estimate_cents))
      ? Math.round(Number(input.repair_estimate_cents))
      : null;
  return {
    work_order_id: input.work_order_id,
    unit_id: input.unit_id,
    severity: input.severity,
    days_oos: Math.max(0, Number(input.days_oos) || 0),
    daily_loss_cents: dailyLossCents,
    downtime_cost_cents: downtimeCostCents,
    repair_estimate_cents: repairEstimateCents,
    combined_cost_cents: downtimeCostCents + (repairEstimateCents ?? 0),
  };
}

export async function loadWoOosDowntimeEstimate(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  workOrderId: string,
  operatingCompanyId: string
): Promise<WoOosDowntimeEstimate | null> {
  const woRes = await client.query(
    `SELECT id, unit_id, severity, opened_at FROM maintenance.work_orders WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [workOrderId, operatingCompanyId]
  );
  const wo = woRes.rows[0];
  if (!wo) return null;

  const severity = wo.severity != null ? String(wo.severity) : null;
  if (!isOosSevereSeverity(severity)) return null;

  let daysOos = 0;
  if (wo.unit_id) {
    const unitRes = await client.query(`SELECT oos_since::text FROM mdata.units WHERE id = $1::uuid LIMIT 1`, [wo.unit_id]);
    const oosSince = unitRes.rows[0]?.oos_since ? new Date(String(unitRes.rows[0].oos_since)) : null;
    if (oosSince && !Number.isNaN(oosSince.getTime())) {
      daysOos = Math.max(0, (Date.now() - oosSince.getTime()) / 86_400_000);
    } else if (wo.opened_at) {
      const opened = new Date(String(wo.opened_at));
      if (!Number.isNaN(opened.getTime())) daysOos = Math.max(0, (Date.now() - opened.getTime()) / 86_400_000);
    }
  }

  const estRes = await client.query(
    `SELECT estimated_total_cents FROM maintenance.severe_repair_estimates WHERE trigger_wo_id = $1::uuid LIMIT 1`,
    [workOrderId]
  );
  const repairEstimateCents = estRes.rows[0]?.estimated_total_cents != null ? Number(estRes.rows[0].estimated_total_cents) : null;

  return buildWoOosDowntimeEstimate({
    work_order_id: workOrderId,
    unit_id: wo.unit_id != null ? String(wo.unit_id) : null,
    severity,
    days_oos: daysOos,
    repair_estimate_cents: repairEstimateCents,
    daily_loss_cents: resolveDailyLossCents(process.env.WO_OOS_DAILY_LOSS_CENTS),
  });
}
