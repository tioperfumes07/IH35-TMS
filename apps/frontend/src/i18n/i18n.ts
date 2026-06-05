import i18n from "./index";
import en from "./translations/en.json";
import es from "./translations/es.json";

type TranslationTree = Record<string, unknown>;

const resources: Record<string, TranslationTree> = {
  en: en as TranslationTree,
  es: es as TranslationTree,
};

for (const [language, bundle] of Object.entries(resources)) {
  i18n.addResourceBundle(language, "translation", bundle, true, true);
}

export default i18n;
