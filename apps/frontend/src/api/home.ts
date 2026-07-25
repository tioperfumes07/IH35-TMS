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

import { z } from "zod";
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
  last_success_at: string | null;
  last_success_source: "qbo_sync_runs" | "master_data_cdc" | null;
  last_success_age_seconds: number | null;
  stale_after_seconds: number;
  freshness_status: "fresh" | "stale" | "never";
  is_stale: boolean;
  open_alerts_count: number;
  failed_outbox_count: number;
  high_severity_alerts_count: number;
  last_updated: string;
};

export type HomeVendorMappingIntegrity = {
  status: "green" | "yellow" | "red";
  totals: {
    unmapped_drivers: number;
    duplicate_mapping: number;
    name_mismatch: number;
    major_drift: number;
    total_issues: number;
  };
};

export type HomeQboCustomersPushStatus = {
  // HOME-7A: true COUNT(*) total (for "{synced}/{total}"); total_local is the unsynced count (legacy label).
  total: number;
  total_local: number;
  synced: number;
  unsynced: number;
  pushing: number;
  failed: number;
  dead_letter: number;
};

export type HomeQboVendorsPushStatus = HomeQboCustomersPushStatus;

export type HomeQboAccountsPushStatus = HomeQboCustomersPushStatus & {
  root_synced: number;
  children_synced: number;
  blocked_by_parent: number;
};

export async function fetchHomeQboCustomersPushStatus(companyId: string): Promise<HomeQboCustomersPushStatus> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/sync/qbo-customers/status", companyId));
  return {
    total: num(raw.total),
    total_local: num(raw.total_local),
    synced: num(raw.synced),
    unsynced: num(raw.unsynced),
    pushing: num(raw.pushing),
    failed: num(raw.failed),
    dead_letter: num(raw.dead_letter),
  };
}

export async function fetchHomeQboVendorsPushStatus(companyId: string): Promise<HomeQboVendorsPushStatus> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/sync/qbo-vendors/status", companyId));
  return {
    total: num(raw.total),
    total_local: num(raw.total_local),
    synced: num(raw.synced),
    unsynced: num(raw.unsynced),
    pushing: num(raw.pushing),
    failed: num(raw.failed),
    dead_letter: num(raw.dead_letter),
  };
}

export async function fetchHomeQboAccountsPushStatus(companyId: string): Promise<HomeQboAccountsPushStatus> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/sync/qbo-accounts/status", companyId));
  return {
    total: num(raw.total),
    total_local: num(raw.total_local),
    synced: num(raw.synced),
    unsynced: num(raw.unsynced),
    pushing: num(raw.pushing),
    failed: num(raw.failed),
    dead_letter: num(raw.dead_letter),
    root_synced: num(raw.root_synced),
    children_synced: num(raw.children_synced),
    blocked_by_parent: num(raw.blocked_by_parent),
  };
}

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
    last_success_at: typeof raw.last_success_at === "string" ? raw.last_success_at : null,
    last_success_source:
      raw.last_success_source === "qbo_sync_runs" || raw.last_success_source === "master_data_cdc"
        ? raw.last_success_source
        : null,
    last_success_age_seconds: raw.last_success_age_seconds == null ? null : num(raw.last_success_age_seconds),
    stale_after_seconds: num(raw.stale_after_seconds),
    freshness_status:
      raw.freshness_status === "fresh" || raw.freshness_status === "stale" || raw.freshness_status === "never"
        ? raw.freshness_status
        : "never",
    is_stale: raw.is_stale === true,
    open_alerts_count: num(raw.open_alerts_count),
    failed_outbox_count: num(raw.failed_outbox_count),
    high_severity_alerts_count: num(raw.high_severity_alerts_count),
    last_updated: typeof raw.last_updated === "string" ? raw.last_updated : new Date().toISOString(),
  };
}

