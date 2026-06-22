import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  acknowledgeDocumentAlert,
  evaluateDocumentAlerts,
  getDocumentAlertRules,
  getDocumentAlertsInbox,
  updateDocumentAlertRule,
  type DocumentAlertEvent,
  type DocumentAlertRule,
} from "../../api/document-alerts";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";

function severityClass(severity: string, days: number) {
  if (days <= 0 || severity === "critical") return "text-red-700 bg-red-50";
  if (days <= 7) return "text-amber-800 bg-amber-50";
  if (days <= 30) return "text-amber-700 bg-amber-50/60";
  return "text-slate-700 bg-slate-50";
}

function RuleEditor({
  rule,
  operatingCompanyId,
  onSaved,
}: {
  rule: DocumentAlertRule;
  operatingCompanyId: string;
  onSaved: () => void;
}) {
  const [daysText, setDaysText] = useState(rule.days_before_expiry.join(", "));
  const [enabled, setEnabled] = useState(rule.enabled);
  const saveMutation = useMutation({
    mutationFn: () => {
      const parsed = daysText
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0);
      return updateDocumentAlertRule(rule.id, operatingCompanyId, {
        days_before_expiry: parsed.length ? parsed : rule.days_before_expiry,
        enabled,
      });
    },
    onSuccess: onSaved,
  });

  return (
    <div className="rounded border border-gray-200 p-3" data-testid={`rule-editor-${rule.document_type}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{rule.rule_name}</p>
          <p className="text-xs text-slate-500">{rule.document_type}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
      </div>
      <label className="mt-2 block text-xs font-medium text-slate-600">
        Days before expiry (comma-separated)
        <input
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={daysText}
          onChange={(e) => setDaysText(e.target.value)}
          aria-label={`Thresholds for ${rule.rule_name}`}
        />
      </label>
      <Button
        type="button"
        className="mt-2"
        data-testid={`save-rule-${rule.document_type}`}
        disabled={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        Save rule
      </Button>
    </div>
  );
}

function InboxRow({
  event,
  operatingCompanyId,
  onAcknowledged,
}: {
  event: DocumentAlertEvent;
  operatingCompanyId: string;
  onAcknowledged: () => void;
}) {
  const ackMutation = useMutation({
    mutationFn: () => acknowledgeDocumentAlert(event.id, operatingCompanyId, "Reviewed from alerts inbox"),
    onSuccess: onAcknowledged,
  });

  const profileLink = event.driver_id ? `/drivers/${event.driver_id}/profile` : "/safety/permits";

  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border border-gray-200 p-3 ${severityClass(event.severity, event.days_until_expiry)}`}
      data-testid={`alert-event-${event.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{event.detection_summary}</p>
          <p className="text-xs opacity-80">
            {event.rule_name} · {event.days_until_expiry}d · detected {new Date(event.detected_at).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={profileLink} className="text-xs font-medium text-slate-700 hover:underline">
            Open
          </Link>
          <Button
            type="button"
            data-testid={`ack-${event.id}`}
            disabled={ackMutation.isPending}
            onClick={() => ackMutation.mutate()}
          >
            Acknowledge
          </Button>
        </div>
      </div>
    </li>
  );
}

export function DocumentAlertsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"inbox" | "rules">("inbox");

  const inboxQuery = useQuery({
    queryKey: ["drivers", "document-alerts", "inbox", companyId],
    queryFn: () => getDocumentAlertsInbox(companyId),
    enabled: Boolean(companyId),
  });

  const rulesQuery = useQuery({
    queryKey: ["drivers", "document-alert-rules", companyId],
    queryFn: () => getDocumentAlertRules(companyId),
    enabled: Boolean(companyId) && tab === "rules",
  });

  const evaluateMutation = useMutation({
    mutationFn: () => evaluateDocumentAlerts(companyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["drivers", "document-alerts"] });
    },
  });

  const events = inboxQuery.data?.events ?? [];
  const pendingCount = inboxQuery.data?.pending_count ?? 0;
  const rules = rulesQuery.data?.document_alert_rules ?? [];

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.days_until_expiry - b.days_until_expiry),
    [events]
  );

  if (!companyId) {
    return <p className="p-6 text-sm text-gray-500">Select an operating company to view document expiry alerts.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl p-6" data-testid="document-alerts-page">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Document expiry alerts</h1>
          <p className="text-sm text-slate-600">
            Central inbox for CDL, medical, training, DQF, uploads, and permits — ARCHIVE-not-DELETE; legacy DQF chips remain on profile.
          </p>
        </div>
        <Button
          type="button"
          data-testid="run-evaluator"
          disabled={evaluateMutation.isPending}
          onClick={() => evaluateMutation.mutate()}
        >
          Run evaluator
        </Button>
      </header>

      <div className="mb-4 flex gap-2 border-b border-gray-200">
        <button
          type="button"
          className={`px-3 py-2 text-sm font-medium ${tab === "inbox" ? "border-b-2 border-slate-300 text-slate-700" : "text-gray-600"}`}
          onClick={() => setTab("inbox")}
        >
          Inbox ({pendingCount})
        </button>
        <button
          type="button"
          className={`px-3 py-2 text-sm font-medium ${tab === "rules" ? "border-b-2 border-slate-300 text-slate-700" : "text-gray-600"}`}
          onClick={() => setTab("rules")}
        >
          Rules
        </button>
      </div>

      {tab === "inbox" ? (
        <section>
          {inboxQuery.isLoading ? <p className="text-sm text-gray-500">Loading alerts…</p> : null}
          {sortedEvents.length === 0 && !inboxQuery.isLoading ? (
            <p className="text-sm text-gray-500" data-testid="alerts-empty">
              No pending document expiry alerts.
            </p>
          ) : null}
          <ul className="space-y-3">
            {sortedEvents.map((event) => (
              <InboxRow
                key={event.id}
                event={event}
                operatingCompanyId={companyId}
                onAcknowledged={() => {
                  void queryClient.invalidateQueries({ queryKey: ["drivers", "document-alerts", "inbox", companyId] });
                }}
              />
            ))}
          </ul>
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2">
          {rules.map((rule) => (
            <RuleEditor
              key={rule.id}
              rule={rule}
              operatingCompanyId={companyId}
              onSaved={() => {
                void queryClient.invalidateQueries({ queryKey: ["drivers", "document-alert-rules", companyId] });
              }}
            />
          ))}
        </section>
      )}
    </div>
  );
}
