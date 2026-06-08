import { getDetector } from "./detector.service.js";
import { notifyAnomalyAlert } from "./notification.service.js";
import type { AnomalyRule, Queryable } from "./types.js";

export async function evaluateRule(client: Queryable, rule: AnomalyRule): Promise<number> {
  const detector = getDetector(rule.detector_function);
  if (!detector) return 0;
  const findings = await detector(client, rule.operating_company_id, rule.threshold_config ?? {});
  let inserted = 0;
  for (const finding of findings) {
    const res = await client.query<{ uuid: string }>(
      `INSERT INTO safety.anomaly_alerts (
        operating_company_id, rule_uuid, severity, subject_kind, subject_uuid, evidence
      ) VALUES ($1,$2,$3,$4,$5::uuid,$6::jsonb)
      RETURNING uuid::text`,
      [rule.operating_company_id, rule.uuid, rule.severity, finding.subject_kind,
       finding.subject_uuid, JSON.stringify(finding.evidence)]
    );
    if (res.rows[0]) {
      inserted += 1;
      if (rule.severity === 'high' || rule.severity === 'critical') {
        await notifyAnomalyAlert(client, rule, res.rows[0].uuid, finding.evidence);
      }
    }
  }
  await client.query(`UPDATE safety.anomaly_alert_rules SET last_evaluated_at = now() WHERE uuid = $1::uuid`, [rule.uuid]);
  return inserted;
}

export async function evaluateRulesForTenant(client: Queryable, operatingCompanyId: string, cadenceFilter?: number) {
  const params: unknown[] = [operatingCompanyId];
  let cadenceSql = '';
  if (cadenceFilter != null) {
    cadenceSql = ' AND cadence_minutes <= $2';
    params.push(cadenceFilter);
  }
  const res = await client.query<AnomalyRule>(
    `SELECT uuid::text, operating_company_id, rule_slug, rule_name, category, detector_function,
            threshold_config, severity, is_active, notify_roles, cadence_minutes
     FROM safety.anomaly_alert_rules WHERE operating_company_id = $1 AND is_active = true${cadenceSql}`,
    params
  );
  let alerts = 0;
  for (const rule of res.rows) alerts += await evaluateRule(client, rule);
  return { rules_evaluated: res.rows.length, alerts_created: alerts };
}