export async function fetchHomeVendorMappingIntegrity(companyId: string): Promise<HomeVendorMappingIntegrity> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/samsara/vendor-mapping-integrity", companyId));
  const totals = raw.totals && typeof raw.totals === "object" ? (raw.totals as Record<string, unknown>) : {};
  const statusRaw = String(raw.status ?? "green").toLowerCase();
  const status = statusRaw === "red" || statusRaw === "yellow" ? statusRaw : "green";
  return {
    status,
    totals: {
      unmapped_drivers: num(totals.unmapped_drivers),
      duplicate_mapping: num(totals.duplicate_mapping),
      name_mismatch: num(totals.name_mismatch),
      major_drift: num(totals.major_drift),
      total_issues: num(totals.total_issues),
    },
  };
}

/* —— T11.19 KPI + chart payloads (backend routes may ship incrementally). */

export type HomeRevenueBasisMeta = {
  label: "invoice_basis" | "gl_posted" | string;
  source: string;
  recognition: string;
  governed_accounts?: string;
};

export type HomeRevenueInvoiceDrill = {
  invoice_id: string;
  display_id: string | null;
  recognition_date: string;
  invoice_revenue_cents: number;
  gl_revenue_cents: number;
  journal_entry_ids: string[];
  reason: string;
  href: string;
};

export type HomeRevenueJournalDrill = {
  journal_entry_id: string;
  entry_date: string;
  gl_revenue_cents: number;
  invoice_id: string | null;
  account_ids: string[];
  reason: string;
  href: string;
};

export type HomeTodayRevenue = {
  /** Null when linkage is unverifiable — never treat as $0. */
  revenue_cents: number | null;
  invoice_basis_cents?: number;
  gl_posted_revenue_cents?: number;
  status?: "ok" | "empty" | "unverifiable";
  unverifiable_reason?: string | null;
  basis?: { invoice: HomeRevenueBasisMeta; gl: HomeRevenueBasisMeta };
  discrepancy_count?: number;
  discrepancy_cents?: number;
  drill?: {
    mismatched_invoices: HomeRevenueInvoiceDrill[];
    mismatched_journal_entries: HomeRevenueJournalDrill[];
  };
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
  /**
   * Outstanding Faro secured-borrowing LIABILITY (integer cents). Never reserve.
   * Null when status is unverifiable / accounting_exception — never coerce to $0.
   */
  outstanding_cents: number | null;
  /** Separate 1.5% reserve receivable asset (integer cents). Never netted into outstanding. */
  reserve_receivable_cents?: number | null;
  invoices_factored: number | null;
  status?: "ok" | "empty" | "unverifiable" | "accounting_exception";
  unverifiable_reason?: string | null;
  /** Signed diagnostics (orphan legs, anomalies) — never used as Faro headline. */
  diagnostics?: {
    orphan_liability_role_cents?: number;
    orphan_reserve_role_cents?: number;
    outstanding_liability_signed_cents?: number;
    [key: string]: unknown;
  } | null;
};

export type HomeWeeklyRevenuePoint = {
  date: string;
  revenue_cents: number;
  invoice_basis_cents?: number;
  gl_posted_revenue_cents?: number;
};

export type HomeWeeklyRevenueResult = {
  days: HomeWeeklyRevenuePoint[];
  status?: "ok" | "empty" | "unverifiable";
  basis?: { invoice: HomeRevenueBasisMeta; gl: HomeRevenueBasisMeta };
  invoice_basis_cents?: number;
  gl_posted_revenue_cents?: number;
  discrepancy_count?: number;
  discrepancy_cents?: number;
};

export type HomeWoStatusCount = {
  status: "draft" | "open" | "in_progress" | "awaiting_parts" | "completed" | "cancelled";
  count: number;
};

export type HomeFleetUtilization = {
  active_units: number;
  total_units: number;
  percentage: number;
};

export type HomeDriverDaySummaryRow = {
  driver_id: string;
  driver_name: string;
  miles: number;
  hours_on_duty: number;
  fuel_stops: number;
  on_time_arrivals: number;
  late_arrivals: number;
};

export type HomeDriverDaySummaryResult = {
  date: string;
  has_data: boolean;
  rows: HomeDriverDaySummaryRow[];
};

