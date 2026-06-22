import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset } from "../api/office-auth";
import { evaluatePasswordStrength, OFFICE_PASSWORD_HINT } from "../auth/office-password-ui";
import { ApiError } from "../api/client";
import { Button } from "../components/Button";
import { typography } from "../design/tokens";

export function LoginResetConfirmPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token")?.trim() ?? "", [params]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const strength = evaluatePasswordStrength(password);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Reset link is missing or invalid.");
      return;
    }
    if (!strength.meetsPolicy) {
      setError(OFFICE_PASSWORD_HINT);
      return;
    }
    setPending(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("This reset link is invalid or has expired. Request a new one.");
      } else {
        setError("Unable to reset password. Try again.");
      }
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-4">
        <div className="w-full max-w-md rounded border border-gray-200 bg-white p-6 shadow-sm">
          <h1 style={{ fontFamily: typography.fontSerif }} className="text-[20px] font-semibold text-gray-900">
            Invalid link
          </h1>
          <p className="mt-2 text-sm text-gray-700">Open the link from your email, or request a new reset.</p>
          <Link to="/login/reset" className="mt-4 inline-block text-sm text-slate-700 hover:underline">
            Request reset
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-4">
        <div className="w-full max-w-md rounded border border-gray-200 bg-white p-6 shadow-sm">
          <h1 style={{ fontFamily: typography.fontSerif }} className="text-[20px] font-semibold text-gray-900">
            Password updated
          </h1>
          <p className="mt-2 text-sm text-gray-700">You can sign in with your new password.</p>
          <Link to="/login" className="mt-4 inline-block text-sm font-medium text-slate-700 hover:underline">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-4">
      <div className="w-full max-w-md rounded border border-gray-200 bg-white p-6 shadow-sm">
        <h1 style={{ fontFamily: typography.fontSerif }} className="text-[20px] font-semibold text-gray-900">
          Choose a new password
        </h1>
        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-800">
              New password
            </label>
            <input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              aria-describedby="new-password-meter"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
            <div id="new-password-meter" className="mt-2" aria-live="polite">
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
              <p className="mt-1 text-xs text-gray-600">{OFFICE_PASSWORD_HINT}</p>
            </div>
          </div>
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save password"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-slate-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
