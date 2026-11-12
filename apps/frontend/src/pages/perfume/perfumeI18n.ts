import i18n from "../../i18n";

/**
 * PERFUME-DESK labels go through the app's one i18n instance (apps/frontend/src/i18n). The English text is the
 * default; a Spanish string can be added under the same key in locales/es.json without touching the page.
 */
export function tr(key: string, english: string): string {
  return String(i18n.t(key, { defaultValue: english }));
}
