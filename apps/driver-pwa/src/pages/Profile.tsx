import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { signOut } from "../api/identity";
import { getDriverLanguagePreference, updateDriverLanguagePreference } from "../api/preferences";
import { useAuth } from "../auth/useAuth";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";
import { clearByStatus, getQueueSummary } from "../lib/upload-queue";

export function ProfilePage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const { pushToast } = useToast();
  const [queueSummary, setQueueSummary] = useState({
    total: 0,
    pending: 0,
    uploading: 0,
    synced: 0,
    failed: 0,
  });

  useEffect(() => {
    void getQueueSummary().then(setQueueSummary);
  }, []);

  const languageQuery = useQuery({
    queryKey: ["driver", "preferences", "language"],
    queryFn: getDriverLanguagePreference,
  });

  const languageMutation = useMutation({
    mutationFn: (preferredLanguage: "en" | "es") => updateDriverLanguagePreference(preferredLanguage),
    onSuccess: (payload) => {
      void i18n.changeLanguage(payload.preferred_language);
      queryClient.setQueryData(["driver", "preferences", "language"], payload);
    },
    onError: () => pushToast(t("common.error"), "error"),
  });

  useEffect(() => {
    const preferred = languageQuery.data?.preferred_language;
    if (!preferred) return;
    if (!i18n.language.startsWith(preferred)) {
      void i18n.changeLanguage(preferred);
    }
  }, [languageQuery.data?.preferred_language, i18n]);

  async function handleClearFailed() {
    const count = await clearByStatus(["failed"]);
    pushToast(t("profile.cleared_failed", { count }), "success");
    void getQueueSummary().then(setQueueSummary);
  }

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <Link to="/home" className="inline-flex min-h-11 items-center gap-2 text-sm text-pwa-text-secondary">
          <ArrowLeft className="h-4 w-4" />
          {t("profile.back")}
        </Link>
        <PwaCard title={t("profile.title")} subtitle={t("profile.subtitle")}>
          <p className="text-xs text-pwa-text-secondary">{t("profile.signed_in_as")}</p>
          <p className="text-lg font-semibold text-pwa-text-primary">{auth.user?.full_name || auth.user?.email || t("profile.no_name")}</p>
          <p className="mt-1 text-sm text-pwa-text-secondary">{t("profile.role")}: {auth.user?.role ?? "Driver"}</p>
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold text-pwa-text-secondary">{t("profile.language")}</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  languageMutation.mutate("en");
                }}
                className={`min-h-11 rounded border text-sm font-semibold ${
                  (languageQuery.data?.preferred_language ?? i18n.language).startsWith("en")
                    ? "border-white text-white"
                    : "border-pwa-border text-pwa-text-secondary"
                }`}
              >
                {t("profile.language_en")}
              </button>
              <button
                type="button"
                onClick={() => {
                  languageMutation.mutate("es");
                }}
                className={`min-h-11 rounded border text-sm font-semibold ${
                  (languageQuery.data?.preferred_language ?? i18n.language).startsWith("es")
                    ? "border-white text-white"
                    : "border-pwa-border text-pwa-text-secondary"
                }`}
              >
                {t("profile.language_es")}
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <Link to="/earnings" className="min-h-11 rounded border border-pwa-border px-3 py-2 text-sm font-semibold text-pwa-text-secondary">
              Earnings
            </Link>
            <Link to="/hos" className="min-h-11 rounded border border-pwa-border px-3 py-2 text-sm font-semibold text-pwa-text-secondary">
              HOS
            </Link>
            <Link to="/my-disputes" className="min-h-11 rounded border border-pwa-border px-3 py-2 text-sm font-semibold text-pwa-text-secondary">
              My Disputes
            </Link>
            <Link to="/dvir/pre/load-1002" className="min-h-11 rounded border border-pwa-border px-3 py-2 text-sm font-semibold text-pwa-text-secondary">
              Submit DVIR
            </Link>
          </div>
          <PwaButton
            className="mt-4 w-full"
            onClick={async () => {
              try {
                await signOut(window.location.origin);
              } finally {
                queryClient.removeQueries({ queryKey: ["auth", "me"] });
                window.location.href = "/login";
              }
            }}
          >
            {t("profile.sign_out")}
          </PwaButton>
        </PwaCard>
        <PwaCard title={t("profile.upload_queue_title")}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-pwa-text-secondary">
              <span>{t("profile.queue_pending")}</span>
              <span className="font-mono">{queueSummary.pending}</span>
            </div>
            <div className="flex justify-between text-pwa-text-secondary">
              <span>{t("profile.queue_uploading")}</span>
              <span className="font-mono">{queueSummary.uploading}</span>
            </div>
            <div className="flex justify-between text-pwa-text-secondary">
              <span>{t("profile.queue_failed")}</span>
              <span className="font-mono text-hos-violation">{queueSummary.failed}</span>
            </div>
          </div>
          {queueSummary.failed > 0 ? (
            <PwaButton variant="secondary" className="mt-3 w-full" onClick={() => void handleClearFailed()}>
              {t("profile.clear_failed", { count: queueSummary.failed })}
            </PwaButton>
          ) : null}
        </PwaCard>
      </div>
    </div>
  );
}
