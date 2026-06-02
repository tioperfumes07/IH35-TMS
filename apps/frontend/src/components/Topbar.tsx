import { ChevronDown, Menu } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getQboConnectionStatus, getQboAuthorizeStartUrl } from "../api/forensic";
import { getQboSyncHealth } from "../api/qbo-integration";
import { getSamsaraHealth } from "../api/samsara";
import { getIdentityCurrentCompany, signOut } from "../api/identity";
import { colors, spacing, typography } from "../design/tokens";
import { companyOperatingChipClasses } from "../lib/company-branding";
import type { AuthMeResponse } from "../types/api";
import { CompanySwitcher } from "./CompanySwitcher";
import { NotificationBell } from "./notifications/NotificationBell";
import { PageHelpLink } from "./PageHelpLink";
import { useToast } from "./Toast";
import { useCompanyContext } from "../contexts/CompanyContext";
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

  const identityCompanyQuery = useQuery({
    queryKey: ["identity", "me", "current-company"],
    queryFn: getIdentityCurrentCompany,
    enabled: office,
    staleTime: 60_000,
  });

  const qboSyncHealthQuery = useQuery({
    queryKey: ["qbo", "sync-health", companyId],
    queryFn: () => getQboSyncHealth(companyId),
    enabled: Boolean(companyId) && office,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
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

  const qboErrorBannerMessage = useMemo(() => {
    if (!qboSyncPill || qboSyncPill.status !== "error") return null;
    const row = qboSyncHealthQuery.data as Record<string, unknown> | undefined;
    const parts: string[] = [];
    if (qboSyncPill.reconnectReason) parts.push(`Reason: ${qboSyncPill.reconnectReason}`);
    if (typeof row?.error_count === "number") parts.push(`Errors: ${row.error_count}`);
    if (typeof row?.pending_count === "number") parts.push(`Pending: ${row.pending_count}`);
    if (row?.last_failed_sync_at) parts.push(`Last failed: ${new Date(String(row.last_failed_sync_at)).toLocaleString()}`);
    return parts.join(" · ");
  }, [qboSyncPill, qboSyncHealthQuery.data]);

  const muted = colors.sidebarTextMuted;
  const active = colors.sidebarTextActive;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = useMemo(() => formatNow(now), [now]);

  const legalNameChip =
    identityCompanyQuery.data?.company_legal_name?.trim() ||
    selectedCompany?.legal_name?.trim() ||
    companyLabel ||
    "";

  const chipClass = companyOperatingChipClasses(
    identityCompanyQuery.data?.company_legal_name ?? selectedCompany?.legal_name ?? null,
    selectedCompany?.code ?? null
  );

  return (
    <div className="border-b" style={{ borderBottomColor: colors.sidebarBorder, backgroundColor: colors.topbarBg }}>
      <header
        className="top-bar grid items-center"
        style={{
          gridTemplateColumns: "1fr auto 1fr",
          minHeight: spacing.topbarHeight,
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
        <div className="flex min-w-0 flex-wrap items-center gap-2 font-medium uppercase" style={{ fontSize: 13, color: colors.sidebarTextActive }}>
          IH 35 Dispatch
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          {office && legalNameChip ? (
            <span
              className={`max-w-[min(280px,42vw)] truncate rounded px-2 py-0.5 text-[10px] font-semibold normal-case leading-tight ${chipClass}`}
              title={legalNameChip}
            >
              {legalNameChip}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-center gap-2">
        <div
          className="flex max-w-[min(640px,94vw)] flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-full px-2 py-1 text-[12px] leading-snug"
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
        {office ? <PageHelpLink /> : null}
        {office ? <NotificationBell /> : null}
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
                navigate("/settings");
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
      {qboErrorBannerMessage ? (
        <div className="px-3 pb-2">
          <div className="rounded border border-red-400/60 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            <span className="font-semibold">QBO sync error.</span> {qboErrorBannerMessage}
            {qboSyncPill?.needsReconnect && companyId ? (
              <button
                type="button"
                className="ml-2 rounded border border-red-300/60 px-2 py-0.5 text-[11px] font-semibold hover:bg-red-500/20"
                onClick={() => {
                  window.location.href = getQboAuthorizeStartUrl(companyId);
                }}
              >
                Reconnect now
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
