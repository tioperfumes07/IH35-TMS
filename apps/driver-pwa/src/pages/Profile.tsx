import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { signOut } from "../api/identity";
import { useAuth } from "../auth/useAuth";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";

export function ProfilePage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <Link to="/home" className="inline-flex min-h-11 items-center gap-2 text-sm text-pwa-text-secondary">
          <ArrowLeft className="h-4 w-4" />
          {t("profile.back")}
        </Link>
        <PwaCard title={t("profile.title")} subtitle={t("profile.subtitle")}>
          <p className="text-xs text-pwa-text-secondary">{t("profile.signed_in_as")}</p>
          <p className="text-lg font-semibold text-pwa-text-primary">{auth.user?.email ?? "unknown"}</p>
          <p className="mt-1 text-sm text-pwa-text-secondary">{t("profile.role")}: {auth.user?.role ?? "Driver"}</p>
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold text-pwa-text-secondary">{t("profile.language")}</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  void i18n.changeLanguage("en");
                }}
                className={`min-h-11 rounded border text-sm font-semibold ${i18n.language.startsWith("en") ? "border-white text-white" : "border-pwa-border text-pwa-text-secondary"}`}
              >
                {t("profile.language_en")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void i18n.changeLanguage("es");
                }}
                className={`min-h-11 rounded border text-sm font-semibold ${i18n.language.startsWith("es") ? "border-white text-white" : "border-pwa-border text-pwa-text-secondary"}`}
              >
                {t("profile.language_es")}
              </button>
            </div>
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
      </div>
    </div>
  );
}
