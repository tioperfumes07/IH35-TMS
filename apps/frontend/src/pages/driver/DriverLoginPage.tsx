import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../api/client";
import { getDriverMe } from "../../api/driver";
import { persistDriverAuth, persistOperatingCompanyId } from "../../lib/auth-token";
import { initDriverBackgroundSessionRefresh, registerDriverServiceWorker } from "../../lib/service-worker-registration";
import { readVapidPublicKeyFromEnv, registerDriverWebPush } from "../../lib/push-permission";

type PhoneVerifyResponse = {
  ok?: boolean;
  driver_auth?: { access_token: string; refresh_token: string; expires_in: number } | null;
  user?: { role?: string };
};

export function DriverLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest("/api/v1/auth/phone/start", { method: "POST", body: { phone } });
      setStep("code");
      setMessage("Code sent (if the phone is registered).");
    } catch {
      setMessage("Could not start verification.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiRequest<PhoneVerifyResponse>("/api/v1/auth/phone/verify", {
        method: "POST",
        body: { phone, code },
      });
      if (res.user?.role !== "Driver") {
        setMessage("This sign-in is for driver accounts only.");
        return;
      }
      if (res.driver_auth) persistDriverAuth(res.driver_auth);
      const me = await getDriverMe();
      persistOperatingCompanyId(me.operating_company_id);
      void registerDriverServiceWorker();
      initDriverBackgroundSessionRefresh();
      const vapid = readVapidPublicKeyFromEnv();
      if (vapid) void registerDriverWebPush(vapid);
      navigate("/driver/loads", { replace: true });
    } catch {
      setMessage("Invalid code or not a driver account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-slate-50 px-4 py-8">
      <h1 className="text-lg font-semibold text-slate-900">{t("driver.login_title")}</h1>
      {step === "phone" ? (
        <>
          <label className="text-xs font-medium text-slate-600">{t("driver.phone_label")}</label>
          <input
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("driver.phone_placeholder")}
            inputMode="tel"
            autoComplete="tel"
          />
          <button
            type="button"
            className="rounded bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy || !phone.startsWith("+")}
            onClick={() => void start()}
          >
            {t("driver.send_code")}
          </button>
        </>
      ) : (
        <>
          <label className="text-xs font-medium text-slate-600">{t("driver.otp_label")}</label>
          <input
            className="rounded border border-slate-300 px-3 py-2 text-sm tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <button
            type="button"
            className="rounded bg-slate-900 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy || code.length < 4}
            onClick={() => void verify()}
          >
            {busy ? t("driver.logging_in") : t("driver.verify")}
          </button>
          <button type="button" className="text-xs text-slate-600 underline" onClick={() => setStep("phone")}>
            Change phone
          </button>
        </>
      )}
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
