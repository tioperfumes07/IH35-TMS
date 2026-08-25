import { listCompanyNotifyUserIds } from "../../notifications/notification.service.js";
import { enqueueOutboxEvent } from "../../outbox/enqueue-outbox-event.js";
import type { CertExpiryAlert } from "./cert-monitor.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type AlertDispatchSummary = {
  critical_alerts: number;
  in_app_notifications: number;
  email_notifications: number;
};

export async function notifyCriticalExpiries(
  client: Queryable,
  operatingCompanyId: string,
  alerts: CertExpiryAlert[]
): Promise<AlertDispatchSummary> {
  const critical = alerts.filter((alert) => alert.severity === "critical");
  if (critical.length === 0) {
    return { critical_alerts: 0, in_app_notifications: 0, email_notifications: 0 };
  }

  const recipientUserIds = await listCompanyNotifyUserIds(client, operatingCompanyId, [
    "Owner",
    "Administrator",
    "Manager",
    "Safety",
  ]);

  let inAppCount = 0;
  let emailCount = 0;

  for (const alert of critical) {
    const title = `${alert.cert_label} expires soon`;
    const body = `${alert.driver_name} has ${alert.cert_label} expiring on ${alert.expiry_date} (${alert.days_until_expiry} days).`;

    const result = await enqueueOutboxEvent(
      client,
      "safety.cert_expiry.critical_notification",
      { aggregate_type: "mdata.drivers", aggregate_id: alert.driver_uuid },
      {
        operating_company_id: operatingCompanyId,
        recipient_user_ids: recipientUserIds,
        to: process.env.CERT_EXPIRY_ALERT_EMAIL ?? "safety@ih35dispatch.com",
        subject: `[Critical] ${alert.cert_label} expiry — ${alert.driver_name}`,
        body,
        body_html: `<p>${body}</p><p>Driver: ${alert.driver_uuid}</p>`,
      },
      `safety-cert-expiry:${operatingCompanyId}:${alert.driver_uuid}:${alert.cert_type}:${alert.expiry_date}`
    );
    if (result.enqueued) {
      inAppCount += recipientUserIds.length;
      emailCount += 1;
    }
  }

  return {
    critical_alerts: critical.length,
    in_app_notifications: inAppCount,
    email_notifications: emailCount,
  };
}
