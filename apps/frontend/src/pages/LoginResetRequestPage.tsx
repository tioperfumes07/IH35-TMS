import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../api/office-auth";
import { isValidEmailFormat } from "../auth/office-password-ui";
import { ApiError } from "../api/client";
import { Button } from "../components/Button";
import { typography } from "../design/tokens";

export function LoginResetRequestPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const emailInvalid = email.length > 0 && !isValidEmailFormat(email);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!isValidEmailFormat(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setPending(true);
    try {
      const res = await requestPasswordReset(email.trim());
      setMessage(res.message);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many requests. Try again in a few minutes.");
      } else {
        setError("Unable to submit request. Try again later.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-4">
      <div className="w-full max-w-md rounded border border-gray-200 bg-white p-6 shadow-sm">
        <h1 style={{ fontFamily: typography.fontSerif }} className="text-[20px] font-semibold text-gray-900">
          Reset password
        </h1>
        <p className="mt-2 text-sm text-gray-700">We will email you a link to choose a new password.</p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <div>
            <label htmlFor="reset-email" className="block text-sm font-medium text-gray-800">
              Email
            </label>
            <input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              aria-invalid={emailInvalid}
              aria-describedby={emailInvalid ? "reset-email-err" : undefined}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
            {emailInvalid ? (
              <p id="reset-email-err" className="mt-1 text-xs text-red-700">
                Enter a valid email address.
              </p>
            ) : null}
          </div>
          {message ? (
            <p className="text-sm text-green-800" role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-slate-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
