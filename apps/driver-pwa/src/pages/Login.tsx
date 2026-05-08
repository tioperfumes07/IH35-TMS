import { Navigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import { startPhoneLogin, verifyPhoneLogin } from "../api/identity";
import { useAuth } from "../auth/useAuth";
import { PwaButton } from "../components/PwaButton";

type CountryCode = "+1" | "+52";

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
  const [countryCode, setCountryCode] = useState<CountryCode>("+1");
  const [phoneInput, setPhoneInput] = useState("");
  const [step, setStep] = useState<"collect" | "verify">("collect");
  const [code, setCode] = useState("");
  const [activePhoneE164, setActivePhoneE164] = useState("");
  const [activePhoneDigits, setActivePhoneDigits] = useState("");
  const [deliveryChannel, setDeliveryChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [nextResendAt, setNextResendAt] = useState<number>(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [errorText, setErrorText] = useState("");
  const sessionExpired = new URLSearchParams(window.location.search).get("reason") === "session_expired";

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const resendCountdown = useMemo(() => {
    const secs = Math.ceil((nextResendAt - nowMs) / 1000);
    return secs > 0 ? secs : 0;
  }, [nextResendAt, nowMs]);

  const sendCodeMutation = useMutation({
    mutationFn: async (phone: string) => startPhoneLogin({ phone, channel: "whatsapp" }),
    onSuccess: (response, phone) => {
      const digits = phone.slice(-10);
      setStep("verify");
      setActivePhoneE164(phone);
      setActivePhoneDigits(digits);
      setDeliveryChannel(response.channel);
      setNextResendAt(Date.now() + 30_000);
      setErrorText("");
      setCode("");
    },
    onError: () => {
      setErrorText("Could not send code right now. Please try again.");
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: () => verifyPhoneLogin({ phone: activePhoneE164, code }),
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
        {sessionExpired ? (
          <p className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            {t("login.session_expired")}
          </p>
        ) : null}
        <div className="mt-6 rounded-xl border border-pwa-border bg-pwa-bg p-4">
          <h2 className="text-base font-semibold text-pwa-text-primary">Sign in with phone</h2>
          {step === "collect" ? (
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
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="6-digit code"
                className="w-full rounded-md border border-pwa-border bg-pwa-card px-3 py-2 text-sm text-pwa-text-primary"
              />
              <PwaButton
                className="w-full"
                disabled={code.length !== 6}
                aria-busy={verifyCodeMutation.isPending}
                onClick={() => void verifyCodeMutation.mutateAsync()}
              >
                {verifyCodeMutation.isPending ? "Verifying..." : "Verify"}
              </PwaButton>
              <PwaButton
                className="w-full"
                variant="secondary"
                disabled={resendCountdown > 0}
                onClick={() => {
                  if (resendCountdown > 0) return;
                  setErrorText("");
                  void sendCodeMutation.mutateAsync(activePhoneE164);
                }}
              >
                {resendCountdown > 0 ? `Resend code (${resendCountdown}s)` : "Resend code"}
              </PwaButton>
              <button
                type="button"
                onClick={() => {
                  setStep("collect");
                  setCode("");
                  setErrorText("");
                }}
                className="w-full text-center text-sm text-pwa-text-secondary underline"
              >
                Use a different phone
              </button>
            </div>
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
