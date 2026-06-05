import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en.json";
import es from "./es.json";

const isDev = import.meta.env.DEV;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, es: { translation: es } },
    fallbackLng: "en",
    supportedLngs: ["en", "es"],
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
    saveMissing: isDev,
    missingKeyHandler: (lngs, _ns, key) => {
      const langs = lngs.join(",");
      const message = `[i18n] missing key "${key}" for ${langs}`;
      if (isDev) {
        throw new Error(message);
      }
      console.error(message);
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