const homeDriverDaySummaryRowSchema = z.object({
  driver_id: z.string().uuid(),
  driver_name: z.string(),
  miles: z.number(),
  hours_on_duty: z.number(),
  fuel_stops: z.number(),
  on_time_arrivals: z.number(),
  late_arrivals: z.number(),
});

const homeDriverDaySummaryResponseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  has_data: z.boolean(),
  rows: z.array(homeDriverDaySummaryRowSchema),
});

function num(raw: unknown, fallback = 0): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function coerceRevenueDrill(raw: Record<string, unknown>): HomeTodayRevenue["drill"] {
  const drill = raw.drill;
  if (!drill || typeof drill !== "object") return undefined;
  const d = drill as {
    mismatched_invoices?: unknown;
    mismatched_journal_entries?: unknown;
  };
  const invoices = Array.isArray(d.mismatched_invoices)
    ? d.mismatched_invoices.flatMap((row): HomeRevenueInvoiceDrill[] => {
        if (!row || typeof row !== "object") return [];
        const o = row as Record<string, unknown>;
        if (typeof o.invoice_id !== "string" || typeof o.href !== "string") return [];
        return [
          {
            invoice_id: o.invoice_id,
            display_id: typeof o.display_id === "string" ? o.display_id : null,
            recognition_date: typeof o.recognition_date === "string" ? o.recognition_date : "",
            invoice_revenue_cents: num(o.invoice_revenue_cents),
            gl_revenue_cents: num(o.gl_revenue_cents),
            journal_entry_ids: Array.isArray(o.journal_entry_ids)
              ? o.journal_entry_ids.filter((x): x is string => typeof x === "string")
              : [],
            reason: typeof o.reason === "string" ? o.reason : "missing_je",
            href: o.href,
          },
        ];
      })
    : [];
  const journals = Array.isArray(d.mismatched_journal_entries)
    ? d.mismatched_journal_entries.flatMap((row): HomeRevenueJournalDrill[] => {
        if (!row || typeof row !== "object") return [];
        const o = row as Record<string, unknown>;
        if (typeof o.journal_entry_id !== "string" || typeof o.href !== "string") return [];
        return [
          {
            journal_entry_id: o.journal_entry_id,
            entry_date: typeof o.entry_date === "string" ? o.entry_date : "",
            gl_revenue_cents: num(o.gl_revenue_cents),
            invoice_id: typeof o.invoice_id === "string" ? o.invoice_id : null,
            account_ids: Array.isArray(o.account_ids)
              ? o.account_ids.filter((x): x is string => typeof x === "string")
              : [],
            reason: typeof o.reason === "string" ? o.reason : "unlinked_gl_revenue",
            href: o.href,
          },
        ];
      })
    : [];
  return { mismatched_invoices: invoices, mismatched_journal_entries: journals };
}

function coerceTodayRevenuePayload(raw: Record<string, unknown>): HomeTodayRevenue {
  let delta: number | null | undefined;
  if (raw.delta_pct_vs_yesterday === null) delta = null;
  else if (raw.delta_pct_vs_yesterday === undefined) delta = undefined;
  else {
    const d = Number(raw.delta_pct_vs_yesterday);
    delta = Number.isFinite(d) ? d : undefined;
  }
  // 0280-02: unverifiable → revenue_cents null (never coerce to fabricated $0).
  const revenueRaw = raw.revenue_cents;
  const revenue_cents =
    revenueRaw === null || revenueRaw === undefined
      ? null
      : Number.isFinite(Number(revenueRaw))
        ? Number(revenueRaw)
        : null;
  const status =
    raw.status === "ok" || raw.status === "empty" || raw.status === "unverifiable"
      ? raw.status
      : undefined;
  return {
    revenue_cents,
    invoice_basis_cents: raw.invoice_basis_cents !== undefined ? num(raw.invoice_basis_cents) : undefined,
    gl_posted_revenue_cents: raw.gl_posted_revenue_cents !== undefined ? num(raw.gl_posted_revenue_cents) : undefined,
    status,
    unverifiable_reason:
      typeof raw.unverifiable_reason === "string"
        ? raw.unverifiable_reason
        : raw.unverifiable_reason === null
          ? null
          : undefined,
    basis: raw.basis && typeof raw.basis === "object" ? (raw.basis as HomeTodayRevenue["basis"]) : undefined,
    discrepancy_count: raw.discrepancy_count !== undefined ? num(raw.discrepancy_count) : undefined,
    discrepancy_cents: raw.discrepancy_cents !== undefined ? num(raw.discrepancy_cents) : undefined,
    drill: coerceRevenueDrill(raw),
    yesterday_revenue_cents: raw.yesterday_revenue_cents !== undefined ? num(raw.yesterday_revenue_cents) : undefined,
    delta_pct_vs_yesterday: delta,
  };
}

