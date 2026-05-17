import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  disconnectQboConnection,
  type ForensicAuditLogRow,
  type ForensicLivePayload,
  generateForensicReport,
  getForensicLiveUrl,
  getRunnerStatus,
  getQboAuthorizeStartUrl,
  getQboConnectionStatus,
  listForensicAuditLog,
  listForensicAnomalies,
  listForensicBatches,
  reviewForensicAnomaly,
  startForensicImport,
} from "../../api/forensic";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

function severityClass(severity: string) {
  if (severity === "critical") return "bg-red-100 text-red-700";
  if (severity === "suspicious") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-700";
}

function heartbeatClass(ageSeconds: number | null) {
  if (ageSeconds === null) return "bg-gray-100 text-gray-700";
  if (ageSeconds < 60) return "bg-green-100 text-green-700";
  if (ageSeconds <= 300) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function runnerPillClass(initialized: boolean, error: string | null, lastTickAt: string | null) {
  if (error) return "bg-red-100 text-red-700";
  if (!initialized) return "bg-amber-100 text-amber-700";
  if (!lastTickAt) return "bg-yellow-100 text-yellow-700";
  const ageSec = Math.max(0, Math.floor((Date.now() - new Date(lastTickAt).getTime()) / 1000));
  if (ageSec <= 180) return "bg-green-100 text-green-700";
  if (ageSec <= 600) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export function ForensicReviewPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId, companies } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [reportLoadingBatchId, setReportLoadingBatchId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"pending" | "cleared" | "confirmed_issue" | "requires_legal">("pending");
  const [disconnectingCompanyId, setDisconnectingCompanyId] = useState<string | null>(null);
  const [liveByBatch, setLiveByBatch] = useState<Record<string, ForensicLivePayload>>({});
  const [expandedAuditBatchId, setExpandedAuditBatchId] = useState<string | null>(null);

  const forensicCompanies = useMemo(() => {
    const byCode = companies.filter((company) => {
      const code = (company.code ?? "").toUpperCase();
      return code === "TRK" || code === "TRANSP";
    });
    return byCode.length > 0 ? byCode : companies.slice(0, 2);
  }, [companies]);

  const batchesQuery = useQuery({
    queryKey: ["forensic", "batches"],
    queryFn: listForensicBatches,
  });
  const anomaliesQuery = useQuery({
    queryKey: ["forensic", "anomalies"],
    queryFn: listForensicAnomalies,
  });
  const qboStatusQuery = useQuery({
    queryKey: ["forensic", "qbo-status", forensicCompanies.map((company) => company.id).join(",")],
    enabled: forensicCompanies.length > 0,
    queryFn: async () => {
      const statuses = await Promise.all(
        forensicCompanies.map(async (company) => ({ companyId: company.id, status: await getQboConnectionStatus(company.id) }))
      );
      return statuses.reduce<Record<string, Awaited<ReturnType<typeof getQboConnectionStatus>>>>((acc, item) => {
        acc[item.companyId] = item.status;
        return acc;
      }, {});
    },
  });
  const runnerStatusQuery = useQuery({
    queryKey: ["forensic", "runner-status"],
    queryFn: getRunnerStatus,
    refetchInterval: 30000,
  });
  const auditLogQuery = useQuery({
    queryKey: ["forensic", "audit-log", expandedAuditBatchId],
    queryFn: () => listForensicAuditLog(expandedAuditBatchId ?? "", 100),
    enabled: Boolean(expandedAuditBatchId),
  });

  const activeBatches = useMemo(
    () => (batchesQuery.data?.batches ?? []).filter((batch) => batch.status === "in_progress"),
    [batchesQuery.data?.batches]
  );
  const selectedCompanyConnected = companyId ? Boolean(qboStatusQuery.data?.[companyId]?.connected) : false;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authorized = params.get("qbo_authorized");
    const companyFromQuery = params.get("company_id");
    if (authorized === "true") {
      const companyName = companies.find((company) => company.id === companyFromQuery)?.short_name ?? "company";
      pushToast(`QBO authorization saved for ${companyName}`, "success");
      params.delete("qbo_authorized");
      params.delete("company_id");
      const next = params.toString();
      const url = `${window.location.pathname}${next ? `?${next}` : ""}`;
      window.history.replaceState({}, "", url);
      void queryClient.invalidateQueries({ queryKey: ["forensic", "qbo-status"] });
    }
  }, [companies, pushToast, queryClient]);

  useEffect(() => {
    const batches = batchesQuery.data?.batches ?? [];
    const inProgress = batches.filter((batch) => batch.status === "in_progress");
    const eventSources = inProgress.map((batch) => {
      const source = new EventSource(getForensicLiveUrl(batch.id));
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as ForensicLivePayload;
          setLiveByBatch((prev) => ({ ...prev, [batch.id]: payload }));
          if (payload.status !== "in_progress") {
            source.close();
            void queryClient.invalidateQueries({ queryKey: ["forensic", "batches"] });
          }
        } catch {
          // ignore invalid payloads
        }
      };
      source.onerror = () => {
        source.close();
      };
      return source;
    });

    return () => {
      eventSources.forEach((source) => source.close());
    };
  }, [batchesQuery.data?.batches, queryClient]);

  if (auth.user?.role !== "Owner") {
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">Owner role required.</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Forensic Review"
        subtitle="QBO historical archive + anomaly review"
        actions={
          <ActionButton
            disabled={!selectedCompanyConnected}
            onClick={() => {
              if (!companyId) {
                pushToast("Select operating company first", "error");
                return;
              }
              if (!selectedCompanyConnected) {
                pushToast("Authorize QBO for selected company first", "error");
                return;
              }
              void startForensicImport(companyId)
                .then((res) => {
                  pushToast(`Import batch started: ${res.batch_id}`, "success");
                  void queryClient.invalidateQueries({ queryKey: ["forensic", "batches"] });
                })
                .catch((error) => pushToast(String((error as Error).message || "Failed to start import"), "error"));
            }}
          >
            Start Import Batch
          </ActionButton>
        }
      />

      {batchesQuery.isError || anomaliesQuery.isError || qboStatusQuery.isError ? (
        <ListErrorBanner
          onRetry={() => {
            void batchesQuery.refetch();
            void anomaliesQuery.refetch();
            void qboStatusQuery.refetch();
          }}
        />
      ) : null}

      <div className="rounded border border-gray-200 bg-white p-3">
        <p className="text-sm font-semibold text-gray-900">Runner Status</p>
        {runnerStatusQuery.data ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded px-2 py-0.5 ${runnerPillClass(runnerStatusQuery.data.forensic_runner.initialized, runnerStatusQuery.data.forensic_runner.error, runnerStatusQuery.data.forensic_runner.last_tick_at)}`}>
              Forensic runner
            </span>
            <span className={`rounded px-2 py-0.5 ${runnerPillClass(runnerStatusQuery.data.sync_queue_runner.initialized, runnerStatusQuery.data.sync_queue_runner.error, runnerStatusQuery.data.sync_queue_runner.last_tick_at)}`}>
              Sync queue
            </span>
            <span className={`rounded px-2 py-0.5 ${runnerPillClass(runnerStatusQuery.data.token_refresh_cron.initialized, runnerStatusQuery.data.token_refresh_cron.error, runnerStatusQuery.data.token_refresh_cron.last_tick_at)}`}>
              Token refresh
            </span>
            <span className="text-gray-500">Uptime: {runnerStatusQuery.data.server_uptime_seconds}s</span>
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-500">Loading runner status...</p>
        )}
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <p className="text-sm font-semibold text-gray-900">QBO Authorization</p>
        <div className="mt-2 space-y-2">
          {forensicCompanies.map((company) => {
            const status = qboStatusQuery.data?.[company.id];
            const connected = Boolean(status?.connected);
            const expiresAt = status?.refresh_token_expires_at ? new Date(status.refresh_token_expires_at) : null;
            const expiresInDays = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;
            return (
              <div key={company.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 p-2 text-xs">
                <div>
                  <p className="font-semibold text-gray-900">{company.short_name ?? company.legal_name}</p>
                  <p className={connected ? "text-green-700" : "text-red-700"}>{connected ? "Connected" : "Not Connected"}</p>
                  <p className="text-gray-500">
                    Last refreshed: {status?.last_refreshed_at ? new Date(status.last_refreshed_at).toLocaleString() : "Never"}
                  </p>
                  <p className="text-gray-500">
                    Refresh token expires: {expiresInDays !== null ? `${expiresInDays} day(s)` : "N/A"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <ActionButton
                    onClick={() => {
                      const url = getQboAuthorizeStartUrl(company.id);
                      window.location.assign(url);
                    }}
                  >
                    Authorize
                  </ActionButton>
                  {connected ? (
                    <ActionButton
                      disabled={disconnectingCompanyId === company.id}
                      onClick={() => {
                        setDisconnectingCompanyId(company.id);
                        void disconnectQboConnection(company.id)
                          .then(() => {
                            pushToast(`Disconnected QBO for ${company.short_name ?? company.legal_name}`, "success");
                            void queryClient.invalidateQueries({ queryKey: ["forensic", "qbo-status"] });
                          })
                          .catch((error) => pushToast(String((error as Error).message || "Failed to disconnect QBO"), "error"))
                          .finally(() => setDisconnectingCompanyId(null));
                      }}
                    >
                      {disconnectingCompanyId === company.id ? "Disconnecting..." : "Disconnect"}
                    </ActionButton>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-sm font-semibold text-gray-900">Import batches</p>
          <div className="mt-2 space-y-2">
            {(batchesQuery.data?.batches ?? []).map((batch) => (
              <div key={batch.id} className="rounded border border-gray-100 p-2 text-xs">
                {(() => {
                  const live = liveByBatch[batch.id];
                  const entities = live?.entities_imported ?? batch.entities_imported;
                  const transactions = live?.transactions_imported ?? batch.transactions_imported;
                  const attachments = live?.attachments_imported ?? batch.attachments_imported;
                  const errors = live?.errors_count ?? batch.errors_count;
                  const total = entities + transactions + attachments;
                  const estimatedTotal = Math.max(total, batch.status === "in_progress" ? 1000 : total || 1);
                  const pct = Math.min(100, Math.round((total / estimatedTotal) * 100));
                  return (
                    <>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{batch.id}</span>
                  <span className={`rounded px-2 py-0.5 ${batch.status === "completed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
                    {batch.status}
                  </span>
                </div>
                <div className="mt-1 text-gray-600">
                  Entities: {entities} | Txns: {transactions} | Attachments: {attachments} | Errors: {errors}
                </div>
                {batch.status === "in_progress" ? (
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 ${heartbeatClass(live?.heartbeat_age_seconds ?? null)}`}>
                      Heartbeat:{" "}
                      {live?.heartbeat_age_seconds === null || live?.heartbeat_age_seconds === undefined
                        ? "n/a"
                        : `${live.heartbeat_age_seconds}s ago`}
                    </span>
                    <span className="text-gray-500">
                      Phase: {live?.current_phase ?? "pending"}{" "}
                      {live?.current_entity_type ? `· ${live.current_entity_type}` : ""}{" "}
                      {live?.current_page ? `page ${live.current_page}${live.current_total_pages ? `/${live.current_total_pages}` : ""}` : ""}
                    </span>
                  </div>
                ) : null}
                <div className="mt-1 h-2 overflow-hidden rounded bg-gray-100">
                  <div className="h-full bg-blue-500" style={{ width: batch.status === "in_progress" ? `${pct}%` : batch.status === "completed" ? "100%" : "20%" }} />
                </div>
                {batch.status === "in_progress" && live?.recent_errors?.length ? (
                  <details className="mt-2 rounded border border-red-100 bg-red-50 p-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-red-700">Recent errors ({live.recent_errors.length})</summary>
                    <div className="mt-1 space-y-1">
                      {live.recent_errors.map((item) => (
                        <div key={`${item.at}-${item.message}`} className="text-[11px] text-red-700">
                          {new Date(item.at).toLocaleTimeString()} - {item.message}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <ActionButton
                    disabled={reportLoadingBatchId === batch.id}
                    onClick={() => {
                      setReportLoadingBatchId(batch.id);
                      void generateForensicReport(batch.id)
                        .then((res) => {
                          pushToast(`Report generated: ${res.filename}`, "success");
                        })
                        .catch((error) => pushToast(String((error as Error).message || "Report generation failed"), "error"))
                        .finally(() => setReportLoadingBatchId(null));
                    }}
                  >
                    {reportLoadingBatchId === batch.id ? "Generating..." : "Generate Report"}
                  </ActionButton>
                  <ActionButton
                    onClick={() => setExpandedAuditBatchId((prev) => (prev === batch.id ? null : batch.id))}
                  >
                    {expandedAuditBatchId === batch.id ? "Hide Audit Trail" : "Audit Trail"}
                  </ActionButton>
                </div>
                {expandedAuditBatchId === batch.id ? (
                  <div className="mt-2 max-h-40 overflow-auto rounded border border-gray-100 bg-gray-50 p-2">
                    {(auditLogQuery.data?.rows ?? []).length === 0 ? (
                      <p className="text-[11px] text-gray-500">No audit rows yet.</p>
                    ) : (
                      (auditLogQuery.data?.rows ?? []).map((row: ForensicAuditLogRow) => (
                        <div key={row.id} className="border-b border-gray-200 py-1 text-[11px] text-gray-700 last:border-b-0">
                          <span className="font-semibold">{row.event_type}</span> · {new Date(row.occurred_at).toLocaleString()}
                          {row.entity_type ? ` · ${row.entity_type}` : ""}
                          {row.records_processed !== null ? ` · records ${row.records_processed}` : ""}
                          {row.error_message ? ` · ${row.error_message}` : ""}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-500">Active in-progress batches: {activeBatches.length}</div>
        </div>

        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-sm font-semibold text-gray-900">Anomaly review queue</p>
          <div className="mt-2 max-h-[520px] space-y-2 overflow-auto">
            {(anomaliesQuery.data?.anomalies ?? []).map((anomaly) => (
              <button
                key={anomaly.id}
                type="button"
                onClick={() => {
                  setSelectedAnomalyId(anomaly.id);
                  setReviewStatus((anomaly.review_status as typeof reviewStatus) ?? "pending");
                  setReviewNotes(anomaly.review_notes ?? "");
                }}
                className={`w-full rounded border px-2 py-2 text-left ${
                  selectedAnomalyId === anomaly.id ? "border-blue-400 bg-blue-50" : "border-gray-100 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-900">{anomaly.anomaly_type}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] ${severityClass(anomaly.severity)}`}>{anomaly.severity}</span>
                </div>
                <div className="mt-1 text-xs text-gray-600">{anomaly.qbo_txn_type ?? "txn"} | {(Number(anomaly.total_cents ?? 0) / 100).toFixed(2)} USD</div>
                <div className="text-xs text-gray-500">Status: {anomaly.review_status ?? "pending"}</div>
              </button>
            ))}
          </div>
          {selectedAnomalyId ? (
            <div className="mt-3 rounded border border-gray-100 p-2">
              <p className="text-xs font-semibold text-gray-700">Review anomaly {selectedAnomalyId}</p>
              <SelectCombobox
                value={reviewStatus}
                onChange={(event) => setReviewStatus(event.target.value as typeof reviewStatus)}
                className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="pending">Pending</option>
                <option value="cleared">Cleared</option>
                <option value="confirmed_issue">Confirmed Issue</option>
                <option value="requires_legal">Requires Legal</option>
              </SelectCombobox>
              <textarea
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                rows={3}
                className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                placeholder="Review notes"
              />
              <ActionButton
                onClick={() => {
                  if (!selectedAnomalyId) return;
                  void reviewForensicAnomaly(selectedAnomalyId, {
                    review_status: reviewStatus,
                    review_notes: reviewNotes,
                  })
                    .then(() => {
                      pushToast("Anomaly review updated", "success");
                      void queryClient.invalidateQueries({ queryKey: ["forensic", "anomalies"] });
                    })
                    .catch((error) => pushToast(String((error as Error).message || "Failed to review anomaly"), "error"));
                }}
              >
                Save Review
              </ActionButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

