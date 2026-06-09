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

  // ── Accounting probe: unbalanced journal entries ────────────────────────────
  if (rule.rule_code === "unbalanced_journal_entry") {
    const lookbackDays = thresholdNumber(config, "lookback_days", 90);
    const res = await client.query<Record<string, unknown>>(
      `
        SELECT
          je.id::text AS journal_entry_id,
          je.entry_date::text AS entry_date,
          je.memo,
          SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END) AS debit_total,
          SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END) AS credit_total
        FROM accounting.journal_entries je
        JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
        WHERE je.operating_company_id = $1
          AND je.status = 'posted'
          AND je.created_at > now() - ($2 || ' days')::interval
        GROUP BY je.id, je.entry_date, je.memo
        HAVING
          SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END) <>
          SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END)
        ORDER BY je.entry_date DESC
        LIMIT 50
      `,
      [operatingCompanyId, lookbackDays]
    );
    return res.rows.map((row) => ({
      subject_key: `je:${String(row.journal_entry_id)}`,
      subject_driver_id: null,
      subject_unit_id: null,
      subject_vendor_id: null,
      detection_summary: `Unbalanced JE ${String(row.entry_date)}: DR ${String(row.debit_total)} vs CR ${String(row.credit_total)}`,
      detection_metric: row,
      source_view: rule.source_view,
    }));
  }

  // ── Accounting probe: orphan bill — no GL account assigned ─────────────────
  if (rule.rule_code === "orphan_bill_no_gl") {
    const lookbackDays = thresholdNumber(config, "lookback_days", 90);
    const res = await client.query<Record<string, unknown>>(
      `
        SELECT
          b.id::text AS bill_id,
          b.vendor_id,
          b.bill_date::text AS bill_date,
          b.amount_cents,
          b.status
        FROM accounting.bills b
        WHERE b.operating_company_id = $1
          AND b.revoked_at IS NULL
          AND b.coa_account_id IS NULL
          AND b.created_at > now() - ($2 || ' days')::interval
        ORDER BY b.created_at DESC
        LIMIT 50
      `,
      [operatingCompanyId, lookbackDays]
    );
    return res.rows.map((row) => ({
      subject_key: `bill:${String(row.bill_id)}`,
      subject_driver_id: null,
      subject_unit_id: null,
      subject_vendor_id: row.vendor_id ? String(row.vendor_id) : null,
      detection_summary: `Bill ${String(row.bill_date)} has no GL account (coa_account_id IS NULL)`,
      detection_metric: row,
      source_view: rule.source_view,
    }));
  }

  // ── Accounting probe: orphan customer payment — unapplied > 7 days ─────────
  if (rule.rule_code === "orphan_payment_unapplied") {
    const staleDays = thresholdNumber(config, "stale_days", 7);
    const res = await client.query<Record<string, unknown>>(
      `
        SELECT
          p.id::text AS payment_id,
          p.payment_date::text AS payment_date,
          p.amount_cents,
          p.amount_unapplied_cents
        FROM accounting.payments p
        WHERE p.operating_company_id = $1
          AND p.voided_at IS NULL
          AND p.amount_unapplied_cents > 0
          AND p.created_at < now() - ($2 || ' days')::interval
        ORDER BY p.created_at ASC
        LIMIT 50
      `,
      [operatingCompanyId, staleDays]
    );
    return res.rows.map((row) => ({
      subject_key: `payment:${String(row.payment_id)}`,
      subject_driver_id: null,
      subject_unit_id: null,
      subject_vendor_id: null,
      detection_summary: `Payment ${String(row.payment_date)} has ${String(row.amount_unapplied_cents)}¢ unapplied for >${staleDays} days`,
      detection_metric: row,
      source_view: rule.source_view,
    }));
  }

  // ── Accounting probe: stale posting batch stuck in queued/in_progress ──────
  if (rule.rule_code === "stale_posting_batch") {
    const staleDays = thresholdNumber(config, "stale_days", 7);
    const res = await client.query<Record<string, unknown>>(
      `
        SELECT
          pb.id::text AS batch_id,
          pb.batch_status,
          pb.source_transaction_type,
          pb.source_transaction_id::text AS source_transaction_id,
          pb.created_at::text AS created_at
        FROM accounting.posting_batches pb
        WHERE pb.operating_company_id = $1
          AND pb.batch_status IN ('queued', 'in_progress')
          AND pb.created_at < now() - ($2 || ' days')::interval
        ORDER BY pb.created_at ASC
        LIMIT 50
      `,
      [operatingCompanyId, staleDays]
    );
    return res.rows.map((row) => ({
      subject_key: `batch:${String(row.batch_id)}`,
      subject_driver_id: null,
      subject_unit_id: null,
      subject_vendor_id: null,
      detection_summary: `Posting batch ${String(row.source_transaction_type)}/${String(row.source_transaction_id)} stuck in '${String(row.batch_status)}' since ${String(row.created_at)}`,
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
