import { Bell, ChevronDown, Menu } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getQboConnectionStatus, getQboAuthorizeStartUrl } from "../api/forensic";
import { getQboSyncHealth } from "../api/qbo-integration";
import { getSamsaraHealth } from "../api/samsara";
import { signOut } from "../api/identity";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";
import { colors, spacing, typography } from "../design/tokens";
import type { AuthMeResponse } from "../types/api";
import { CompanySwitcher } from "./CompanySwitcher";
import { PageHelpLink } from "./PageHelpLink";
import { useToast } from "./Toast";
import { useCompanyContext } from "../contexts/CompanyContext";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import { qboConnectionLabel, RELAY_NOT_CONFIGURED, resolveSamsaraVisualStatus } from "../lib/integration-telematics-status";

type Props = {
  auth: AuthMeResponse["user"];
  onOpenMobileNav?: () => void;
};

function formatNow(now: Date): string {
  return now.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function topbarDotClass(dot: "gray" | "green" | "yellow" | "red"): string {
  if (dot === "green") return "bg-emerald-500";
  if (dot === "yellow") return "bg-amber-400";
  if (dot === "red") return "bg-red-500";
  return "bg-slate-500";
}

export function Topbar({ auth, onOpenMobileNav }: Props) {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const emailLabel = auth.email ?? "Phone login";
  const { selectedCompanyId, selectedCompany } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const companyLabel = selectedCompany?.short_name?.trim() || selectedCompany?.legal_name?.trim() || "";
  const office = auth.role !== "Driver";
  const prevQboSyncStatus = useRef<string | null>(null);

  const samsaraQuery = useQuery({
    queryKey: ["integrations", "samsara", "health", companyId],
    queryFn: () => getSamsaraHealth(companyId),
    enabled: Boolean(companyId) && office,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const qboQuery = useQuery({
    queryKey: ["integrations", "qbo", "status", companyId],
    queryFn: () => getQboConnectionStatus(companyId),
    enabled: Boolean(companyId) && office,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const qboSyncHealthQuery = useQuery({
    queryKey: ["qbo", "sync-health", companyId],
    queryFn: () => getQboSyncHealth(companyId),
    enabled: Boolean(companyId) && office,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const notifDropdownQuery = useQuery({
    queryKey: ["notifications", "dropdown", companyId],
    queryFn: () => listNotifications(companyId, { limit: 10 }),
    enabled: Boolean(companyId) && office,
    staleTime: 15_000,
    refetchInterval: 45_000,
  });

  useRealtimeChannel({
    enabled: Boolean(companyId) && office,
    topics: [`company:${companyId}:notifications`],
    onMessage: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  useEffect(() => {
    const next = qboSyncHealthQuery.data?.status;
    if (next === undefined) return;
    const prev = prevQboSyncStatus.current;
    if (prev !== null && prev !== next) {
      console.log("[qbo-sync-health]", `${prev} -> ${next}`);
    }
    prevQboSyncStatus.current = next;
  }, [qboSyncHealthQuery.data?.status]);

  const samsaraVis = resolveSamsaraVisualStatus(samsaraQuery.data);
  const qboVis = qboConnectionLabel(qboQuery.data?.connected);
  const relayVis = RELAY_NOT_CONFIGURED;

  const qboSyncPill = useMemo(() => {
    if (qboSyncHealthQuery.isError) return null;
    const row = qboSyncHealthQuery.data;
    if (!row) return null;
    const status = row.status;
    const companySuffix = companyLabel ? ` · ${companyLabel}` : "";
    let dot: "gray" | "green" | "yellow" | "red" = "gray";
    let label = `QBO sync${companySuffix}`;
    if (status === "healthy") {
      dot = "green";
      label = `QBO sync · OK${companySuffix}${row.pending_count ? ` · ${row.pending_count} pending` : ""}`;
    } else if (status === "syncing") {
      dot = "yellow";
      label = `QBO sync · Running${companySuffix}${row.pending_count ? ` · ${row.pending_count} pending` : ""}`;
    } else if (status === "stale") {
      dot = "yellow";
      label = `QBO sync · Stale${row.pending_count ? ` · ${row.pending_count} pending` : ""}`;
    } else if (status === "error") {
      dot = "red";
      label = `QBO sync · Error${companySuffix}${row.error_count ? ` (${row.error_count})` : ""}`;
    }
    return { dot, label, status, needsReconnect: Boolean(row.needs_reconnect), reconnectReason: row.reconnect_reason ?? null };
  }, [qboSyncHealthQuery.data, qboSyncHealthQuery.isError, companyLabel]);

  const muted = colors.sidebarTextMuted;
  const active = colors.sidebarTextActive;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = useMemo(() => formatNow(now), [now]);

  return (
    <header
      className="top-bar grid items-center border-b"
      style={{
        gridTemplateColumns: "1fr auto 1fr",
        height: spacing.topbarHeight,
        backgroundColor: colors.topbarBg,
        borderBottomColor: colors.sidebarBorder,
        padding: `${spacing.topbarPaddingY}px ${spacing.topbarPaddingX}px`,
      }}
    >
      <div className="flex items-center gap-2">
        {onOpenMobileNav ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded border text-white hover:bg-white/10 md:hidden"
            style={{ borderColor: colors.sidebarBorder }}
            aria-label="Open navigation menu"
            onClick={onOpenMobileNav}
          >
            <Menu className="h-4 w-4" />
          </button>
        ) : null}
        <div className="flex items-center gap-2 font-medium uppercase" style={{ fontSize: 13, color: colors.sidebarTextActive }}>
          IH 35 Dispatch
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <div
          className="flex max-w-[min(560px,92vw)] flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full px-2 py-0.5 text-[12px]"
          style={{ backgroundColor: "#151A24", color: muted }}
        >
          <span className="inline-flex items-center gap-1" style={{ color: active }}>
            <span className={`inline-block h-2 w-2 rounded-full ${topbarDotClass(qboVis.dot)}`} />
            {qboVis.label}
          </span>
          <span style={{ color: muted }}>·</span>
          <span className="inline-flex items-center gap-1" style={{ color: active }} title={samsaraVis.title}>
            <span className={`inline-block h-2 w-2 rounded-full ${topbarDotClass(samsaraVis.dot)}`} />
            {samsaraVis.label}
          </span>
          <span style={{ color: muted }}>·</span>
          <span className="inline-flex items-center gap-1" style={{ color: active }}>
            <span className={`inline-block h-2 w-2 rounded-full ${topbarDotClass(relayVis.dot)}`} />
            {relayVis.label}
          </span>
          {qboSyncPill ? (
            <>
              <span style={{ color: muted }}>·</span>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 underline-offset-2 hover:underline"
                style={{ color: active }}
                title="Open QBO sync dashboard"
                onClick={() => navigate("/qbo/sync-dashboard")}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${topbarDotClass(qboSyncPill.dot)}`} />
                {qboSyncPill.label}
              </button>
              {qboSyncPill.needsReconnect && companyId ? (
                <button
                  type="button"
                  className="ml-1 rounded-full border border-amber-400/60 px-2 py-0.5 text-[11px] font-semibold text-amber-100 hover:bg-amber-400/10"
                  onClick={() => {
                    window.location.href = getQboAuthorizeStartUrl(companyId);
                  }}
                >
                  Reconnect QuickBooks
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        <CompanySwitcher />
      </div>

      <div className="relative flex items-center justify-end gap-2 text-sm text-gray-700">
        {office && companyId ? (
          <div className="relative">
            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center rounded border hover:bg-white/10"
              style={{ borderColor: colors.sidebarBorder, color: colors.sidebarTextActive }}
              aria-label="Notifications"
              onClick={() => setNotifOpen((o) => !o)}
            >
              <Bell className="h-4 w-4" />
              {(notifDropdownQuery.data?.unread_count ?? 0) > 0 ? (
                <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500" />
              ) : null}
            </button>
            {notifOpen ? (
              <div className="absolute right-0 top-9 z-40 max-h-96 w-80 overflow-y-auto rounded border border-gray-200 bg-white p-2 text-left text-xs shadow">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-800">Notifications</span>
                  <button
                    type="button"
                    className="text-[11px] text-sky-700 underline"
                    onClick={() => {
                      void (async () => {
                        await markAllNotificationsRead(companyId);
                        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
                      })();
                    }}
                  >
                    Mark all read
                  </button>
                </div>
                {(notifDropdownQuery.data?.notifications ?? []).length === 0 ? (
                  <p className="py-2 text-gray-500">No notifications.</p>
                ) : (
                  (notifDropdownQuery.data?.notifications ?? []).map((n) => (
                    <div key={n.id} className={`border-b border-gray-100 py-2 last:border-0 ${n.read_at ? "" : "bg-sky-50/60"}`}>
                      <div className="font-medium text-gray-900">{n.title}</div>
                      <div className="text-gray-600">{n.body}</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {n.href ? (
                          <Link
                            to={n.href}
                            className="text-sky-700 underline"
                            onClick={() => {
                              setNotifOpen(false);
                              if (!n.read_at) {
                                void markNotificationRead(n.id, companyId).then(() =>
                                  queryClient.invalidateQueries({ queryKey: ["notifications"] })
                                );
                              }
                            }}
                          >
                            Open
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
                <Link
                  className="mt-2 block text-center text-[11px] font-semibold text-sky-700 underline"
                  to="/notifications"
                  onClick={() => setNotifOpen(false)}
                >
                  See all
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
        {office ? <PageHelpLink /> : null}
        <span style={{ fontSize: typography.pageSubtitle, color: colors.sidebarTextMuted }}>{dateLabel}</span>
        <button
          type="button"
          className="flex h-7 items-center gap-1 rounded border px-2 hover:bg-white/10"
          style={{ borderColor: colors.sidebarBorder, color: colors.sidebarTextActive, fontSize: typography.pageSubtitle }}
          onClick={() => setOpen((current) => !current)}
        >
          {emailLabel}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open ? (
          <div className="absolute right-0 top-8 z-30 w-40 rounded border border-gray-200 bg-white p-1 shadow" style={{ zIndex: 30 }}>
            <button
              type="button"
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100"
              onClick={() => {
                setOpen(false);
                pushToast("Profile page coming next phase");
              }}
            >
              Profile
            </button>
            <button
              type="button"
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100"
              onClick={async () => {
                setOpen(false);
                try {
                  await signOut(window.location.origin);
                } catch {
                  pushToast("Sign out failed, redirecting to login", "info");
                } finally {
                  queryClient.removeQueries({ queryKey: ["auth", "me"] });
                  window.location.href = "/login";
                }
              }}
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
