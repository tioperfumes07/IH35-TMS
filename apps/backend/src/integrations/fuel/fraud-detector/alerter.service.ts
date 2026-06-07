/**
 * GAP-61 / CAP-11 — Critical fuel fraud alert dispatch.
 * Notifies Owner + Operations roles and surfaces on Today's Attention via open alerts.
 */
import { createNotification, listCompanyNotifyUserIds } from "../../../notifications/notification.service.js";
import type { FraudRuleId, RuleMatch } from "./rules.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type CriticalAlertDispatchSummary = {
  alerts_processed: number;
  notifications_sent: number;
};

function ruleTitle(ruleId: FraudRuleId): string {
  switch (ruleId) {
    case "RULE_GPS_MISMATCH":
      return "GPS mismatch at fuel pump";
    case "RULE_RAPID_MULTI":
      return "Rapid multi-station fuel activity";
    default:
      return "Critical fuel fraud alert";
  }
}

export async function notifyCriticalFuelFraudAlert(
  client: DbClient,
  operatingCompanyId: string,
  alertUuid: string,
  match: RuleMatch
): Promise<number> {
  if (match.severity !== "critical") return 0;

  const recipientUserIds = await listCompanyNotifyUserIds(client, operatingCompanyId, [
    "Owner",
    "Administrator",
    "Manager",
  ]);

  const evidence = match.evidence;
  const pumpAddress =
    typeof evidence.pump_address === "string" ? evidence.pump_address : "Unknown pump location";
  const txnAt = typeof evidence.transaction_at === "string" ? evidence.transaction_at : "unknown time";
  const title = ruleTitle(match.rule_id);
  const body = `Fuel transaction at ${pumpAddress} (${txnAt}) triggered ${match.rule_id}. Review immediately.`;

  let sent = 0;
  for (const userId of recipientUserIds) {
    await createNotification(
      {
        operating_company_id: operatingCompanyId,
        user_id: userId,
        type: "driver_alert",
        severity: "critical",
        title,
        body,
        action_link: "/fuel/fraud-alerts",
        entity_type: "fuel_fraud_alert",
        entity_id: alertUuid,
        source_block: "gap-61-cap-11-fuel-fraud",
      },
      client
    );
    sent += 1;
  }
  return sent;
}

export async function dispatchCriticalFuelFraudAlerts(
  client: DbClient,
  operatingCompanyId: string,
  createdAlerts: Array<{ alertId: string; match: RuleMatch }>
): Promise<CriticalAlertDispatchSummary> {
  let notificationsSent = 0;
  for (const { alertId, match } of createdAlerts) {
    if (match.severity !== "critical") continue;
    notificationsSent += await notifyCriticalFuelFraudAlert(client, operatingCompanyId, alertId, match);
  }
  return { alerts_processed: createdAlerts.length, notifications_sent: notificationsSent };
}
