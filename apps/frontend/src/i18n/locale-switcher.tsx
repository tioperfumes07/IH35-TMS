import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getUserPreferences, patchUserPreferences } from "../api/safety";
import i18n from "./i18n";
import { useTranslation } from "../hooks/useTranslation";

const SUPPORTED_LOCALES = ["en", "es"] as const;

function normalizeLocale(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (SUPPORTED_LOCALES.includes(trimmed as (typeof SUPPORTED_LOCALES)[number])) {
    return trimmed;
  }
  return null;
}

export function LocaleSwitcher() {
  const { t } = useTranslation();

  const preferencesQuery = useQuery({
    queryKey: ["user", "preferences", "locale"],
    queryFn: getUserPreferences,
    staleTime: 60_000,
  });

  const saveLocaleMutation = useMutation({
    mutationFn: async (locale: string) => patchUserPreferences({ locale_preference: locale }),
  });

  useEffect(() => {
    const locale = normalizeLocale(preferencesQuery.data?.preferences?.locale_preference);
    if (!locale) return;
    if (i18n.resolvedLanguage === locale || i18n.language === locale) return;
    void i18n.changeLanguage(locale);
  }, [preferencesQuery.data?.preferences]);

  const currentLanguage = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? "en";

  return (
    <label className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs" style={{ borderColor: "rgba(255,255,255,0.2)", color: "inherit" }}>
      <span className="sr-only">{t("common.language", "Language")}</span>
      <select
        aria-label={t("common.language", "Language")}
        className="bg-transparent text-xs outline-none"
        value={currentLanguage}
        onChange={(event) => {
          const nextLocale = normalizeLocale(event.target.value) ?? "en";
          void i18n.changeLanguage(nextLocale);
          void saveLocaleMutation.mutateAsync(nextLocale).catch(() => {
            // Keep language selected even if persistence fails; user can retry by toggling again.
          });
        }}
      >
        <option value="en" style={{ color: "#0f172a" }}>
          {t("common.english", "English")}
        </option>
        <option value="es" style={{ color: "#0f172a" }}>
          {t("common.spanish", "Spanish")}
        </option>
      </select>
    </label>
  );
}
