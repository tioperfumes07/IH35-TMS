import { ChevronDown, Menu, Plus, ClipboardList, LayoutGrid } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getQboConnectionStatus, getQboAuthorizeStartUrl } from "../api/forensic";
import { getQboSyncHealth, postQboMasterDataSyncTriggerFull } from "../api/qbo-integration";
import { getRelayHealth } from "../api/relay";
import { getSamsaraHealth } from "../api/samsara";
import { signOut } from "../api/identity";
import { colors, spacing, typography } from "../design/tokens";
import { companyOperatingChipClasses } from "../lib/company-branding";
import { selectedCompanyLegalBadgeLabel } from "../lib/selected-company-label";
import type { AuthMeResponse } from "../types/api";
import { CarrierSwitcher } from "./layout/CarrierSwitcher";
import { TopStatusBar } from "./layout/TopStatusBar";
import { NotificationBell } from "./notifications/NotificationBell";
import { PageHelpLink } from "./PageHelpLink";
import { useToast } from "./Toast";
import { useCompanyContext } from "../contexts/CompanyContext";
import { qboConnectionLabel, resolveRelayVisualStatus, resolveSamsaraVisualStatus } from "../lib/integration-telematics-status";
import { effectiveQboLastSuccessAt, formatQboLastSuccessLabel } from "../lib/qbo-sync-last-success-label";
import { LocaleSwitcher } from "../i18n/locale-switcher";
import { useTranslation } from "../hooks/useTranslation";

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

