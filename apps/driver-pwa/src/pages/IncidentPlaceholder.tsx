import { useTranslation } from "react-i18next";

export function IncidentPlaceholderPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto w-full max-w-md rounded-xl border border-pwa-border bg-pwa-card p-4 text-sm text-pwa-text-secondary">
        {t("incident.coming_soon")}
      </div>
    </div>
  );
}