/** h-05: Home KPI range presets (server resolves the window in company timezone). */
export const HOME_KPI_RANGES = ["today", "7d", "30d", "mtd", "ytd"] as const;
export type HomeKpiRange = (typeof HOME_KPI_RANGES)[number];

/**
 * Today revenue — prefers typed 200 `{ status: "unverifiable" }`.
 * Also maps legacy/alternate 422 with `error=revenue_gl_linkage_unverifiable` to the same shape.
 * Transport/auth/5xx stay as thrown ApiError (never labeled schema-unverifiable).
 * h-05: optional `range` preset (today|7d|30d|mtd|ytd) — omitted/`today` keeps legacy behavior.
 */
export async function fetchHomeTodayRevenue(companyId: string, range: HomeKpiRange = "today"): Promise<HomeTodayRevenue> {
  const basePath =
    range === "today"
      ? "/api/v1/home/today-revenue"
      : `/api/v1/home/today-revenue?range=${encodeURIComponent(range)}`;
  const path = withCompany(basePath, companyId);
  try {
    const raw = await apiRequest<Record<string, unknown>>(path);
    return coerceTodayRevenuePayload(raw);
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 422 &&
      err.data &&
      typeof err.data === "object" &&
      (err.data as { error?: string }).error === "revenue_gl_linkage_unverifiable"
    ) {
      return coerceTodayRevenuePayload({
        ...(err.data as Record<string, unknown>),
        status: "unverifiable",
        revenue_cents: null,
      });
    }
    // Real non-2xx (401/403/500/…) — do not fabricate unverifiable.
    throw err;
  }
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
  // Backend (home-widgets.routes.ts /cash-position) returns { totalCents, byAccount }. It does NOT
  // send `balance_cents`, so reading that key rendered a permanent $0 (HOME-2). Read `totalCents`,
  // keeping `balance_cents` as a fallback for forward-compat.
  return {
    balance_cents: num(raw.totalCents ?? raw.balance_cents),
    last_reconciled_at: typeof raw.last_reconciled_at === "string" ? raw.last_reconciled_at : null,
  };
}

function nullableCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function fetchHomeFactoringBalance(companyId: string): Promise<HomeFactoringBalance> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/home/factoring-balance", companyId));
  // 0280-05 / CPA VETO: Factoring Balance headline = outstanding Faro LIABILITY, never reserve.
  // Prefer outstanding_liability_cents / outstanding_cents / advancedCents / totalCents (all liability).
  // reserve_receivable_cents / reserveCents are returned separately and MUST NOT headline.
  // Never coerce null → 0 when status is unverifiable / accounting_exception.
  const status =
    raw.status === "ok" ||
    raw.status === "empty" ||
    raw.status === "unverifiable" ||
    raw.status === "accounting_exception"
      ? raw.status
      : undefined;
  if (status === "unverifiable" || status === "accounting_exception") {
    return {
      outstanding_cents: null,
      reserve_receivable_cents: null,
      invoices_factored: null,
      status,
      unverifiable_reason:
        typeof raw.unverifiable_reason === "string" ? raw.unverifiable_reason : null,
      diagnostics:
        raw.diagnostics && typeof raw.diagnostics === "object"
          ? (raw.diagnostics as HomeFactoringBalance["diagnostics"])
          : null,
    };
  }
  const liability = nullableCents(
    raw.outstanding_liability_cents ?? raw.outstanding_cents ?? raw.advancedCents ?? raw.totalCents
  );
  const reserve = nullableCents(raw.reserve_receivable_cents ?? raw.reserveCents);
  const invoices = nullableCents(raw.invoice_count ?? raw.invoices_factored);
  return {
    outstanding_cents: liability,
    reserve_receivable_cents: reserve,
    invoices_factored: invoices,
    status,
    unverifiable_reason:
      typeof raw.unverifiable_reason === "string" ? raw.unverifiable_reason : null,
  };
}

