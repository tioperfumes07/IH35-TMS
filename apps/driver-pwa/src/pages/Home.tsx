import { AlertTriangle, FileText, Fuel, Navigation, Settings, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { signOut } from "../api/identity";
import { getMyLoadsToday } from "../api/loads";
import { getPwaHosClocks, getRecentFuelTransactions } from "../api/pwa-live";
import { confirmMyTransfer, listMyPendingTransfers, rejectMyTransfer } from "../api/transfers";
import { useAuth } from "../auth/useAuth";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { UploadDocumentModal } from "../components/UploadDocumentModal";
import { HosCell } from "../components/HosCell";
import { InstallPrompt } from "../components/InstallPrompt";
import { LifecyclePill } from "../components/LifecyclePill";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";
import { subscribeSyncState, syncOnce } from "../lib/upload-sync";

function deriveDriverName(email: string): string {
  const base = email.split("@")[0];
  const words = base.split(/[._-]/).filter(Boolean);
  if (words.length === 0) return "Driver";
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function formatMinutes(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function clockLabel(key: string, t: (key: string) => string) {
  if (key === "drive") return t("home.clock_drive");
  if (key === "shift") return t("home.clock_shift");
  if (key === "cycle") return t("home.clock_cycle");
  if (key === "break") return t("home.clock_break");
  return key;
}

function clockTone(key: string, remaining: number, isViolation: boolean): "driving" | "violation" {
  if (isViolation || remaining <= 30) return "violation";
  if (key === "drive") return "driving";
  return "driving";
}

function isActiveLoadStage(stage: string) {
  return stage !== "off_duty" && stage !== "unloaded";
}

export function HomePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { t } = useTranslation();
  const [uploadOpen, setUploadOpen] = useState(false);
  const queryClient = useQueryClient();
  const [pendingUploads, setPendingUploads] = useState(0);
  const [onlineStatus, setOnlineStatus] = useState<"online" | "connecting" | "offline">(navigator.onLine ? "connecting" : "offline");

  const driverName = useMemo(() => deriveDriverName(auth.user?.email ?? "driver"), [auth.user?.email]);
  const hosQuery = useQuery({ queryKey: ["pwa", "home", "hos-clocks"], queryFn: getPwaHosClocks });
  const loadsQuery = useQuery({ queryKey: ["pwa", "home", "loads"], queryFn: getMyLoadsToday });
  const fuelQuery = useQuery({ queryKey: ["pwa", "home", "fuel"], queryFn: getRecentFuelTransactions });
  const pendingTransfersQuery = useQuery({
    queryKey: ["driver-pwa", "pending-transfers"],
    queryFn: listMyPendingTransfers,
  });
  const confirmTransferMutation = useMutation({
    mutationFn: (id: string) => confirmMyTransfer(id),
    onSuccess: () => {
      pushToast("Transfer confirmed", "success");
      void queryClient.invalidateQueries({ queryKey: ["driver-pwa", "pending-transfers"] });
    },
  });
  const rejectTransferMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectMyTransfer(id, reason),
    onSuccess: () => {
      pushToast("Transfer rejected", "info");
      void queryClient.invalidateQueries({ queryKey: ["driver-pwa", "pending-transfers"] });
    },
  });
  const pendingTransfer = pendingTransfersQuery.data?.rows?.[0];
  const activeLoad = (loadsQuery.data ?? []).find((load) => isActiveLoadStage(load.lifecycle_stage)) ?? loadsQuery.data?.[0] ?? null;
  const recentFuel = fuelQuery.data?.[0] ?? null;

  useEffect(() => {
    const unsubscribe = subscribeSyncState((state) => {
      setPendingUploads(state.pendingCount);
      setOnlineStatus(state.onlineStatus);
    });
    return unsubscribe;
  }, []);

  const onlineIndicator = onlineStatus === "online" ? "ONLINE" : onlineStatus === "connecting" ? "CONNECTING" : "OFFLINE";
  const hosData = hosQuery.data;
  const displayClocks = (hosData?.clocks ?? []).filter((clock) => clock.key === "drive" || clock.key === "shift" || clock.key === "cycle");

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-sm text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-20">
        <header className="rounded-xl border border-pwa-border bg-pwa-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-semibold">{driverName}</p>
              <p className="text-sm text-pwa-text-secondary">{activeLoad?.equipment ?? t("home.no_unit_assigned")}</p>
              <p className="mt-1 text-xs text-pwa-text-secondary">{onlineIndicator === "ONLINE" ? t("common.online") : t("common.offline")}</p>
            </div>
            <Link to="/profile" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-pwa-border">
              <Settings className="h-5 w-5 text-pwa-text-secondary" />
            </Link>
          </div>
          <p className="mt-2 text-sm text-pwa-text-secondary">{t("home.greeting", { name: driverName })}</p>
          <div className="mt-3 flex gap-2">
            <PwaButton className="flex-1" onClick={() => setUploadOpen(true)}>
              {t("home.upload_document")}
            </PwaButton>
            <Link to="/documents" className="flex-1">
              <PwaButton variant="secondary" className="w-full">
                {t("home.my_documents")}
                {pendingUploads > 0 ? ` (${pendingUploads})` : ""}
              </PwaButton>
            </Link>
          </div>
          <Link to="/equipment" className="mt-3 block">
            <PwaButton variant="secondary" className="w-full">
              {t("home.view_equipment")}
            </PwaButton>
          </Link>
          <Link to="/cash-advance" className="mt-3 block">
            <PwaButton variant="secondary" className="w-full">
              {t("home.cash_advance")}
            </PwaButton>
          </Link>
        </header>
        {pendingTransfer ? (
          <PwaCard title="Equipment Transfer Pending">
            <p className="text-sm">
              {`📦 Equipment transfer pending from ${pendingTransfer.from_driver_id} · expires ${new Date(pendingTransfer.expires_at).toLocaleString()}`}
            </p>
            <p className="mt-1 text-xs text-pwa-text-secondary">{pendingTransfer.transfer_location ?? "No location provided"}</p>
            <div className="mt-2 flex gap-2">
              <PwaButton
                className="flex-1"
                onClick={() => {
                  void confirmTransferMutation.mutateAsync(pendingTransfer.id);
                }}
              >
                Accept
              </PwaButton>
              <PwaButton
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  const reason = window.prompt("Reason for rejection (min 10 chars):", "") ?? "";
                  if (reason.trim().length < 10) {
                    pushToast("Reason must be at least 10 characters", "error");
                    return;
                  }
                  void rejectTransferMutation.mutateAsync({ id: pendingTransfer.id, reason });
                }}
              >
                Reject
              </PwaButton>
            </div>
          </PwaCard>
        ) : null}

        {/* ARCHIVE-not-DELETE: Phase 1 placeholder HOS card replaced by live clocks (A24-11). Sunset: 2026-09-01 */}
        <PwaCard title={t("home.hos_overview")} subtitle={t("home.hos_subtitle_live")}>
          {hosQuery.isLoading ? <p className="text-sm text-pwa-text-secondary">{t("common.loading")}</p> : null}
          {hosQuery.isError ? <p className="text-sm text-hos-violation">{t("common.error")}</p> : null}
          {hosData ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {displayClocks.map((clock) => (
                  <HosCell
                    key={clock.key}
                    label={clockLabel(clock.key, t)}
                    value={formatMinutes(clock.remaining_minutes)}
                    subtitle={t("home.clock_limit", { value: formatMinutes(clock.max_minutes) })}
                    tone={clockTone(clock.key, clock.remaining_minutes, hosData.status.is_in_violation)}
                  />
                ))}
                {hosData.fuel_level_pct !== null ? (
                  <HosCell
                    label={t("home.tank")}
                    value={`${Math.round(hosData.fuel_level_pct)}%`}
                    subtitle={hosData.fuel_level_pct <= 25 ? t("home.refuel_alert") : t("home.tank_ok")}
                    tone={hosData.fuel_level_pct <= 25 ? "violation" : "driving"}
                  />
                ) : null}
              </div>
              {hosData.fuel_level_pct !== null ? (
                <div className="mt-3 rounded-lg border border-pwa-border bg-[#1A2030] p-2 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-pwa-text-secondary">{t("home.tank_percentage")}</div>
                  <div className="text-xl font-bold text-pwa-text-primary">{Math.round(hosData.fuel_level_pct)}%</div>
                </div>
              ) : null}
            </>
          ) : null}
        </PwaCard>

        {/* ARCHIVE-not-DELETE: Phase 1 placeholder load card replaced by live assignment (A24-11). Sunset: 2026-09-01 */}
        <PwaCard title={t("home.active_load")} subtitle={t("home.active_load_subtitle_live")}>
          {loadsQuery.isLoading ? <p className="text-sm text-pwa-text-secondary">{t("common.loading")}</p> : null}
          {!loadsQuery.isLoading && !activeLoad ? <p className="text-sm text-pwa-text-secondary">{t("home.no_loads_today")}</p> : null}
          {activeLoad ? (
            <>
              <p className="font-medium">
                {activeLoad.pickup_location} → {activeLoad.delivery_location}
              </p>
              <p className="mt-1 text-xs text-pwa-text-secondary">{activeLoad.display_id} · {activeLoad.customer_name}</p>
              <div className="mt-2 inline-flex">
                <LifecyclePill stage={activeLoad.lifecycle_stage} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <PwaButton className="w-full" onClick={() => navigate(`/loads/${activeLoad.id}`)}>
                  {t("home.status")}
                </PwaButton>
                <PwaButton
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    const destination = encodeURIComponent(activeLoad.delivery_location);
                    window.open(`https://maps.google.com/?q=${destination}`, "_blank");
                  }}
                >
                  <Navigation className="h-4 w-4" />
                  {t("home.directions")}
                </PwaButton>
                <PwaButton variant="secondary" className="w-full" onClick={() => navigate("/documents")}>
                  {t("home.docs")}
                </PwaButton>
              </div>
            </>
          ) : null}
        </PwaCard>

        {/* ARCHIVE-not-DELETE: Phase 1 placeholder fuel card replaced by live transactions (A24-11). Sunset: 2026-09-01 */}
        <PwaCard title={t("home.fuel_recommendation")} subtitle={t("home.fuel_subtitle_live")}>
          {fuelQuery.isLoading ? <p className="text-sm text-pwa-text-secondary">{t("common.loading")}</p> : null}
          {!fuelQuery.isLoading && !recentFuel ? <p className="text-sm text-pwa-text-secondary">{t("home.no_recent_fuel")}</p> : null}
          {recentFuel ? (
            <>
              <p className="font-medium">
                {recentFuel.vendor_name ?? t("home.fuel_stop")} — {[recentFuel.location_city, recentFuel.location_state].filter(Boolean).join(", ") || t("home.unknown_location")}
              </p>
              <p className="mt-1 text-pwa-text-secondary">
                {recentFuel.gallons !== null ? `${recentFuel.gallons.toFixed(1)} gal · ` : ""}
                ${recentFuel.total_cost.toFixed(2)} · {new Date(recentFuel.transaction_at).toLocaleString()}
              </p>
              {[recentFuel.location_city, recentFuel.location_state].filter(Boolean).length ? (
                <PwaButton
                  variant="secondary"
                  className="mt-3 w-full"
                  onClick={() => {
                    const query = encodeURIComponent([recentFuel.location_city, recentFuel.location_state].filter(Boolean).join(", "));
                    window.open(`https://maps.google.com/?q=${query}`, "_blank");
                  }}
                >
                  {t("home.navigate")}
                </PwaButton>
              ) : null}
            </>
          ) : null}
        </PwaCard>

        <PwaCard title={t("home.driver_actions")}>
          <div className="grid grid-cols-2 gap-3">
            <PwaButton
              variant="secondary"
              className="min-h-20 flex-col"
              onClick={() => {
                if (activeLoad) navigate(`/dvir/pre/${activeLoad.id}`);
                else pushToast(t("home.no_load_for_dvir"), "info");
              }}
              icon={<Truck className="h-5 w-5" />}
            >
              {t("home.pre_trip")}
            </PwaButton>
            <PwaButton
              variant="secondary"
              className="min-h-20 flex-col"
              onClick={() => pushToast(t("home.log_fuel_hint"), "info")}
              icon={<Fuel className="h-5 w-5" />}
            >
              {t("home.log_fuel")}
            </PwaButton>
            <PwaButton
              variant="secondary"
              className="min-h-20 flex-col"
              onClick={() => setUploadOpen(true)}
              icon={<FileText className="h-5 w-5" />}
            >
              {t("home.upload_bol")}
            </PwaButton>
            <PwaButton
              variant="secondary"
              className="min-h-20 flex-col border-hos-violation/50 text-hos-violation"
              onClick={() => {
                window.location.href = "/incident/new";
              }}
              icon={<AlertTriangle className="h-5 w-5" />}
            >
              {t("home.report_issue")}
            </PwaButton>
          </div>
          <p className="mt-3 text-xs text-pwa-text-secondary">{t("home.actions_subtitle_live")}</p>
        </PwaCard>

        <footer className="space-y-2 rounded-xl border border-pwa-border bg-pwa-card p-4 text-xs text-pwa-text-secondary">
          <p>{t("home.backend_version")}: {import.meta.env.VITE_BUILD_COMMIT ? String(import.meta.env.VITE_BUILD_COMMIT) : "dev"}</p>
          <button
            className="text-pwa-text-primary underline"
            type="button"
            onClick={async () => {
              try {
                await signOut(window.location.origin);
              } finally {
                window.location.href = "/login";
              }
            }}
          >
            {t("home.sign_out")}
          </button>
        </footer>
      </div>

      <InstallPrompt />
      <ErrorBoundary>
        <UploadDocumentModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onQueued={() => {
            void syncOnce();
          }}
        />
      </ErrorBoundary>
    </div>
  );
}
