export const INTEGRITY_ALERT_ENGINE_VERSION = "a23-12-v1";

type IntegrityAlertRule = {
  id: string;
  operating_company_id: string;
  rule_code: string;
  rule_name: string;
  source_view: string;
  alert_category: string;
  subject_type: string;
  threshold_config: Record<string, unknown>;
  severity: string;
  enabled: boolean;
};

type RuleMatch = {
  subject_key: string;
  subject_driver_id: string | null;
  subject_unit_id: string | null;
  subject_vendor_id: string | null;
  detection_summary: string;
  detection_metric: Record<string, unknown>;
  source_view: string;
};

type QueryableClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function thresholdNumber(config: Record<string, unknown>, key: string, fallback: number) {
  const raw = config[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
  return fallback;
}

export async function listIntegrityAlertRules(client: QueryableClient, operatingCompanyId: string) {
  const res = await client.query<IntegrityAlertRule>(
    `
      SELECT *
      FROM safety.integrity_alert_rules
      WHERE operating_company_id = $1
      ORDER BY rule_name ASC
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

export async function evaluateIntegrityRulesForTenant(
  client: QueryableClient,
  operatingCompanyId: string
): Promise<{ rules_scanned: number; events_inserted: number; alerts_inserted: number }> {
  const rulesRes = await client.query<IntegrityAlertRule>(
    `
      SELECT *
      FROM safety.integrity_alert_rules
      WHERE operating_company_id = $1
        AND enabled = true
      ORDER BY rule_code ASC
    `,
    [operatingCompanyId]
  );

  let eventsInserted = 0;
  let alertsInserted = 0;

  for (const rule of rulesRes.rows) {
    const matches = await evaluateRuleMatches(client, operatingCompanyId, rule);
    for (const match of matches) {
      const inserted = await upsertEventAndAlert(client, operatingCompanyId, rule, match);
      if (inserted.event) eventsInserted += 1;
      if (inserted.alert) alertsInserted += 1;
    }
  }

  return { rules_scanned: rulesRes.rows.length, events_inserted: eventsInserted, alerts_inserted: alertsInserted };
}

async function evaluateRuleMatches(
  client: QueryableClient,
  operatingCompanyId: string,
  rule: IntegrityAlertRule
): Promise<RuleMatch[]> {
  const config = (rule.threshold_config ?? {}) as Record<string, unknown>;

  if (rule.rule_code === "fuel_anomaly" || rule.source_view === "safety.v_fuel_mpg_anomalies") {
    const minRows = thresholdNumber(config, "min_rows", 1);
    const res = await client.query<Record<string, unknown>>(
      `
        SELECT *
        FROM safety.v_fuel_mpg_anomalies
        WHERE operating_company_id = $1
        LIMIT 200
      `,
      [operatingCompanyId]
    );
    if (res.rows.length < minRows) return [];
    return res.rows.map((row) => ({
      subject_key: `driver:${String(row.driver_id ?? row.fuel_expense_id)}`,
      subject_driver_id: row.driver_id ? String(row.driver_id) : null,
      subject_unit_id: row.unit_id ? String(row.unit_id) : null,
      subject_vendor_id: null,
      detection_summary: `Fuel MPG anomaly (${String(row.anomaly_type ?? "outlier")})`,
      detection_metric: row,
      source_view: rule.source_view,
    }));
  }

  if (rule.rule_code === "gps_spoof_pattern" || rule.source_view === "safety.v_driver_dwell_outliers") {
    const minMinutes = thresholdNumber(config, "min_minutes_over_avg", 120);
    const res = await client.query<Record<string, unknown>>(
      `
        SELECT *
        FROM safety.v_driver_dwell_outliers
        WHERE operating_company_id = $1
          AND minutes_over_avg >= $2
        LIMIT 200
      `,
      [operatingCompanyId, minMinutes]
    );
    return res.rows.map((row) => ({
      subject_key: `driver:${String(row.driver_id)}`,
      subject_driver_id: row.driver_id ? String(row.driver_id) : null,
      subject_unit_id: null,
      subject_vendor_id: null,
      detection_summary: `GPS/dwell outlier (+${String(row.minutes_over_avg)} min over fleet avg)`,
      detection_metric: row,
      source_view: rule.source_view,
    }));
  }

  if (rule.rule_code === "odometer_cost_mismatch" || rule.source_view === "safety.v_wo_cost_outliers") {
    const minZ = thresholdNumber(config, "min_z_score", 2);
    const res = await client.query<Record<string, unknown>>(
      `
        SELECT *
        FROM safety.v_wo_cost_outliers
        WHERE operating_company_id = $1
          AND z_score >= $2
        LIMIT 200
      `,
      [operatingCompanyId, minZ]
    );
    return res.rows.map((row) => ({
      subject_key: `unit:${String(row.unit_id ?? row.wo_id)}`,
      subject_driver_id: null,
      subject_unit_id: row.unit_id ? String(row.unit_id) : null,
      subject_vendor_id: null,
      detection_summary: `WO cost outlier z=${String(row.z_score ?? "—")}`,
      detection_metric: row,
      source_view: rule.source_view,
    }));
  }

  return [];
}

async function upsertEventAndAlert(
  client: QueryableClient,
  operatingCompanyId: string,
  rule: IntegrityAlertRule,
  match: RuleMatch
): Promise<{ event: boolean; alert: boolean }> {
  const eventRes = await client.query<{ id: string; integrity_alert_id: string | null }>(
    `
      INSERT INTO safety.integrity_alert_events (
        operating_company_id,
        rule_id,
        subject_key,
        detection_summary,
        detection_metric,
        event_status,
        detected_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, 'open', now())
      ON CONFLICT (operating_company_id, rule_id, subject_key)
      DO UPDATE SET
        detection_summary = EXCLUDED.detection_summary,
        detection_metric = EXCLUDED.detection_metric,
        detected_at = now(),
        updated_at = now(),
        event_status = CASE
          WHEN safety.integrity_alert_events.event_status IN ('snoozed', 'resolved')
               AND safety.integrity_alert_events.snoozed_until IS NOT NULL
               AND safety.integrity_alert_events.snoozed_until > now()
            THEN safety.integrity_alert_events.event_status
          ELSE 'open'
        END
      RETURNING id, integrity_alert_id
    `,
    [
      operatingCompanyId,
      rule.id,
      match.subject_key,
      match.detection_summary,
      JSON.stringify(match.detection_metric),
    ]
  );

  const eventRow = eventRes.rows[0];
  if (!eventRow) return { event: false, alert: false };

  if (eventRow.integrity_alert_id) {
    return { event: eventRes.rowCount === 1, alert: false };
  }

  const alertRes = await client.query<{ id: string }>(
    `
      INSERT INTO safety.integrity_alerts (
        operating_company_id,
        alert_category,
        severity,
        subject_type,
        subject_driver_id,
        subject_unit_id,
        subject_vendor_id,
        detection_summary,
        detection_metric,
        source_view,
        rule_id,
        event_id,
        created_by_user_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, NULL
      )
      RETURNING id
    `,
    [
      operatingCompanyId,
      rule.alert_category,
      rule.severity,
      rule.subject_type,
      match.subject_driver_id,
      match.subject_unit_id,
      match.subject_vendor_id,
      match.detection_summary,
      JSON.stringify(match.detection_metric),
      match.source_view,
      rule.id,
      eventRow.id,
    ]
  );

  const alertId = alertRes.rows[0]?.id;
  if (alertId) {
    await client.query(
      `
        UPDATE safety.integrity_alert_events
        SET integrity_alert_id = $2,
            updated_at = now()
        WHERE id = $1
      `,
      [eventRow.id, alertId]
    );
  }

  return { event: true, alert: Boolean(alertId) };
}

export async function runIntegrityAlertEngineForTenant(client: QueryableClient, operatingCompanyId: string) {
  return evaluateIntegrityRulesForTenant(client, operatingCompanyId);
}
