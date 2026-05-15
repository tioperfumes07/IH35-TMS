import { DateTime } from "luxon";
import {
  NOTIFICATION_PREFERENCE_EVENT_TYPES,
  type NotificationPreferenceEventType,
  preferenceEventForDispatch,
  type NotificationDispatchEventType,
} from "../notifications/event-types.js";

export type NotificationChannelKey = "email" | "sms" | "whatsapp" | "in_app";

export const DEFAULT_NOTIFICATION_CHANNELS: Record<NotificationChannelKey, boolean> = {
  email: true,
  sms: false,
  whatsapp: false,
  in_app: true,
};

export type NotificationEventOverrides = Partial<
  Record<NotificationPreferenceEventType, Partial<Record<NotificationChannelKey, boolean>>>
>;

export type MergedNotificationPreferences = {
  channels: Record<NotificationChannelKey, boolean>;
  event_overrides: NotificationEventOverrides;
  /** Resolved per-event channel booleans after merging defaults + overrides. */
  effective_by_event: Record<NotificationPreferenceEventType, Record<NotificationChannelKey, boolean>>;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
};

function readBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return fallback;
}

export function normalizeChannelMap(raw: unknown): Record<NotificationChannelKey, boolean> {
  const base = { ...DEFAULT_NOTIFICATION_CHANNELS };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_NOTIFICATION_CHANNELS) as NotificationChannelKey[]) {
    if (o[key] !== undefined) base[key] = readBool(o[key], base[key]);
  }
  return base;
}

function normalizeEventOverrides(raw: unknown): NotificationEventOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: NotificationEventOverrides = {};
  for (const [eventKey, chMap] of Object.entries(raw as Record<string, unknown>)) {
    if (!(NOTIFICATION_PREFERENCE_EVENT_TYPES as readonly string[]).includes(eventKey)) continue;
    if (!chMap || typeof chMap !== "object") continue;
    const inner: Partial<Record<NotificationChannelKey, boolean>> = {};
    for (const ck of Object.keys(DEFAULT_NOTIFICATION_CHANNELS) as NotificationChannelKey[]) {
      const v = (chMap as Record<string, unknown>)[ck];
      if (v !== undefined) inner[ck] = readBool(v, false);
    }
    out[eventKey as NotificationPreferenceEventType] = inner;
  }
  return out;
}

function buildEffective(
  channels: Record<NotificationChannelKey, boolean>,
  overrides: NotificationEventOverrides
): Record<NotificationPreferenceEventType, Record<NotificationChannelKey, boolean>> {
  const effective = {} as Record<NotificationPreferenceEventType, Record<NotificationChannelKey, boolean>>;
  for (const event of NOTIFICATION_PREFERENCE_EVENT_TYPES) {
    const row = { ...channels };
    const ev = overrides[event];
    if (ev) {
      for (const ck of Object.keys(DEFAULT_NOTIFICATION_CHANNELS) as NotificationChannelKey[]) {
        if (ev[ck] !== undefined) row[ck] = Boolean(ev[ck]);
      }
    }
    effective[event] = row;
  }
  return effective;
}

function channelsFromStorageRow(row: {
  channels?: unknown;
  email_enabled?: unknown;
  sms_enabled?: unknown;
  whatsapp_enabled?: unknown;
} | null): Record<NotificationChannelKey, boolean> {
  if (!row) return { ...DEFAULT_NOTIFICATION_CHANNELS };
  const raw = row.channels;
  const jsonHasKeys =
    raw &&
    typeof raw === "object" &&
    Object.keys(raw as Record<string, unknown>).some((k) =>
      (Object.keys(DEFAULT_NOTIFICATION_CHANNELS) as string[]).includes(k)
    );
  if (jsonHasKeys) return normalizeChannelMap(raw);
  if (row.email_enabled !== undefined || row.sms_enabled !== undefined || row.whatsapp_enabled !== undefined) {
    return normalizeChannelMap({
      email: row.email_enabled,
      sms: row.sms_enabled,
      whatsapp: row.whatsapp_enabled,
      in_app: true,
    });
  }
  return normalizeChannelMap(raw);
}

export function mergeNotificationPreferencesRow(row: {
  channels?: unknown;
  event_overrides?: unknown;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  timezone?: string | null;
  email_enabled?: unknown;
  sms_enabled?: unknown;
  whatsapp_enabled?: unknown;
} | null): MergedNotificationPreferences {
  const channels = channelsFromStorageRow(row);
  const event_overrides = normalizeEventOverrides(row?.event_overrides);
  return {
    channels,
    event_overrides,
    effective_by_event: buildEffective(channels, event_overrides),
    quiet_hours_start: row?.quiet_hours_start ?? null,
    quiet_hours_end: row?.quiet_hours_end ?? null,
    timezone: row?.timezone ?? null,
  };
}

function formatTime(t: unknown): string | null {
  if (t == null) return null;
  if (typeof t === "string") {
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(t.trim());
    if (m) return `${m[1]!.padStart(2, "0")}:${m[2]}`;
  }
  return null;
}

/** HH:mm 24h; null if invalid */
export function coerceQuietTime(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") return formatTime(value);
  return null;
}

export function isQuietHoursNow(
  timezone: string | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  if (!timezone || !start || !end) return false;
  const now = DateTime.now().setZone(timezone);
  if (!now.isValid) return false;
  const parseHm = (s: string) => {
    const [h, m] = s.split(":").map((x) => Number(x));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return now.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  };
  const startDt = parseHm(start);
  const endDt = parseHm(end);
  if (!startDt || !endDt || !startDt.isValid || !endDt.isValid) return false;
  if (startDt <= endDt) {
    return now >= startDt && now <= endDt;
  }
  return now >= startDt || now <= endDt;
}

export function channelEnabledForDispatch(args: {
  merged: MergedNotificationPreferences;
  event: NotificationDispatchEventType;
  channel: NotificationChannelKey;
}): boolean {
  const prefKey = preferenceEventForDispatch(args.event);
  const { merged, channel } = args;
  if (!prefKey) {
    return merged.channels[channel];
  }
  return merged.effective_by_event[prefKey][channel];
}

export const defaultMergedNotificationPreferences = mergeNotificationPreferencesRow(null);
