import { Navigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import { startEmailLogin, startPhoneLogin, verifyEmailLogin, verifyPhoneLogin } from "../api/identity";
import { useAuth } from "../auth/useAuth";
import { PwaButton } from "../components/PwaButton";

type CountryCode = "+1" | "+52";
type LoginMode = "phone" | "email";

function normalizePhoneDigits(input: string) {
  return input.replace(/\D/g, "").slice(0, 10);
}

function formatPhoneInput(input: string) {
  const digits = normalizePhoneDigits(input);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function toE164(countryCode: CountryCode, digits: string) {
  return `${countryCode}${digits}`;
}

function maskPhoneForMessage(digits: string) {
  if (digits.length !== 10) return digits;
  return `(${digits.slice(0, 3)}) ***-**${digits.slice(-2)}`;
}

export function LoginPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const authBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
  const returnTo = encodeURIComponent(window.location.origin);
  const loginPath = `/api/v1/auth/google/login?returnTo=${returnTo}`;
  const loginHref = authBase ? `${authBase}${loginPath}` : loginPath;
  const [mode, setMode] = useState<LoginMode>("phone");
  const [countryCode, setCountryCode] = useState<CountryCode>("+1");
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneStep, setPhoneStep] = useState<"collect" | "verify">("collect");
  const [phoneCode, setPhoneCode] = useState("");
  const [activePhoneE164, setActivePhoneE164] = useState("");
  const [activePhoneDigits, setActivePhoneDigits] = useState("");
  const [deliveryChannel, setDeliveryChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [nextPhoneResendAt, setNextPhoneResendAt] = useState<number>(0);
  const [emailStep, setEmailStep] = useState<"collect" | "verify">("collect");
  const [emailInput, setEmailInput] = useState("");
  const [activeEmail, setActiveEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [nextEmailResendAt, setNextEmailResendAt] = useState<number>(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [errorText, setErrorText] = useState("");
  const sessionExpired = new URLSearchParams(window.location.search).get("reason") === "session_expired";
  const driversOnly = new URLSearchParams(window.location.search).get("reason") === "drivers_only";

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const phoneResendCountdown = useMemo(() => {
    const secs = Math.ceil((nextPhoneResendAt - nowMs) / 1000);
    return secs > 0 ? secs : 0;
  }, [nextPhoneResendAt, nowMs]);

  const emailResendCountdown = useMemo(() => {
    const secs = Math.ceil((nextEmailResendAt - nowMs) / 1000);
    return secs > 0 ? secs : 0;
  }, [nextEmailResendAt, nowMs]);

  const sendCodeMutation = useMutation({
    mutationFn: async (phone: string) => startPhoneLogin({ phone, channel: "whatsapp" }),
    onSuccess: (response, phone) => {
      const digits = phone.slice(-10);
      setPhoneStep("verify");
      setActivePhoneE164(phone);
      setActivePhoneDigits(digits);
      setDeliveryChannel(response.channel);
      setNextPhoneResendAt(Date.now() + 30_000);
      setErrorText("");
      setPhoneCode("");
    },
    onError: () => {
      setErrorText("Could not send code right now. Please try again.");
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: () => verifyPhoneLogin({ phone: activePhoneE164, code: phoneCode }),
    onSuccess: async () => {
      setErrorText("");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        setErrorText("Invalid code. Please try again.");
        return;
      }
      setErrorText("Could not verify code. Please try again.");
    },
  });

  const sendEmailCodeMutation = useMutation({
    mutationFn: async (email: string) => startEmailLogin({ email }),
    onSuccess: (_response, email) => {
      setEmailStep("verify");
      setActiveEmail(email);
      setNextEmailResendAt(Date.now() + 30_000);
      setErrorText("");
      setEmailCode("");
    },
    onError: () => {
      setErrorText("Could not send code right now. Please try again.");
    },
  });

  const verifyEmailCodeMutation = useMutation({
    mutationFn: () => verifyEmailLogin({ email: activeEmail, code: emailCode }),
    onSuccess: async () => {
      setErrorText("");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        setErrorText("Invalid code. Please try again.");
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        setErrorText(t("login.drivers_only_error"));
        return;
      }
      setErrorText("Could not verify code. Please try again.");
    },
  });

  if (auth.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-pwa-text-secondary">Checking session...</div>;
  }

  if (auth.user) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-pwa-bg px-4 py-3">
      <div className="w-full max-w-sm rounded-2xl border border-pwa-border bg-pwa-card p-6">
        <h1 className="text-3xl font-semibold text-pwa-text-primary">IH 35 Driver</h1>
        <p className="mt-2 text-base text-pwa-text-secondary">Sign in to continue</p>
        {driversOnly ? (
          <p className="mt-3 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            {t("login.drivers_only_error")}
          </p>
        ) : null}
        {sessionExpired && !driversOnly ? (
          <p className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            {t("login.session_expired")}
          </p>
        ) : null}
        <div className="mt-6 rounded-xl border border-pwa-border bg-pwa-bg p-4">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("phone")}
              className={`min-h-11 rounded border text-sm font-semibold ${mode === "phone" ? "border-white text-white" : "border-pwa-border text-pwa-text-secondary"}`}
            >
              {t("login.tab_phone")}
            </button>
            <button
              type="button"
              onClick={() => setMode("email")}
              className={`min-h-11 rounded border text-sm font-semibold ${mode === "email" ? "border-white text-white" : "border-pwa-border text-pwa-text-secondary"}`}
            >
              {t("login.tab_email")}
            </button>
          </div>

          {mode === "phone" ? (
            <>
              <h2 className="text-base font-semibold text-pwa-text-primary">{t("login.tab_phone")}</h2>
              {phoneStep === "collect" ? (
                <div className="mt-3 space-y-3">
                  <select
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value as CountryCode)}
                    className="w-full rounded-md border border-pwa-border bg-pwa-card px-3 py-2 text-sm text-pwa-text-primary"
                  >
                    <option value="+1">US (+1)</option>
                    <option value="+52">Mexico (+52)</option>
                  </select>
                  <input
                    value={formatPhoneInput(phoneInput)}
                    onChange={(event) => setPhoneInput(normalizePhoneDigits(event.target.value))}
                    inputMode="numeric"
                    placeholder="(956) 555-0001"
                    className="w-full rounded-md border border-pwa-border bg-pwa-card px-3 py-2 text-sm text-pwa-text-primary"
                  />
                  <PwaButton
                    className="w-full"
                    disabled={normalizePhoneDigits(phoneInput).length !== 10}
                    aria-busy={sendCodeMutation.isPending}
                    onClick={() => {
                      const digits = normalizePhoneDigits(phoneInput);
                      if (digits.length !== 10) {
                        setErrorText("Please enter a valid 10-digit phone number.");
                        return;
                      }
                      setErrorText("");
                      void sendCodeMutation.mutateAsync(toE164(countryCode, digits));
                    }}
                  >
                    {sendCodeMutation.isPending ? "Sending..." : "Send code"}
                  </PwaButton>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-pwa-text-secondary">
                    Code sent via {deliveryChannel === "sms" ? "SMS" : "WhatsApp"} to {maskPhoneForMessage(activePhoneDigits)}
                  </p>
                  <input
                    value={phoneCode}
                    onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="6-digit code"
                    className="w-full rounded-md border border-pwa-border bg-pwa-card px-3 py-2 text-sm text-pwa-text-primary"
                  />
                  <PwaButton
                    className="w-full"
                    disabled={phoneCode.length !== 6}
                    aria-busy={verifyCodeMutation.isPending}
                    onClick={() => void verifyCodeMutation.mutateAsync()}
                  >
                    {verifyCodeMutation.isPending ? "Verifying..." : "Verify"}
                  </PwaButton>
                  <PwaButton
                    className="w-full"
                    variant="secondary"
                    disabled={phoneResendCountdown > 0}
                    onClick={() => {
                      if (phoneResendCountdown > 0) return;
                      setErrorText("");
                      void sendCodeMutation.mutateAsync(activePhoneE164);
                    }}
                  >
                    {phoneResendCountdown > 0 ? `Resend code (${phoneResendCountdown}s)` : "Resend code"}
                  </PwaButton>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneStep("collect");
                      setPhoneCode("");
                      setErrorText("");
                    }}
                    className="w-full text-center text-sm text-pwa-text-secondary underline"
                  >
                    Use a different phone
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-pwa-text-primary">{t("login.tab_email")}</h2>
              <p className="mt-1 text-sm text-pwa-text-secondary">{t("login.email_help")}</p>
              {emailStep === "collect" ? (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-semibold text-pwa-text-secondary">{t("login.email_label")}</label>
                  <input
                    value={emailInput}
                    onChange={(event) => setEmailInput(event.target.value.trim().toLowerCase())}
                    inputMode="email"
                    placeholder={t("login.email_placeholder")}
                    className="w-full rounded-md border border-pwa-border bg-pwa-card px-3 py-2 text-sm text-pwa-text-primary"
                  />
                  <PwaButton
                    className="w-full"
                    disabled={!emailInput.includes("@")}
                    aria-busy={sendEmailCodeMutation.isPending}
                    onClick={() => {
                      if (!emailInput.includes("@")) {
                        setErrorText("Please enter a valid email.");
                        return;
                      }
                      setErrorText("");
                      void sendEmailCodeMutation.mutateAsync(emailInput);
                    }}
                  >
                    {sendEmailCodeMutation.isPending ? "Sending..." : t("login.email_send_code")}
                  </PwaButton>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-pwa-text-secondary">{activeEmail}</p>
                  <input
                    value={emailCode}
                    onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="6-digit code"
                    className="w-full rounded-md border border-pwa-border bg-pwa-card px-3 py-2 text-sm text-pwa-text-primary"
                  />
                  <PwaButton
                    className="w-full"
                    disabled={emailCode.length !== 6}
                    aria-busy={verifyEmailCodeMutation.isPending}
                    onClick={() => void verifyEmailCodeMutation.mutateAsync()}
                  >
                    {verifyEmailCodeMutation.isPending ? "Verifying..." : t("login.email_verify")}
                  </PwaButton>
                  <PwaButton
                    className="w-full"
                    variant="secondary"
                    disabled={emailResendCountdown > 0}
                    onClick={() => {
                      if (emailResendCountdown > 0) return;
                      setErrorText("");
                      void sendEmailCodeMutation.mutateAsync(activeEmail);
                    }}
                  >
                    {emailResendCountdown > 0 ? `Resend code (${emailResendCountdown}s)` : t("login.email_send_code")}
                  </PwaButton>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailStep("collect");
                      setEmailCode("");
                      setErrorText("");
                    }}
                    className="w-full text-center text-sm text-pwa-text-secondary underline"
                  >
                    Use a different email
                  </button>
                </div>
              )}
            </>
          )}
          {errorText ? <p className="mt-3 text-sm text-red-400">{errorText}</p> : null}
        </div>
        <a href={loginHref} className="mt-6 block">
          <PwaButton className="w-full text-base">Sign in with Google</PwaButton>
        </a>
        <p className="mt-8 text-xs text-pwa-text-secondary">IH 35 Transportation LLC</p>
      </div>
    </div>
  );
}
