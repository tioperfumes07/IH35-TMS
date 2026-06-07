import { sendEmail } from "../../notifications/email.service.js";
import { createNotification, listCompanyNotifyUserIds } from "../../notifications/notification.service.js";
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

    for (const userId of recipientUserIds) {
      await createNotification(
        {
          operating_company_id: operatingCompanyId,
          user_id: userId,
          type: "compliance_expiring",
          severity: "critical",
          title,
          body,
          action_link: `/drivers/${alert.driver_uuid}`,
          entity_type: "driver",
          entity_id: alert.driver_uuid,
          source_block: "gap-82-cert-expiry",
        },
        client
      );
      inAppCount += 1;
    }

    try {
      await sendEmail({
        to: process.env.CERT_EXPIRY_ALERT_EMAIL ?? "safety@ih35dispatch.com",
        subject: `[Critical] ${alert.cert_label} expiry — ${alert.driver_name}`,
        html: `<p>${body}</p><p>Driver: ${alert.driver_uuid}</p>`,
        sender: "noreply",
        eventClass: "safety.cert_expiry.critical",
      });
      emailCount += 1;
    } catch {
      // Email failures are non-blocking for this alert pipeline.
    }
  }

  return {
    critical_alerts: critical.length,
    in_app_notifications: inAppCount,
    email_notifications: emailCount,
  };
}
