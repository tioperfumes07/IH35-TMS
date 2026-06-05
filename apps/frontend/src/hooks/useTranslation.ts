import { useMemo } from "react";
import { useTranslation as useI18nTranslation } from "react-i18next";
import i18n from "../i18n/i18n";

type Primitive = string | number | boolean | null | undefined;

export function useTranslation() {
  const { t: baseTranslate, i18n: instance } = useI18nTranslation();
  void i18n;

  const t = useMemo(() => {
    return (key: string, fallback?: string, values?: Record<string, Primitive>) => {
      const translated = baseTranslate(key, {
        ...(values ?? {}),
        defaultValue: fallback ?? key,
      });
      if (translated === key && fallback) return fallback;
      return translated;
    };
  }, [baseTranslate]);

  return {
    t,
    i18n: instance,
    language: instance.resolvedLanguage ?? instance.language ?? "en",
  };
}