export function Topbar({ auth, onOpenMobileNav }: Props) {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!createMenuRef.current?.contains(e.target as Node)) setCreateOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const emailLabel = auth.email ?? t("common.phone_login", "Phone login");
  const { selectedCompanyId, selectedCompany } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const companyLabel = selectedCompany?.short_name?.trim() || selectedCompany?.legal_name?.trim() || "";
  const qboAvailable = selectedCompany?.code === "TRANSP";
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
    enabled: Boolean(companyId) && office && qboAvailable,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const relayQuery = useQuery({
    queryKey: ["integrations", "relay", "health", companyId],
    queryFn: () => getRelayHealth(companyId),
    enabled: Boolean(companyId) && office,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const qboSyncHealthQuery = useQuery({
    queryKey: ["qbo", "sync-health", companyId],
    queryFn: () => getQboSyncHealth(companyId),
    enabled: Boolean(companyId) && office && qboAvailable,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const qboSyncNowMutation = useMutation({
    mutationFn: () => postQboMasterDataSyncTriggerFull(companyId),
    onSuccess: () => {
      pushToast(t("topbar.qbo_sync_now_started", "QBO sync started — refresh in a minute"), "success");
      void queryClient.invalidateQueries({ queryKey: ["qbo", "sync-health", companyId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("403") || msg.toLowerCase().includes("forbidden")) {
        pushToast(t("topbar.qbo_sync_now_owner_only", "Sync now requires Owner role"), "error");
        return;
      }
      pushToast(t("topbar.qbo_sync_now_failed", "Could not start QBO sync"), "error");
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
  const relayVis = resolveRelayVisualStatus(relayQuery.data);

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
    return {
      dot,
      label,
      status,
      needsReconnect: Boolean(row.needs_reconnect),
      reconnectReason: row.reconnect_reason ?? null,
      lastSuccessLabel: formatQboLastSuccessLabel(
        effectiveQboLastSuccessAt(row.last_successful_sync_at, row.master_data_last_success_at)
      ),
    };
  }, [qboSyncHealthQuery.data, qboSyncHealthQuery.isError, companyLabel]);

  const qboErrorBannerMessage = useMemo(() => {
    if (!qboSyncPill || qboSyncPill.status !== "error") return null;
    const row = qboSyncHealthQuery.data as Record<string, unknown> | undefined;
    const parts: string[] = [];
    if (qboSyncPill.reconnectReason) parts.push(t("topbar.reason", "Reason: {{value}}", { value: qboSyncPill.reconnectReason }));
    if (typeof row?.error_count === "number") parts.push(t("topbar.errors", "Errors: {{value}}", { value: row.error_count }));
    if (typeof row?.pending_count === "number") parts.push(t("topbar.pending", "Pending: {{value}}", { value: row.pending_count }));
    if (row?.last_failed_sync_at) parts.push(t("topbar.last_failed", "Last failed: {{value}}", { value: new Date(String(row.last_failed_sync_at)).toLocaleString() }));
    return parts.join(" · ");
  }, [qboSyncPill, qboSyncHealthQuery.data, t]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = useMemo(() => formatNow(now), [now]);

  const legalNameChip = selectedCompanyLegalBadgeLabel(selectedCompany);

  const chipClass = companyOperatingChipClasses(selectedCompany?.legal_name ?? null, selectedCompany?.code ?? null);

  return (
    <div className="border-b" style={{ borderBottomColor: colors.sidebarBorder, backgroundColor: colors.topbarBg }}>
      <header
        className="top-bar grid items-center gap-x-3"
        style={{
          // Desktop 3-col + ≤1279 stack live in responsive-breakpoints.css (NOT inline
          // gridTemplateColumns). Inline tracks beat Tailwind max-xl:grid-cols-1 and caused
          // LV-TOPBAR-RESPONSIVE-HORIZONTAL-CLIP at ~697px: switcher truncated after "Current:"
          // and Create/Tasks/… were clipped by body overflow-x:hidden.
          minHeight: spacing.topbarHeight,
          padding: `${spacing.topbarPaddingY}px ${spacing.topbarPaddingX}px`,
        }}
      >
      {/* min-w-0 is REQUIRED on the grid item itself, not only on the inner flex row. A grid item
          defaults to min-width:auto, so it refuses to shrink below its content and OVERFLOWS its
          1fr column — which is why the entity chip ("IH 35 Transportation LLC") rendered underneath
          the Tasks and Program buttons on every page. The inner div already had min-w-0; that alone
          cannot help, because the overflow happens one level up. */}
      <div className="flex min-w-0 items-center gap-2">
        {onOpenMobileNav ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border text-white hover:bg-white/10 md:hidden"
            style={{ borderColor: colors.sidebarBorder }}
            aria-label={t("common.open_navigation_menu", "Open navigation menu")}
            onClick={onOpenMobileNav}
          >
            <Menu className="h-4 w-4" />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-2 font-medium uppercase" style={{ fontSize: 13, color: colors.sidebarTextActive }}>
          {t("common.app_name", "IH 35 Dispatch")}
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          {office && legalNameChip ? (
            <span
              className={`max-w-[min(280px,42vw)] truncate rounded-sm px-2 py-0.5 text-[10px] font-semibold normal-case leading-tight ${chipClass}`}
              title={legalNameChip}
            >
              {legalNameChip}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
        <TopStatusBar
          qboAvailable={qboAvailable}
          qboVis={qboVis}
          samsaraVis={samsaraVis}
          relayVis={relayVis}
          qboSyncPill={qboSyncPill}
          onOpenQboSyncDashboard={() => navigate("/qbo/sync-dashboard")}
          onReconnectQbo={() => {
            if (companyId) window.location.href = getQboAuthorizeStartUrl(companyId);
          }}
          onSyncNow={() => {
            if (!companyId || qboSyncNowMutation.isPending) return;
            qboSyncNowMutation.mutate();
          }}
          syncNowPending={qboSyncNowMutation.isPending}
        />
        <CarrierSwitcher />
      </div>

      {/* Same reason as the left column: without min-w-0 this item cannot shrink and the action
          buttons collide with the centre status bar at narrow widths. */}
      <div className="relative flex min-w-0 flex-wrap items-center justify-end gap-2 text-sm text-gray-700">
        {office ? (
          <div ref={createMenuRef} className="relative">
            <button
              type="button"
              aria-label={t("topbar.global_create", "+ Create")}
              className="flex h-7 items-center gap-1 rounded-sm border px-2 font-semibold hover:bg-white/10"
              style={{ borderColor: "#16A34A", backgroundColor: "#16A34A", color: "#ffffff", fontSize: 12 }}
              onClick={() => setCreateOpen((v) => !v)}
            >
              <Plus className="h-3 w-3" />
              {t("topbar.create", "Create")}
            </button>
            {createOpen ? (
              <div
                className="absolute right-0 z-30 mt-1 min-w-[200px] rounded-sm border border-gray-200 bg-white py-1 shadow-lg"
                data-testid="global-create-menu"
              >
                {([
                  [t("topbar.create_customer", "Customer"), "/customers?create=1"],
                  [t("topbar.create_invoice", "Invoice"), "/accounting/invoices?create=1"],
                  [t("topbar.create_bill", "Bill"), "/accounting/bills/vendor?create=1"],
                  [t("topbar.create_expense", "Expense"), "/accounting/expenses?create=1"],
                  [t("topbar.create_receive_payment", "Receive payment"), "/accounting/payments?create=1"],
                  [t("topbar.create_journal_entry", "Journal entry"), "/accounting/journal-entries?create=1"],
                  [t("topbar.create_bill_payment", "Bill payment"), "/accounting/bill-payments?create=1"],
                ] as [string, string][]).map(([label, to]) => (
                  <button
                    key={to}
                    type="button"
                    className="block w-full px-4 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                    onClick={() => { setCreateOpen(false); navigate(to); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {office ? (
          <button
            type="button"
            aria-label={t("topbar.tasks", "Tasks")}
            className="flex h-7 items-center gap-1 rounded-sm border px-2 hover:bg-white/10"
            style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.75)", fontSize: 12 }}
            onClick={() => navigate("/tasks")}
          >
            <ClipboardList className="h-3 w-3" />
            {t("topbar.tasks", "Tasks")}
          </button>
        ) : null}
        {office ? (
          <button
            type="button"
            aria-label={t("topbar.program", "Program Board")}
            className="flex h-7 items-center gap-1 rounded-sm border px-2 hover:bg-white/10"
            style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.75)", fontSize: 12 }}
            onClick={() => navigate("/program")}
          >
            <LayoutGrid className="h-3 w-3" />
            {t("topbar.program", "Program")}
          </button>
        ) : null}
        {office ? <LocaleSwitcher /> : null}
        {office ? <PageHelpLink /> : null}
        {office ? <NotificationBell /> : null}
        <span
          className="top-bar-date-label"
          style={{ fontSize: typography.pageSubtitle, color: colors.sidebarTextMuted }}
        >
          {dateLabel}
        </span>
        <button
          type="button"
          className="flex h-7 items-center gap-1 rounded-sm border px-2 hover:bg-white/10"
          style={{ borderColor: colors.sidebarBorder, color: colors.sidebarTextActive, fontSize: typography.pageSubtitle }}
          onClick={() => setOpen((current) => !current)}
        >
          {emailLabel}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open ? (
          <div className="absolute right-0 top-8 z-30 w-40 rounded-sm border border-gray-200 bg-white p-1 shadow-sm" style={{ zIndex: 30 }}>
            <button
              type="button"
              className="block w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-gray-100"
              onClick={() => {
                setOpen(false);
                navigate("/settings");
              }}
            >
              {t("common.profile", "Profile")}
            </button>
            {auth.role === "Owner" || auth.role === "Administrator" || auth.role === "SuperAdmin" ? (
              <button
                type="button"
                className="block w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-gray-100"
                onClick={() => {
                  setOpen(false);
                  navigate("/admin");
                }}
              >
                {t("common.admin", "Admin")}
              </button>
            ) : null}
            <button
              type="button"
              className="block w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-gray-100"
              onClick={async () => {
                setOpen(false);
                try {
                  await signOut(window.location.origin);
                } catch {
                  pushToast(t("topbar.sign_out_failed_redirecting", "Sign out failed, redirecting to login"), "info");
                } finally {
                  queryClient.removeQueries({ queryKey: ["auth", "me"] });
                  window.location.href = "/login";
                }
              }}
            >
              {t("common.sign_out", "Sign out")}
            </button>
          </div>
        ) : null}
      </div>
      </header>
      {qboErrorBannerMessage ? (
        <div className="px-3 pb-2">
          <div className="rounded-sm border border-red-400/60 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            <span className="font-semibold">{t("topbar.qbo_sync_error", "QBO sync error.")}</span> {qboErrorBannerMessage}
            {qboSyncPill?.needsReconnect && companyId ? (
              <button
                type="button"
                className="ml-2 rounded-sm border border-red-300/60 px-2 py-0.5 text-[11px] font-semibold hover:bg-red-500/20"
                onClick={() => {
                  window.location.href = getQboAuthorizeStartUrl(companyId);
                }}
              >
                {t("common.reconnect_now", "Reconnect now")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