function coerceWeeklyRevenue(raw: unknown): HomeWeeklyRevenueResult {
  // Backend (home-widgets) returns { days: [{ date, cents, invoice_basis_cents, gl_posted_revenue_cents }], … }.
  // Also accept a bare array / { rows } / { points } with revenue_cents for forward-compat.
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { days?: unknown }).days)
      ? ((raw as { days: unknown[] }).days ?? [])
      : raw && typeof raw === "object" && Array.isArray((raw as { rows?: unknown }).rows)
        ? ((raw as { rows: unknown[] }).rows ?? [])
        : raw && typeof raw === "object" && Array.isArray((raw as { points?: unknown }).points)
          ? ((raw as { points: unknown[] }).points ?? [])
          : [];
  const days: HomeWeeklyRevenuePoint[] = list.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const o = row as Record<string, unknown>;
    const date = typeof o.date === "string" ? o.date : "";
    // backend sends `cents` (invoice basis); accept `revenue_cents` too.
    const revenue_cents = o.revenue_cents !== undefined ? num(o.revenue_cents) : num(o.cents);
    if (!date) return [];
    const point: HomeWeeklyRevenuePoint = {
      date,
      revenue_cents,
      invoice_basis_cents: o.invoice_basis_cents !== undefined ? num(o.invoice_basis_cents) : revenue_cents,
    };
    if (o.gl_posted_revenue_cents !== undefined) {
      point.gl_posted_revenue_cents = num(o.gl_posted_revenue_cents);
    }
    return [point];
  });

  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const status =
    obj?.status === "ok" || obj?.status === "empty" || obj?.status === "unverifiable" ? obj.status : undefined;
  return {
    days,
    status,
    basis: obj?.basis && typeof obj.basis === "object" ? (obj.basis as HomeWeeklyRevenueResult["basis"]) : undefined,
    invoice_basis_cents: obj?.invoice_basis_cents !== undefined ? num(obj.invoice_basis_cents) : undefined,
    gl_posted_revenue_cents: obj?.gl_posted_revenue_cents !== undefined ? num(obj.gl_posted_revenue_cents) : undefined,
    discrepancy_count: obj?.discrepancy_count !== undefined ? num(obj.discrepancy_count) : undefined,
    discrepancy_cents: obj?.discrepancy_cents !== undefined ? num(obj.discrepancy_cents) : undefined,
  };
}

async function fetchWeeklyRevenueRaw(companyId: string, days: number): Promise<unknown> {
  const path = withCompany(`/api/v1/home/weekly-revenue?days=${encodeURIComponent(String(days))}`, companyId);
  try {
    return await apiRequest<unknown>(path);
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 422 &&
      err.data &&
      typeof err.data === "object" &&
      (err.data as { error?: string }).error === "revenue_gl_linkage_unverifiable"
    ) {
      return {
        ...(err.data as Record<string, unknown>),
        status: "unverifiable",
        days: [],
        revenue_cents: null,
      };
    }
    throw err;
  }
}

export async function fetchHomeWeeklyRevenue(companyId: string, days = 7): Promise<HomeWeeklyRevenuePoint[]> {
  return coerceWeeklyRevenue(await fetchWeeklyRevenueRaw(companyId, days)).days;
}

