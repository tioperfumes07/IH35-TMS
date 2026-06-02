import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client";

export type UserNotification = {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  action_link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  source_block: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

export type NotificationPreferences = {
  id: string;
  user_id: string;
  channels_per_type: Record<string, string[]>;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  email_digest_enabled: boolean;
  email_digest_frequency: string | null;
  updated_at: string;
};

type ListParams = {
  limit?: number;
  offset?: number;
  type?: string;
  severity?: string;
  unread_only?: boolean;
};

export async function fetchNotifications(params: ListParams = {}) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  if (params.type) qs.set("type", params.type);
  if (params.severity) qs.set("severity", params.severity);
  if (params.unread_only) qs.set("unread_only", "true");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiRequest<{ notifications: UserNotification[] }>(`/api/v1/notifications${suffix}`);
}

export async function fetchUnreadCount() {
  return apiRequest<{ unread_count: number }>("/api/v1/notifications/unread-count");
}

export async function markNotificationRead(id: string) {
  return apiRequest(`/api/v1/notifications/${id}/read`, { method: "POST" });
}

export async function dismissNotification(id: string) {
  return apiRequest(`/api/v1/notifications/${id}/dismiss`, { method: "POST" });
}

export async function markAllNotificationsRead() {
  return apiRequest<{ marked_read: number }>("/api/v1/notifications/mark-all-read", { method: "POST" });
}

export async function fetchNotificationPreferences() {
  return apiRequest<{ preferences: NotificationPreferences }>("/api/v1/notifications/preferences");
}

export async function patchNotificationPreferences(body: Partial<NotificationPreferences>) {
  return apiRequest<{ preferences: NotificationPreferences }>("/api/v1/notifications/preferences", {
    method: "PATCH",
    body,
  });
}

export function useNotifications(options?: { pollIntervalMs?: number; enableStream?: boolean }) {
  const pollIntervalMs = options?.pollIntervalMs ?? 30_000;
  const enableStream = options?.enableStream ?? typeof EventSource !== "undefined";
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const streamRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    const [list, count] = await Promise.all([
      fetchNotifications({ limit: 20 }),
      fetchUnreadCount(),
    ]);
    setNotifications(list.notifications);
    setUnreadCount(count.unread_count);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [pollIntervalMs, refresh]);

  useEffect(() => {
    if (!enableStream) return;
    try {
      const es = new EventSource("/api/v1/notifications/stream", { withCredentials: true });
      streamRef.current = es;
      es.onmessage = () => {
        void refresh();
      };
      es.onerror = () => {
        es.close();
        streamRef.current = null;
      };
      return () => {
        es.close();
        streamRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, [enableStream, refresh]);

  const markRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
    await refresh();
  }, [refresh]);

  const dismiss = useCallback(async (id: string) => {
    await dismissNotification(id);
    await refresh();
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    await refresh();
  }, [refresh]);

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markRead,
    dismiss,
    markAllRead,
  };
}
