import { sendEmail } from "../../notifications/email.service.js";
import { createNotification, listCompanyNotifyUserIds } from "../../notifications/notification.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type SevereSafetyEventNotificationInput = {
  operating_company_id: string;
  event_id: string;
  event_type: string;
  severity: "high" | "critical";
  title: string;
  description?: string | null;
  subject_driver_name?: string | null;
  subject_unit_number?: string | null;
};

export function isSevereSafetyEventSeverity(severity: string): severity is "high" | "critical" {
  return severity === "high" || severity === "critical";
}

export async function notifySevereSafetyEvent(
  client: Queryable,
  input: SevereSafetyEventNotificationInput
): Promise<{ in_app_notifications: number; email_notifications: number }> {
  const recipientUserIds = await listCompanyNotifyUserIds(client, input.operating_company_id, [
    "Owner",
    "Administrator",
    "Manager",
    "Safety",
  ]);

  const notifSeverity = input.severity === "critical" ? "critical" : "high";
  const title = `[${input.severity.toUpperCase()}] Safety event — ${input.title}`;
  const subjectParts = [
    input.subject_driver_name ? `Driver: ${input.subject_driver_name}` : null,
    input.subject_unit_number ? `Unit: ${input.subject_unit_number}` : null,
    input.event_type ? `Type: ${input.event_type}` : null,
  ].filter(Boolean);
  const body =
    [input.description?.trim() || null, subjectParts.length ? subjectParts.join(" · ") : null]
      .filter(Boolean)
      .join("\n") || `New ${input.severity} severity safety event logged.`;

  let inAppCount = 0;
  for (const userId of recipientUserIds) {
    await createNotification(
      {
        operating_company_id: input.operating_company_id,
        user_id: userId,
        type: "driver_alert",
        severity: notifSeverity,
        title,
        body,
        action_link: `/safety/safety-events?event=${input.event_id}`,
        entity_type: "safety_event",
        entity_id: input.event_id,
        source_block: "0278-safety-gap3-auto-notifications",
      },
      client
    );
    inAppCount += 1;
  }

  let emailCount = 0;
  try {
    await sendEmail({
      to: process.env.SAFETY_EVENT_ALERT_EMAIL ?? "safety@ih35dispatch.com",
      subject: title,
      html: `<p>${body.replace(/\n/g, "<br/>")}</p><p>Event: ${input.event_id}</p>`,
      sender: "noreply",
      eventClass: "safety.safety_events.severe_created",
    });
    emailCount = 1;
  } catch {
    // Non-blocking when Resend is not configured.
  }

  return { in_app_notifications: inAppCount, email_notifications: emailCount };
}
