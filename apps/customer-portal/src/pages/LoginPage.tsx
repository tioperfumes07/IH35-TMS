import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api/client";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("token");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        await apiRequest<{ ok: true }>("/api/v1/portal/auth/verify", { method: "POST", body: JSON.stringify({ token }) });
        if (!cancelled) nav("/dashboard", { replace: true });
      } catch {
        if (!cancelled) setMsg("This sign-in link is invalid or has expired.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, nav]);

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold text-slate-900">IH35 customer portal</h1>
      <p className="mt-2 text-sm text-slate-600">Enter the email we have on file. We will send you a one-time sign-in link (15 minutes).</p>
      {token ? <p className="mt-4 text-sm text-slate-700">Signing you in…</p> : null}
      {!token ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg("");
            void (async () => {
              try {
                await apiRequest<{ ok: true }>("/api/v1/portal/auth/request-link", {
                  method: "POST",
                  body: JSON.stringify({ email }),
                });
                setMsg("If we recognize this email, a sign-in link was sent.");
              } catch {
                setMsg("We could not start sign-in. Try again later.");
              }
            })();
          }}
        >
          <input
            type="email"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Email me a link
          </button>
        </form>
      ) : null}
      {msg ? (
        <p className="mt-3 rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
