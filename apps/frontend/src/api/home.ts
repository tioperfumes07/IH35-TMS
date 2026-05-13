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
