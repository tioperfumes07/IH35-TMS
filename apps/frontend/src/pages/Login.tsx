import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/useAuth";
import { evaluatePasswordStrength, isValidEmailFormat } from "../auth/office-password-ui";
import { officeEmailLogin } from "../api/office-auth";
import { ApiError } from "../api/client";
import { Button } from "../components/Button";
import { typography } from "../design/tokens";

export function LoginPage() {
  const { user, isLoading, refetch } = useAuth();
  const queryClient = useQueryClient();
  const authBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
  const returnTo = encodeURIComponent(window.location.origin);
  const loginPath = `/api/v1/auth/google/login?returnTo=${returnTo}`;
  const loginHref = authBase ? `${authBase}${loginPath}` : loginPath;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailInvalid = email.length > 0 && !isValidEmailFormat(email);
  const strength = evaluatePasswordStrength(password);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-700" role="status">
        Checking session...
      </div>
    );
  }

  if (user) {
    return <Navigate to="/home" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!isValidEmailFormat(email)) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (!strength.meetsPolicy) {
      setFormError("Password does not meet strength requirements.");
      return;
    }
    setSubmitting(true);
    try {
      await officeEmailLogin(email.trim(), password);
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await refetch();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setFormError("Incorrect email or password.");
      } else if (err instanceof ApiError && err.status === 403) {
        const body = err.data as { message?: string };
        setFormError(body?.message ?? "You cannot sign in here with this account.");
      } else {
        setFormError("Sign-in failed. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-4">
      <div className="w-full max-w-md rounded border border-gray-200 bg-white p-6 shadow-sm">
        <h1 style={{ fontFamily: typography.fontSerif }} className="text-[22px] font-semibold text-gray-900">
          IH 35 Office Login
        </h1>
        <p className="mt-2 text-sm text-gray-700">Use your Google account or email and password.</p>

        <div className="mt-5">
          <a href={loginHref} className="block rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2">
            <Button className="w-full">Sign in with Google</Button>
          </a>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-500">Or email</span>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="office-email" className="block text-sm font-medium text-gray-800">
              Email
            </label>
            <input
              id="office-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              aria-invalid={emailInvalid}
              aria-describedby={emailInvalid ? "office-email-err" : undefined}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
            {emailInvalid ? (
              <p id="office-email-err" className="mt-1 text-xs text-red-700">
                Enter a valid email address.
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="office-password" className="block text-sm font-medium text-gray-800">
              Password
            </label>
            <input
              id="office-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              aria-describedby="password-strength-help"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
            <div id="password-strength-help" className="mt-2" aria-live="polite">
              <div
                className="flex h-2 overflow-hidden rounded bg-gray-100"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={strength.max}
                aria-valuenow={strength.score}
                aria-label={`Password strength ${strength.label}`}
              >
                <div
                  className={`h-full transition-all ${
                    strength.score <= 2 ? "bg-amber-500" : strength.score <= 3 ? "bg-yellow-500" : strength.score === 4 ? "bg-lime-600" : "bg-green-600"
                  }`}
                  style={{ width: `${(strength.score / strength.max) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-600">
                Strength: <span className="font-medium text-gray-900">{strength.label}</span>. Minimum 12 characters with upper,
                lower, number, and symbol.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Link
              to="/login/reset"
              className="text-sm text-slate-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Forgot password?
            </Link>
          </div>
          {formError ? (
            <p className="text-sm text-red-700" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in with email"}
          </Button>
        </form>
      </div>
    </div>
  );
}
