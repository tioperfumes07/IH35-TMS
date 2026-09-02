import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDriftAlerts, resolveDriftAlert, type DriftAlert } from "../../../api/banking";
import { ActionButton } from "../../../components/shared/ActionButton";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useToast } from "../../../components/Toast";
import { formatUsdCents } from "../../../lib/money";
import { userFacingApiError } from "../../../lib/api-error-message";

// GO-20 slice A (docs/lockdown/GO-20-EIGHT-FEATURES.txt) — "Banking gains a Drift panel at the
// top: account, as of date, bank balance, book balance, the difference, and how long it has been
// open. Resolving requires a written reason." The owner attention card links here (banking page,
// no fragment needed — this panel already sits at the top of Banking Home).

const DRIFT_KIND_LABEL: Record<DriftAlert["drift_kind"], string> = {
  session_variance: "Reconciliation variance",
  live_balance: "Live balance vs. ledger",
  stale_feed: "Bank feed not syncing",
};

function daysOpen(detectedAt: string): number {
  const ms = Date.now() - new Date(detectedAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function AlertRow({ alert, companyId }: { alert: DriftAlert; companyId: string }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const days = daysOpen(alert.detected_at);
  // §7 palette: red is reserved for delete/Accident — severity is conveyed with weight, not color.
  const severityClass = alert.severity === "critical" ? "font-bold text-slate-700" : "font-semibold text-slate-600";

  const handleResolve = () => {
    if (!note.trim()) {
      pushToast("A written reason is required to resolve a drift alert.", "error");
      return;
    }
    setSubmitting(true);
    resolveDriftAlert(alert.id, companyId, note.trim())
      .then(() => {
        pushToast("Drift alert resolved.", "success");
        setNoteOpen(false);
        setNote("");
        return queryClient.invalidateQueries({ queryKey: ["drift-alerts", companyId] });
      })
      .catch((error) => pushToast(userFacingApiError(error, "Failed to resolve drift alert"), "error"))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="border-b border-gray-100 px-3 py-2 text-xs last:border-b-0" data-testid="drift-alert-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className={`font-semibold ${severityClass}`}>{DRIFT_KIND_LABEL[alert.drift_kind]}</span>
          <span className="mx-2 text-gray-400">|</span>
          {alert.institution_name ?? "Account"} {alert.account_mask ? `••${alert.account_mask}` : ""}
          <span className="mx-2 text-gray-400">|</span>
          As of {alert.as_of_date}
          <span className="mx-2 text-gray-400">|</span>
          Open {days} day{days === 1 ? "" : "s"}
        </div>
        <div className="flex items-center gap-3">
          <span>Bank: {formatUsdCents(Number(alert.bank_balance_cents))}</span>
          <span>Book: {formatUsdCents(Number(alert.book_balance_cents))}</span>
          <span className={`font-semibold ${severityClass}`}>Diff: {formatUsdCents(Number(alert.drift_cents))}</span>
          <ActionButton onClick={() => setNoteOpen((v) => !v)} data-testid="drift-alert-resolve-toggle">
            Resolve
          </ActionButton>
        </div>
      </div>
      {noteOpen ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Written reason (required)"
            className="min-w-[280px] flex-1 rounded-sm border border-gray-300 px-2 py-1 text-xs"
            data-testid="drift-alert-resolve-note"
          />
          <ActionButton onClick={handleResolve} disabled={submitting} data-testid="drift-alert-resolve-submit">
            {submitting ? "Resolving…" : "Confirm resolve"}
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}

export function DriftAlertsPanel({ companyId }: { companyId: string }) {
  const query = useQuery({
    queryKey: ["drift-alerts", companyId, "open"],
    queryFn: () => getDriftAlerts(companyId, false),
    enabled: Boolean(companyId),
  });

  if (query.isPending) return null;
  if (query.isError) {
    return (
      <div className="mb-3">
        <ListErrorBanner message={userFacingApiError(query.error, "Failed to load drift alerts")} onRetry={() => query.refetch()} />
      </div>
    );
  }

  const rows = query.data?.rows ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="mb-3 rounded-sm border border-slate-200 bg-slate-100" data-testid="drift-alerts-panel">
      <div className="border-b border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
        {rows.length} open reconciliation drift alert{rows.length === 1 ? "" : "s"}
      </div>
      {rows.map((alert) => (
        <AlertRow key={alert.id} alert={alert} companyId={companyId} />
      ))}
    </div>
  );
}
