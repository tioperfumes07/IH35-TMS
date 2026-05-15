import { apiRequest } from "./client";

export type NotificationChannelKey = "email" | "sms" | "whatsapp" | "in_app";

export type NotificationPreferencesResponse = {
  events: string[];
  channels: Record<NotificationChannelKey, boolean>;
  event_overrides: Record<string, Partial<Record<NotificationChannelKey, boolean>>>;
  effective_by_event: Record<string, Record<NotificationChannelKey, boolean>>;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
};

export function getNotificationPreferences() {
  return apiRequest<NotificationPreferencesResponse>("/api/v1/identity/me/notification-preferences");
}

export function patchNotificationPreferences(body: {
  channels?: Partial<Record<NotificationChannelKey, boolean>>;
  event_overrides?: Record<string, Partial<Record<NotificationChannelKey, boolean>>>;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  timezone?: string | null;
  reset_to_defaults?: boolean;
}) {
  return apiRequest<NotificationPreferencesResponse>("/api/v1/identity/me/notification-preferences", {
    method: "PATCH",
    body,
  });
}
