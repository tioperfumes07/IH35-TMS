export const DISPATCH_LOCAL_SETTINGS_KEY = "ih35.dispatch.local_settings";

export type DispatchLocalSettings = {
  default_sort: string;
  alert_yellow_minutes: number;
  alert_red_minutes: number;
  auto_routing_enabled: boolean;
  auto_routing_respect_hos: boolean;
  auto_routing_respect_equipment: boolean;
};

export const DEFAULT_DISPATCH_LOCAL_SETTINGS: DispatchLocalSettings = {
  default_sort: "created_at:desc",
  alert_yellow_minutes: 1,
  alert_red_minutes: 30,
  auto_routing_enabled: true,
  auto_routing_respect_hos: true,
  auto_routing_respect_equipment: true,
};

export function dispatchLocalSettingsKey(operatingCompanyId: string) {
  return `${DISPATCH_LOCAL_SETTINGS_KEY}.${operatingCompanyId}`;
}

export function readDispatchLocalSettings(operatingCompanyId: string): DispatchLocalSettings {
  if (typeof window === "undefined" || !operatingCompanyId) return DEFAULT_DISPATCH_LOCAL_SETTINGS;
  try {
    const raw = window.localStorage.getItem(dispatchLocalSettingsKey(operatingCompanyId));
    if (!raw) return DEFAULT_DISPATCH_LOCAL_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DispatchLocalSettings>;
    return { ...DEFAULT_DISPATCH_LOCAL_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_DISPATCH_LOCAL_SETTINGS;
  }
}

export function writeDispatchLocalSettings(operatingCompanyId: string, partial: Partial<DispatchLocalSettings>) {
  const next = { ...readDispatchLocalSettings(operatingCompanyId), ...partial };
  window.localStorage.setItem(dispatchLocalSettingsKey(operatingCompanyId), JSON.stringify(next));
  return next;
}

const DISPATCH_BOARD_SORT_KEYS: Record<string, string> = {
  created_at: "created_at",
  load_number: "load",
  status: "status",
  rate_total_cents: "linehaul",
};

export function readDispatchBoardDefaultSort(operatingCompanyId: string): { key: string; direction: "asc" | "desc" } {
  const [storedKey, storedDirection] = readDispatchLocalSettings(operatingCompanyId).default_sort.split(":");
  return {
    key: DISPATCH_BOARD_SORT_KEYS[storedKey] ?? "created_at",
    direction: storedDirection === "asc" ? "asc" : "desc",
  };
}
