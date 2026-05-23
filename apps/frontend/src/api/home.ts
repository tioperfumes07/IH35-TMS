/**
 * Home dashboard API — canonical paths under `/api/v1/home/`.
 *
 * ## `GET /api/v1/home/attention-list?operating_company_id={uuid}`
 *
 * **Success (200) — normalized item shape:**
 * ```ts
 * {
 *   items: Array<{
 *     type: string;
 *     severity: "info" | "warning" | "error" | "critical";
 *     title: string;
 *     count: number;
 *     action_url: string;
 *     action_label: string;
 *   }>;
 * }
 * ```
 *
 * Legacy `{ items: [{ severity, message, link, count }] }` is normalized client-side.
 * **404** → falls back to `GET /api/v1/reports/home-attention-list`.
 *
 * ## `GET /api/v1/home/fleet-snapshot?operating_company_id={uuid}`
 *
 * Same JSON as reports. **404** → falls back to `GET /api/v1/reports/home-fleet-snapshot`.
 */

import { apiRequest, ApiError } from "./client";
import { getHomeAttentionList, getHomeFleetSnapshot, type HomeFleetSnapshot } from "./reports";

function withCompany(path: string, companyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(companyId)}`;
}

export type HomeAttentionSeverity = "info" | "warning" | "error" | "critical";

export type HomeAttentionListItem = {
  type: string;
  severity: HomeAttentionSeverity;
  title: string;
  count: number;
  action_url: string;
  action_label: string;
};

export type HomeAttentionListNormalized = {
  items: HomeAttentionListItem[];
};

const LINK_LABELS: Record<string, string> = {
  "/maintenance": "Open maintenance",
  "/accounting": "Open accounting",
  "/safety": "Open safety",
  "/dispatch": "Open dispatch",
  "/fuel": "Open fuel",
  "/drivers": "Open drivers",
};

function inferTypeFromLegacy(link: string, message: string): string {
  const m = message.toLowerCase();
  if (link === "/dispatch" && m.includes("dispatch")) return "loads_unassigned";
  if (link === "/maintenance") return "wos_pending_approval";
  if (link === "/accounting" && m.includes("qbo")) return "qbo_sync_alerts_critical";
  if (link === "/accounting") return "bills_due_7d";
  if (link === "/drivers" && m.includes("hos")) return "drivers_hos_violation";
  if (link === "/drivers") return "driver_permits_refresh";
  return `attention${link.replace(/\//g, "_") || "_home"}`;
}

function mapLegacySeverity(s: string): HomeAttentionSeverity {
  if (s === "critical") return "critical";
  if (s === "warning") return "warning";
  if (s === "error") return "error";
  return "info";
}

function normalizeAttentionItem(raw: unknown): HomeAttentionListItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const count = Number(o.count ?? 0);
  const action_url =
    typeof o.action_url === "string" ? o.action_url : typeof o.link === "string" ? o.link : "/";
  const title =
    typeof o.title === "string" ? o.title : typeof o.message === "string" ? o.message : "Attention item";
  const sevRaw = typeof o.severity === "string" ? o.severity : "info";
  const severity = mapLegacySeverity(sevRaw);
  const messageStr = typeof o.message === "string" ? o.message : title;
  const type = typeof o.type === "string" ? o.type : inferTypeFromLegacy(action_url, messageStr);
  const action_label =
    typeof o.action_label === "string" ? o.action_label : LINK_LABELS[action_url] ?? "Open";
  return { type, severity, title, count, action_url, action_label };
}

export function normalizeHomeAttentionPayload(raw: unknown): HomeAttentionListNormalized {
  if (!raw || typeof raw !== "object" || !("items" in raw)) {
    return { items: [] };
  }
  const arr = (raw as { items: unknown }).items;
  if (!Array.isArray(arr)) return { items: [] };
  const items = arr.map(normalizeAttentionItem).filter((x): x is HomeAttentionListItem => x !== null);
  return { items };
}

export async function fetchHomeAttentionList(companyId: string): Promise<HomeAttentionListNormalized> {
  try {
    const payload = await apiRequest<unknown>(withCompany("/api/v1/home/attention-list", companyId));
    return normalizeHomeAttentionPayload(payload);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      const legacy = await getHomeAttentionList(companyId);
      return normalizeHomeAttentionPayload(legacy);
    }
    throw e;
  }
}

export async function fetchHomeFleetSnapshot(companyId: string): Promise<HomeFleetSnapshot> {
  try {
    return await apiRequest<HomeFleetSnapshot>(withCompany("/api/v1/home/fleet-snapshot", companyId));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      return getHomeFleetSnapshot(companyId);
    }
    throw e;
  }
}

export type HomeQboSyncHealth = {
  latest_run: {
    status: string;
    started_at: string | null;
    completed_at: string | null;
    run_kind: string | null;
  } | null;
  open_alerts_count: number;
  failed_outbox_count: number;
  high_severity_alerts_count: number;
  last_updated: string;
};

export async function fetchHomeQboSyncHealth(companyId: string): Promise<HomeQboSyncHealth> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/qbo/sync-health", companyId));
  const latestRunRaw =
    raw.latest_run && typeof raw.latest_run === "object" ? (raw.latest_run as Record<string, unknown>) : null;
  return {
    latest_run: latestRunRaw
      ? {
          status: typeof latestRunRaw.status === "string" ? latestRunRaw.status : "unknown",
          started_at: typeof latestRunRaw.started_at === "string" ? latestRunRaw.started_at : null,
          completed_at: typeof latestRunRaw.completed_at === "string" ? latestRunRaw.completed_at : null,
          run_kind: typeof latestRunRaw.run_kind === "string" ? latestRunRaw.run_kind : null,
        }
      : null,
    open_alerts_count: num(raw.open_alerts_count),
    failed_outbox_count: num(raw.failed_outbox_count),
    high_severity_alerts_count: num(raw.high_severity_alerts_count),
    last_updated: typeof raw.last_updated === "string" ? raw.last_updated : new Date().toISOString(),
  };
}

