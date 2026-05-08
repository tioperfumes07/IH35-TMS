import { AlertTriangle, FileText, Fuel, Navigation, Settings, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { signOut } from "../api/identity";
import { useAuth } from "../auth/useAuth";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { UploadDocumentModal } from "../components/UploadDocumentModal";
import { HosCell } from "../components/HosCell";
import { InstallPrompt } from "../components/InstallPrompt";
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

export function HomePage() {
  const auth = useAuth();
  const { pushToast } = useToast();
  const { t } = useTranslation();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [onlineStatus, setOnlineStatus] = useState<"online" | "connecting" | "offline">(navigator.onLine ? "connecting" : "offline");

  const driverName = useMemo(() => deriveDriverName(auth.user?.email ?? "driver"), [auth.user?.email]);

  useEffect(() => {
    const unsubscribe = subscribeSyncState((state) => {
      setPendingUploads(state.pendingCount);
      setOnlineStatus(state.onlineStatus);
    });
    return unsubscribe;
  }, []);

  const onlineIndicator = onlineStatus === "online" ? "ONLINE" : onlineStatus === "connecting" ? "CONNECTING" : "OFFLINE";

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-sm text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-20">
        <header className="rounded-xl border border-pwa-border bg-pwa-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-semibold">{driverName}</p>
              <p className="text-sm text-pwa-text-secondary">{t("home.unit")}</p>
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
        </header>

        <PwaCard title={t("home.hos_overview")} subtitle={t("home.hos_subtitle")}>
          <div className="grid grid-cols-2 gap-3">
            <HosCell label="Drive" value="8h 12m" subtitle="of 11h limit" tone="driving" />
            <HosCell label="Shift" value="11h 04m" subtitle="of 14h limit" tone="driving" />
            <HosCell label="70-Hour" value="42h" subtitle="of 70h" tone="driving" />
            <HosCell label="Tank" value="21%" subtitle="refuel alert" tone="violation" />
          </div>
          <div className="mt-3 rounded-lg border border-pwa-border bg-[#1A2030] p-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-pwa-text-secondary">Tank Percentage</div>
            <div className="text-xl font-bold text-pwa-text-primary">21%</div>
          </div>
        </PwaCard>

        <PwaCard title={t("home.active_load")} subtitle={t("home.active_load_subtitle")}>
          <p className="font-medium">Houston, TX → Atlanta, GA</p>
          <p className="mt-1 text-xs text-pwa-text-secondary">{t("home.no_loads_today")}</p>
          <div className="mt-2 inline-flex rounded-full border border-hos-driving/40 bg-hos-driving/10 px-2 py-1 text-xs font-semibold text-hos-driving">
            {t("home.driving")}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <PwaButton className="w-full">{t("home.status")}</PwaButton>
            <PwaButton
              variant="secondary"
              className="w-full"
              onClick={() => window.open("https://maps.google.com/?q=Atlanta,GA", "_blank")}
            >
              <Navigation className="h-4 w-4" />
              {t("home.directions")}
            </PwaButton>
            <PwaButton variant="secondary" className="w-full">{t("home.docs")}</PwaButton>
          </div>
        </PwaCard>

        <PwaCard title={t("home.fuel_recommendation")} subtitle={t("home.fuel_subtitle")}>
          <p className="font-medium">Recommended fuel stop: Pilot #492 — Tyler, TX</p>
          <p className="mt-1 text-pwa-text-secondary">120 mi away · saves $48 vs nearest</p>
          <PwaButton
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => window.open("https://maps.google.com/?q=Pilot+492+Tyler+TX", "_blank")}
          >
            {t("home.navigate")}
          </PwaButton>
        </PwaCard>

        <PwaCard title={t("home.driver_actions")}>
          <div className="grid grid-cols-2 gap-3">
            <PwaButton
              variant="secondary"
              className="min-h-20 flex-col"
              onClick={() => pushToast("Coming in Phase 2")}
              icon={<Truck className="h-5 w-5" />}
            >
              {t("home.pre_trip")}
            </PwaButton>
            <PwaButton
              variant="secondary"
              className="min-h-20 flex-col"
              onClick={() => pushToast("Coming in Phase 2")}
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
          <p className="mt-3 text-xs text-pwa-text-secondary">{t("home.actions_subtitle")}</p>
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