/** Full weekly payload including dual-basis / discrepancy metadata (0280-02). */
export async function fetchHomeWeeklyRevenueDetailed(companyId: string, days = 7): Promise<HomeWeeklyRevenueResult> {
  return coerceWeeklyRevenue(await fetchWeeklyRevenueRaw(companyId, days));
}

const WO_STATUSES = ["draft", "open", "in_progress", "awaiting_parts", "completed", "cancelled"] as const;

function coerceWoStatusCounts(raw: unknown): HomeWoStatusCount[] {
  const map = new Map<string, number>();
  if (Array.isArray(raw) || (raw && typeof raw === "object" && Array.isArray((raw as { rows?: unknown }).rows))) {
    // array / { rows: [...] } shape with { status, count } rows.
    const list = Array.isArray(raw) ? raw : ((raw as { rows: unknown[] }).rows ?? []);
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const status = typeof o.status === "string" ? o.status.toLowerCase() : "";
      if (status) map.set(status, num(o.count));
    }
  } else if (raw && typeof raw === "object") {
    // Backend (home-widgets) returns a keyed object: { draft, open, in_progress, awaiting_parts,
    // completed, cancelled, unknown }. Read each known bucket directly.
    const o = raw as Record<string, unknown>;
    for (const status of WO_STATUSES) {
      if (o[status] !== undefined) map.set(status, num(o[status]));
    }
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

// ACCT-R-07 (0280-42-wo-to-expense-flow): per-status-bucket linked bill/expense economics —
// additive sibling to HomeWoStatusCount so the WO status widget can show whether a bucket's work
// orders actually flowed into accounting (accounting.bills / accounting.expenses via the
// canonical linked_work_order_uuid FK), not just the raw WO count.
export type HomeWoLinkedEconomicsBucket = {
  bill_count: number;
  bill_amount_cents: number;
  expense_count: number;
  expense_amount_cents: number;
};

export type HomeWoLinkedEconomicsBuckets = Record<
  "draft" | "open" | "in_progress" | "awaiting_parts" | "completed" | "cancelled" | "unknown",
  HomeWoLinkedEconomicsBucket
>;

export type HomeWoLinkedEconomics =
  | {
      status: "ok";
      buckets: HomeWoLinkedEconomicsBuckets;
      wo_with_expense_flow_count: number;
      total_linked_bill_amount_cents: number;
      total_linked_expense_amount_cents: number;
    }
  | { status: "unverifiable"; unverifiable_reason: string };

const WO_LINKED_ECONOMICS_BUCKET_KEYS = [...WO_STATUSES, "unknown"] as const;

function emptyLinkedEconomicsBucket(): HomeWoLinkedEconomicsBucket {
  return { bill_count: 0, bill_amount_cents: 0, expense_count: 0, expense_amount_cents: 0 };
}

function coerceWoLinkedEconomics(raw: unknown): HomeWoLinkedEconomics {
  if (!raw || typeof raw !== "object") {
    return { status: "unverifiable", unverifiable_reason: "wo_linked_economics_missing_from_response" };
  }
  const o = raw as Record<string, unknown>;
  if (o.status === "unverifiable") {
    return {
      status: "unverifiable",
      unverifiable_reason: typeof o.unverifiable_reason === "string" ? o.unverifiable_reason : "unknown",
    };
  }
  if (o.status !== "ok" || !o.buckets || typeof o.buckets !== "object") {
    return { status: "unverifiable", unverifiable_reason: "wo_linked_economics_shape_unrecognized" };
  }
  const rawBuckets = o.buckets as Record<string, unknown>;
  const buckets = {} as HomeWoLinkedEconomicsBuckets;
  for (const key of WO_LINKED_ECONOMICS_BUCKET_KEYS) {
    const b = rawBuckets[key];
    if (!b || typeof b !== "object") {
      buckets[key] = emptyLinkedEconomicsBucket();
      continue;
    }
    const bo = b as Record<string, unknown>;
    buckets[key] = {
      bill_count: num(bo.bill_count),
      bill_amount_cents: num(bo.bill_amount_cents),
      expense_count: num(bo.expense_count),
      expense_amount_cents: num(bo.expense_amount_cents),
    };
  }
  return {
    status: "ok",
    buckets,
    wo_with_expense_flow_count: num(o.wo_with_expense_flow_count),
    total_linked_bill_amount_cents: num(o.total_linked_bill_amount_cents),
    total_linked_expense_amount_cents: num(o.total_linked_expense_amount_cents),
  };
}

/** Single-fetch variant returning both the WO status counts AND their linked accounting economics. */
export async function fetchHomeWoStatusCountsDetailed(
  companyId: string
): Promise<{ counts: HomeWoStatusCount[]; linked_economics: HomeWoLinkedEconomics }> {
  const raw = await apiRequest<unknown>(withCompany("/api/v1/home/wo-status-counts", companyId));
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    counts: coerceWoStatusCounts(raw),
    linked_economics: coerceWoLinkedEconomics(o.linked_economics),
  };
}

