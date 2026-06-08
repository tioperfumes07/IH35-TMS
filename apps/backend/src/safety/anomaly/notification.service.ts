import { createNotification, listCompanyNotifyUserIds } from "../../notifications/notification.service.js";
import type { AnomalyRule, Queryable } from "./types.js";

export async function notifyAnomalyAlert(
  client: Queryable,
  rule: AnomalyRule,
  alertUuid: string,
  evidence: Record<string, unknown>
) {
  const userIds = await listCompanyNotifyUserIds(client, rule.operating_company_id, rule.notify_roles);
  for (const userId of userIds) {
    await createNotification({
      operating_company_id: rule.operating_company_id,
      user_id: userId,
      type: "system",
      severity: rule.severity === "critical" ? "critical" : "high",
      title: `Anomaly: ${rule.rule_name}`,
      body: JSON.stringify(evidence).slice(0, 500),
      action_link: `/safety/anomaly?alert=${alertUuid}`,
      entity_type: "anomaly_alert",
      entity_id: alertUuid,
      source_block: "GAP-46",
    }, client);
  }
}
