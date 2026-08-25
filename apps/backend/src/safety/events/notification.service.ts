import { listCompanyNotifyUserIds } from "../../notifications/notification.service.js";
import { enqueueOutboxEvent } from "../../outbox/enqueue-outbox-event.js";

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

  const result = await enqueueOutboxEvent(
    client,
    "safety.event.severe_notification",
    { aggregate_type: "safety.safety_events", aggregate_id: input.event_id },
    {
      operating_company_id: input.operating_company_id,
      recipient_user_ids: recipientUserIds,
      severity: notifSeverity,
      title,
      body,
      to: process.env.SAFETY_EVENT_ALERT_EMAIL ?? "safety@ih35dispatch.com",
      body_html: `<p>${body.replace(/\n/g, "<br/>")}</p><p>Event: ${input.event_id}</p>`,
    },
    `safety-event-severe:${input.event_id}`
  );
  return {
    in_app_notifications: result.enqueued ? recipientUserIds.length : 0,
    email_notifications: result.enqueued ? 1 : 0,
  };
}