export async function fetchHomeFleetUtilization(companyId: string): Promise<HomeFleetUtilization> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/home/fleet-utilization", companyId));
  return {
    active_units: num(raw.active_units),
    total_units: num(raw.total_units),
    percentage: num(raw.percentage),
  };
}

export async function fetchDriverDaySummary(companyId: string, date: string): Promise<HomeDriverDaySummaryResult> {
  const path = withCompany(`/api/v1/telematics/driver-day-summary?date=${encodeURIComponent(date)}`, companyId);
  const raw = await apiRequest<unknown>(path);
  const parsed = homeDriverDaySummaryResponseSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  if (raw && typeof raw === "object") {
    const legacy = raw as { date?: unknown; rows?: unknown };
    const rows = Array.isArray(legacy.rows) ? legacy.rows : [];
    const normalizedRows = rows
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        const driverId = String(row.driver_id ?? "");
        if (!driverId) return null;
        return {
          driver_id: driverId,
          driver_name: String(row.driver_name ?? "Unknown driver"),
          miles: num(row.miles),
          hours_on_duty: num(row.hours_on_duty),
          fuel_stops: num(row.fuel_stops),
          on_time_arrivals: num(row.on_time_arrivals),
          late_arrivals: num(row.late_arrivals),
        };
      })
      .filter((row): row is HomeDriverDaySummaryRow => Boolean(row));
    return {
      date: typeof legacy.date === "string" ? legacy.date : date,
      has_data: normalizedRows.length > 0,
      rows: normalizedRows,
    };
  }

  throw new ApiError(500, { error: "invalid_response", message: "Driver day summary response shape mismatch" });
}

// ─── GAP-65: Owner Today's Attention API ─────────────────────────────────────

export type OwnerAttentionItemSeverity = "info" | "warning" | "error" | "critical";

export type OwnerAttentionItem = {
  id: string;
  item_id: string;
  source: string;
  score: number;
  title: string;
  body: string;
  action_url: string;
  action_label: string;
  severity: OwnerAttentionItemSeverity;
  extra: Record<string, unknown>;
  dismissed: boolean;
  computed_at: string | null;
};

export type OwnerTodaysAttentionResult = {
  items: OwnerAttentionItem[];
  computed_at: string | null;
  source: "snapshot" | "no_snapshot" | "error";
};

function normalizeAttentionSeverity(raw: unknown): OwnerAttentionItemSeverity {
  if (raw === "critical" || raw === "error" || raw === "warning") return raw;
  return "info";
}

