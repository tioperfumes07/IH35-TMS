import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { PageHeader } from "../../components/forms/shared/PageHeader";

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
  const { pushToast } = useToast();
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
    // ALERTS-F6325: zero error handling anywhere in this file — no toast import at all, no
    // isError render, no try/catch at the fire-and-forget .mutate() call sites. A rejected save
    // silently did nothing on this CDL/medical/permit expiry-alerts page.
    onError: (err) => pushToast(userFacingApiError(err, "Could not save the alert rule"), "error"),
  });

  return (
    <div className="rounded-sm border border-gray-200 p-3" data-testid={`rule-editor-${rule.document_type}`}>
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
          className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
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
  const { pushToast } = useToast();
  const ackMutation = useMutation({
    mutationFn: () => acknowledgeDocumentAlert(event.id, operatingCompanyId, "Reviewed from alerts inbox"),
    onSuccess: onAcknowledged,
    // ALERTS-F6325: see saveMutation above — same file-wide gap.
    onError: (err) => pushToast(userFacingApiError(err, "Could not acknowledge the alert"), "error"),
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

type DocumentAlertsTab = "inbox" | "rules";

function parseDocumentAlertsTab(raw: string | null): DocumentAlertsTab {
  return raw === "rules" ? "rules" : "inbox";
}

export function DocumentAlertsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inboxPage, setInboxPage] = useState(1);
  const inboxPageSize = 50;
  const tab = parseDocumentAlertsTab(searchParams.get("tab"));
  const setTab = (next: DocumentAlertsTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "inbox") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const inboxQuery = useQuery({
    queryKey: ["drivers", "document-alerts", "inbox", companyId, inboxPage],
    queryFn: () => getDocumentAlertsInbox(companyId, { limit: inboxPageSize, offset: (inboxPage - 1) * inboxPageSize }),
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
    // ALERTS-F6325: see saveMutation above — same file-wide gap.
    onError: (err) => pushToast(userFacingApiError(err, "Could not run the alert evaluator"), "error"),
  });

  const events = inboxQuery.isError ? [] : inboxQuery.data?.events ?? [];
  const pendingCount = inboxQuery.isError ? 0 : inboxQuery.data?.pending_count ?? 0;
  const rules = rulesQuery.isError ? [] : rulesQuery.data?.document_alert_rules ?? [];

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.days_until_expiry - b.days_until_expiry),
    [events]
  );

  useEffect(() => setInboxPage(1), [companyId]);
  const inboxTotalPages = Math.max(1, Math.ceil(pendingCount / inboxPageSize));
  useEffect(() => {
    if (inboxPage > inboxTotalPages) setInboxPage(inboxTotalPages);
  }, [inboxPage, inboxTotalPages]);

  if (!companyId) {
    return <p className="p-6 text-sm text-gray-500">Select an operating company to view document expiry alerts.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl p-6" data-testid="document-alerts-page">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see TrainingProgramsPage.tsx sibling comment. */}
      <PageHeader
        title="Document expiry alerts"
        subtitle="Central inbox for CDL, medical, training, DQF, uploads, and permits — ARCHIVE-not-DELETE; legacy DQF chips remain on profile."
        breadcrumb={[{ label: "Drivers" }, { label: "Document Alerts" }]}
        backHref="/drivers"
        actions={
          <Button
            type="button"
            data-testid="run-evaluator"
            disabled={evaluateMutation.isPending}
            onClick={() => evaluateMutation.mutate()}
          >
            Run evaluator
          </Button>
        }
      />

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
          {inboxQuery.isError ? (
            <ListErrorState
              title="Couldn't load document alerts"
              status={0}
              message={(inboxQuery.error as Error)?.message}
              onRetry={() => void inboxQuery.refetch()}
            />
          ) : null}
          {inboxQuery.isLoading ? <p className="text-sm text-gray-500">Loading alerts…</p> : null}
          {sortedEvents.length === 0 && !inboxQuery.isLoading && !inboxQuery.isError ? (
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
          {pendingCount > 0 ? (
            <div className="mt-4 flex items-center justify-between gap-3 text-sm" data-testid="document-alerts-server-pager">
              <span>
                {Math.min((inboxPage - 1) * inboxPageSize + 1, pendingCount)}–{Math.min(inboxPage * inboxPageSize, pendingCount)} of {pendingCount}
              </span>
              <div className="flex gap-2">
                <Button type="button" disabled={inboxPage <= 1 || inboxQuery.isFetching} onClick={() => setInboxPage((page) => Math.max(1, page - 1))}>Previous</Button>
                <Button type="button" disabled={inboxPage >= inboxTotalPages || inboxQuery.isFetching} onClick={() => setInboxPage((page) => Math.min(inboxTotalPages, page + 1))}>Next</Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-2">
          {rulesQuery.isError ? (
            <div className="md:col-span-2">
              <ListErrorState
                title="Couldn't load document alert rules"
                status={0}
                message={(rulesQuery.error as Error)?.message}
                onRetry={() => void rulesQuery.refetch()}
              />
            </div>
          ) : null}
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
