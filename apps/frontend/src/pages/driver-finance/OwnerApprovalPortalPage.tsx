import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import {
  getOwnerApprovalPortalDetails,
  ownerApprovalApprove,
  ownerApprovalDeny,
  type OwnerApprovalPortalPayload,
} from "../../api/owner-approval";
import { Button } from "../../components/Button";

function money(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

export function OwnerApprovalPortalPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<OwnerApprovalPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerNotes, setOwnerNotes] = useState("");
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await getOwnerApprovalPortalDetails(token);
        if (!active) return;
        setData(res);
      } catch (err: unknown) {
        if (!active) return;
        const code = err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "unavailable") : "unavailable";
        setError(code);
      } finally {
        if (active) setLoading(false);
      }
    }
    if (token) void run();
    else {
      setLoading(false);
      setError("missing_token");
    }
    return () => {
      active = false;
    };
  }, [token]);

  const req = data?.request;
  const rec = data?.recommendation ?? "low";
  const recTone =
    rec === "high" ? "bg-red-100 text-red-900" : rec === "medium" ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900";

  async function onApprove() {
    if (!token) return;
    setBusy("approve");
    setError(null);
    try {
      await ownerApprovalApprove(token, { owner_notes: ownerNotes.trim() });
      setDone("Approved. The advance is booked and notifications were sent.");
    } catch (err: unknown) {
      setError(err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "approve_failed") : "approve_failed");
    } finally {
      setBusy(null);
    }
  }

  async function onDeny() {
    if (!token) return;
    setBusy("deny");
    setError(null);
    try {
      await ownerApprovalDeny(token, { owner_notes: ownerNotes.trim() });
      setDone("Denied. The request is closed and the driver was notified.");
    } catch (err: unknown) {
      setError(err instanceof ApiError ? String((err.data as { error?: string })?.error ?? "deny_failed") : "deny_failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
          <h1 className="text-lg font-semibold">Owner approval — cash advance request</h1>
          <p className="mt-1 text-sm text-slate-600">Documented decision required (minimum 30 characters).</p>
        </div>

        {loading ? <p className="text-sm text-slate-600">Loading…</p> : null}
        {error && !done ? <p className="text-sm text-red-600">Could not open this approval ({error}).</p> : null}
        {done ? <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">{done}</p> : null}

        {data && !done ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border border-slate-200 bg-white p-4 text-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Request</div>
                <p className="mt-2 font-mono text-xs">{String(req?.display_id ?? "")}</p>
                <p className="mt-2">
                  <strong>Driver:</strong> {String(req?.driver_name ?? "")}
                </p>
                <p className="mt-1">
                  <strong>Amount:</strong> {money(Number(req?.requested_amount_cents ?? 0) / 100)}
                </p>
                <p className="mt-1">
                  <strong>Reason:</strong> {String(req?.reason ?? "")}
                </p>
                <p className="mt-2 text-xs text-slate-600">Submitted: {String(req?.submitted_at ?? "").replace("T", " ").slice(0, 19)}</p>
              </div>
              <div className="rounded border border-slate-200 bg-white p-4 text-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Policy</div>
                <p className="mt-2">
                  Standard threshold: <strong>{money(data.policy.threshold_dollars)}</strong>
                </p>
                <p className="mt-1">
                  Requested: <strong>{money(data.policy.requested_amount_dollars)}</strong>
                </p>
                <p className="mt-1">
                  Over policy by: <strong>{money(data.policy.policy_overage_dollars)}</strong>
                </p>
                <div className={`mt-3 inline-block rounded px-2 py-1 text-xs font-semibold ${recTone}`}>
                  Risk recommendation: {data.recommendation.toUpperCase()}
                </div>
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">12-month driver history</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Cash advances</div>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
                    {(data.driver_history.advances ?? []).length === 0 ? (
                      <li className="text-slate-500">None in period.</li>
                    ) : (
                      data.driver_history.advances.map((a) => (
                        <li key={String(a.id ?? Math.random())} className="border-b border-slate-100 py-1">
                          {String(a.display_id ?? "")} · {money(Number(a.amount ?? 0))} · {String(a.created_at ?? "").slice(0, 10)}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Settlements</div>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
                    {(data.driver_history.settlements ?? []).length === 0 ? (
                      <li className="text-slate-500">None in period.</li>
                    ) : (
                      data.driver_history.settlements.map((s) => (
                        <li key={String(s.id ?? Math.random())} className="border-b border-slate-100 py-1">
                          {String(s.display_id ?? "")} · {String(s.status ?? "")} · {String(s.created_at ?? "").slice(0, 10)}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-white p-4">
              <label className="block text-sm font-semibold text-slate-900">Owner notes (required, 30+ characters)</label>
              <textarea
                className="mt-2 w-full rounded border border-slate-200 p-2 text-sm"
                rows={5}
                value={ownerNotes}
                onChange={(e) => setOwnerNotes(e.target.value)}
                placeholder="Document the business justification or denial rationale for audit."
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy !== null || ownerNotes.trim().length < 30}
                  onClick={() => void onApprove()}
                  className={busy === "approve" ? "opacity-70" : ""}
                >
                  Approve & book advance
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy !== null || ownerNotes.trim().length < 30}
                  onClick={() => void onDeny()}
                  className={busy === "deny" ? "opacity-70" : ""}
                >
                  Deny request
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