function normalizeOwnerAttentionItem(raw: unknown): OwnerAttentionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    id: typeof o.id === "string" ? o.id : "",
    item_id: typeof o.item_id === "string" ? o.item_id : "",
    source: typeof o.source === "string" ? o.source : "",
    score: num(o.score),
    title: typeof o.title === "string" ? o.title : "Attention item",
    body: typeof o.body === "string" ? o.body : "",
    action_url: typeof o.action_url === "string" ? o.action_url : "/",
    action_label: typeof o.action_label === "string" ? o.action_label : "View",
    severity: normalizeAttentionSeverity(o.severity),
    extra: o.extra && typeof o.extra === "object" && !Array.isArray(o.extra)
      ? (o.extra as Record<string, unknown>)
      : {},
    dismissed: Boolean(o.dismissed),
    computed_at: typeof o.computed_at === "string" ? o.computed_at : null,
  };
}

export async function fetchOwnerTodaysAttention(companyId: string): Promise<OwnerTodaysAttentionResult> {
  const payload = await apiRequest<Record<string, unknown>>(
    withCompany("/api/v1/owner/todays-attention", companyId)
  );
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems
    .map(normalizeOwnerAttentionItem)
    .filter((x): x is OwnerAttentionItem => x !== null);
  return {
    items,
    computed_at: typeof payload.computed_at === "string" ? payload.computed_at : null,
    source: (payload.source as "snapshot" | "no_snapshot" | "error") ?? "snapshot",
  };
}

export async function dismissOwnerAttentionItem(
  companyId: string,
  itemId: string
): Promise<{ ok: boolean; item_id: string; dismissed: boolean }> {
  return apiRequest<{ ok: boolean; item_id: string; dismissed: boolean }>(
    `/api/v1/owner/todays-attention/dismiss/${encodeURIComponent(itemId)}`,
    {
      method: "POST",
      body: { operating_company_id: companyId },
    }
  );
}

// ─── GAP-68 Safety Officer role home ─────────────────────────────────────────

export type SafetyOfficerAlert = {
  alert_id: string;
  source: string;
  severity: HomeAttentionSeverity;
  title: string;
  body: string;
  count: number;
  action_url: string;
  action_label: string;
};

export type SafetyOfficerRoleHomeResult = {
  kpis: {
    open_dvir_major_defects: number;
    hos_violations_today: number;
    expiring_certs_30d: number;
    open_accidents_7d: number;
    pending_da_draws: number;
    open_workers_comp_claims: number;
  };
  alerts: SafetyOfficerAlert[];
  cert_data_stale: boolean;
  computed_at: string;
};

function normalizeSafetyAlert(raw: unknown): SafetyOfficerAlert | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    alert_id: typeof o.alert_id === "string" ? o.alert_id : "",
    source: typeof o.source === "string" ? o.source : "",
    severity: normalizeAttentionSeverity(o.severity),
    title: typeof o.title === "string" ? o.title : "Safety alert",
    body: typeof o.body === "string" ? o.body : "",
    count: num(o.count),
    action_url: typeof o.action_url === "string" ? o.action_url : "/safety",
    action_label: typeof o.action_label === "string" ? o.action_label : "View",
  };
}

export async function fetchSafetyOfficerRoleHome(companyId: string): Promise<SafetyOfficerRoleHomeResult> {
  const payload = await apiRequest<Record<string, unknown>>(
    withCompany("/api/safety-officer/role-home", companyId)
  );
  const kpisRaw = payload.kpis && typeof payload.kpis === "object" ? (payload.kpis as Record<string, unknown>) : {};
  const rawAlerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  return {
    kpis: {
      open_dvir_major_defects: num(kpisRaw.open_dvir_major_defects),
      hos_violations_today: num(kpisRaw.hos_violations_today),
      expiring_certs_30d: num(kpisRaw.expiring_certs_30d),
      open_accidents_7d: num(kpisRaw.open_accidents_7d),
      pending_da_draws: num(kpisRaw.pending_da_draws),
      open_workers_comp_claims: num(kpisRaw.open_workers_comp_claims),
    },
    alerts: rawAlerts.map(normalizeSafetyAlert).filter((x): x is SafetyOfficerAlert => x !== null),
    cert_data_stale: Boolean(payload.cert_data_stale),
    computed_at: typeof payload.computed_at === "string" ? payload.computed_at : new Date().toISOString(),
  };
}