/* —— T11.19 KPI + chart payloads (backend routes may ship incrementally). */

export type HomeTodayRevenue = {
  revenue_cents: number;
  yesterday_revenue_cents?: number;
  delta_pct_vs_yesterday?: number | null;
};

export type HomeOpenLoadsCount = {
  total: number;
  in_transit: number;
  assigned: number;
  unassigned: number;
};

export type HomeDriversOnDuty = {
  active: number;
  total_drivers: number;
  on_break: number;
};

export type HomeWosOpenCount = {
  open: number;
  in_progress: number;
};

export type HomeCashPosition = {
  balance_cents: number;
  last_reconciled_at: string | null;
};

export type HomeFactoringBalance = {
  outstanding_cents: number;
  invoices_factored: number;
};

export type HomeWeeklyRevenuePoint = { date: string; revenue_cents: number };

export type HomeWoStatusCount = {
  status: "draft" | "approved" | "in_progress" | "completed" | "cancelled";
  count: number;
};

export type HomeFleetUtilization = {
  active_units: number;
  total_units: number;
  percentage: number;
};

function num(raw: unknown, fallback = 0): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export async function fetchHomeTodayRevenue(companyId: string): Promise<HomeTodayRevenue> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/home/today-revenue", companyId));
  let delta: number | null | undefined;
  if (raw.delta_pct_vs_yesterday === null) delta = null;
  else if (raw.delta_pct_vs_yesterday === undefined) delta = undefined;
  else {
    const d = Number(raw.delta_pct_vs_yesterday);
    delta = Number.isFinite(d) ? d : undefined;
  }
  return {
    revenue_cents: num(raw.revenue_cents),
    yesterday_revenue_cents: raw.yesterday_revenue_cents !== undefined ? num(raw.yesterday_revenue_cents) : undefined,
    delta_pct_vs_yesterday: delta,
  };
}

export async function fetchHomeOpenLoadsCount(companyId: string): Promise<HomeOpenLoadsCount> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/home/open-loads-count", companyId));
  return {
    total: num(raw.total),
    in_transit: num(raw.in_transit),
    assigned: num(raw.assigned),
    unassigned: num(raw.unassigned),
  };
}

export async function fetchHomeDriversOnDuty(companyId: string): Promise<HomeDriversOnDuty> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/home/drivers-on-duty", companyId));
  return {
    active: num(raw.active),
    total_drivers: num(raw.total_drivers),
    on_break: num(raw.on_break),
  };
}

export async function fetchHomeWosOpenCount(companyId: string): Promise<HomeWosOpenCount> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/home/wos-open-count", companyId));
  return {
    open: num(raw.open),
    in_progress: num(raw.in_progress),
  };
}

export async function fetchHomeCashPosition(companyId: string): Promise<HomeCashPosition> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/home/cash-position", companyId));
  return {
    balance_cents: num(raw.balance_cents),
    last_reconciled_at: typeof raw.last_reconciled_at === "string" ? raw.last_reconciled_at : null,
  };
}

export async function fetchHomeFactoringBalance(companyId: string): Promise<HomeFactoringBalance> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/home/factoring-balance", companyId));
  return {
    outstanding_cents: num(raw.outstanding_cents),
    invoices_factored: num(raw.invoices_factored),
  };
}

function coerceWeeklyRevenue(raw: unknown): HomeWeeklyRevenuePoint[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { rows?: unknown }).rows)
      ? ((raw as { rows: unknown[] }).rows ?? [])
      : raw && typeof raw === "object" && Array.isArray((raw as { points?: unknown }).points)
        ? ((raw as { points: unknown[] }).points ?? [])
        : [];
  return list
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      const date = typeof o.date === "string" ? o.date : "";
      const revenue_cents = num(o.revenue_cents);
      if (!date) return null;
      return { date, revenue_cents };
    })
    .filter((x): x is HomeWeeklyRevenuePoint => x !== null);
}

export async function fetchHomeWeeklyRevenue(companyId: string, days = 7): Promise<HomeWeeklyRevenuePoint[]> {
  const path = withCompany(`/api/v1/home/weekly-revenue?days=${encodeURIComponent(String(days))}`, companyId);
  const raw = await apiRequest<unknown>(path);
  return coerceWeeklyRevenue(raw);
}

const WO_STATUSES = ["draft", "approved", "in_progress", "completed", "cancelled"] as const;

function coerceWoStatusCounts(raw: unknown): HomeWoStatusCount[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { rows?: unknown }).rows)
      ? ((raw as { rows: unknown[] }).rows ?? [])
      : [];
  const map = new Map<string, number>();
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const status = typeof o.status === "string" ? o.status.toLowerCase() : "";
    map.set(status, num(o.count));
  }
  return WO_STATUSES.map((status) => ({
    status,
    count: map.get(status) ?? 0,
  }));
}

export async function fetchHomeWoStatusCounts(companyId: string): Promise<HomeWoStatusCount[]> {
  const raw = await apiRequest<unknown>(withCompany("/api/v1/home/wo-status-counts", companyId));
  return coerceWoStatusCounts(raw);
}

export async function fetchHomeFleetUtilization(companyId: string): Promise<HomeFleetUtilization> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/home/fleet-utilization", companyId));
  return {
    active_units: num(raw.active_units),
    total_units: num(raw.total_units),
    percentage: num(raw.percentage),
  };
}
