import { useEffect, useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { clearDriverAuth, hasDriverAccessToken } from "../../lib/auth-token";
import { initDriverBackgroundSessionRefresh, registerDriverServiceWorker } from "../../lib/service-worker-registration";
import { InstallPWAPrompt } from "./InstallPWAPrompt";
import { FooterFaqLink, PageHelpLink } from "../../components/PageHelpLink";

function applyDriverLanguageDefault() {
  const stored = localStorage.getItem("ih35_driver_i18n_lang");
  if (stored === "en" || stored === "es") {
    void i18n.changeLanguage(stored);
    return;
  }
  const nav = navigator.language?.toLowerCase() ?? "en";
  void i18n.changeLanguage(nav.startsWith("es") ? "es" : "en");
}

export function DriverShell() {
  const { t, i18n: i18next } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasDriverAccessToken()) {
      navigate("/driver/login", { replace: true });
      return;
    }
    applyDriverLanguageDefault();
    void registerDriverServiceWorker();
    initDriverBackgroundSessionRefresh();
    setReady(true);
  }, [navigate]);

  const logout = () => {
    clearDriverAuth();
    navigate("/driver/login", { replace: true });
  };

  if (!ready) return <div className="p-4 text-sm text-gray-600">Loading…</div>;

  const tabClass = (path: string) =>
    location.pathname.startsWith(path) ? "font-semibold text-slate-900" : "text-slate-600";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-3 py-2">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <span className="text-sm font-semibold">{t("driver.app_title")}</span>
          <div className="flex items-center gap-2 text-xs">
            <PageHelpLink className="h-7 w-7 border-slate-300 text-slate-600 hover:bg-slate-100" />
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-0.5"
              onClick={() => {
                localStorage.setItem("ih35_driver_i18n_lang", "en");
                void i18next.changeLanguage("en");
              }}
            >
              EN
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-0.5"
              onClick={() => {
                localStorage.setItem("ih35_driver_i18n_lang", "es");
                void i18next.changeLanguage("es");
              }}
            >
              ES
            </button>
          </div>
        </div>
        <nav className="mx-auto mt-2 flex max-w-lg justify-between gap-1 text-xs">
          <Link className={tabClass("/driver/loads")} to="/driver/loads">
            Loads
          </Link>
          <Link className={tabClass("/driver/hos")} to="/driver/hos">
            HOS
          </Link>
          <Link className={tabClass("/driver/disputes")} to="/driver/disputes">
            Disputes
          </Link>
          <Link className={tabClass("/driver/settings")} to="/driver/settings">
            Settings
          </Link>
          <button type="button" className="text-red-700" onClick={logout}>
            {t("driver.logout")}
          </button>
        </nav>
        <div className="mx-auto mt-2 max-w-lg">
          <InstallPWAPrompt />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 p-3">
        <Outlet />
        <footer className="mt-8 flex justify-end pb-6">
          <FooterFaqLink className="text-slate-500 hover:text-slate-800" />
        </footer>
      </main>
    </div>
  );
}
