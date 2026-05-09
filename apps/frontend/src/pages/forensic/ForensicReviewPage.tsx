import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { generateForensicReport, listForensicAnomalies, listForensicBatches, reviewForensicAnomaly, startForensicImport } from "../../api/forensic";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

function severityClass(severity: string) {
  if (severity === "critical") return "bg-red-100 text-red-700";
  if (severity === "suspicious") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-700";
}

export function ForensicReviewPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [reportLoadingBatchId, setReportLoadingBatchId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"pending" | "cleared" | "confirmed_issue" | "requires_legal">("pending");

  const batchesQuery = useQuery({
    queryKey: ["forensic", "batches"],
    queryFn: listForensicBatches,
  });
  const anomaliesQuery = useQuery({
    queryKey: ["forensic", "anomalies"],
    queryFn: listForensicAnomalies,
  });

  const activeBatches = useMemo(
    () => (batchesQuery.data?.batches ?? []).filter((batch) => batch.status === "in_progress"),
    [batchesQuery.data?.batches]
  );

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
            onClick={() => {
              if (!companyId) {
                pushToast("Select operating company first", "error");
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

      {batchesQuery.isError || anomaliesQuery.isError ? <ListErrorBanner onRetry={() => { void batchesQuery.refetch(); void anomaliesQuery.refetch(); }} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-sm font-semibold text-gray-900">Import batches</p>
          <div className="mt-2 space-y-2">
            {(batchesQuery.data?.batches ?? []).map((batch) => (
              <div key={batch.id} className="rounded border border-gray-100 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{batch.id}</span>
                  <span className={`rounded px-2 py-0.5 ${batch.status === "completed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
                    {batch.status}
                  </span>
                </div>
                <div className="mt-1 text-gray-600">
                  Entities: {batch.entities_imported} | Txns: {batch.transactions_imported} | Attachments: {batch.attachments_imported}
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-gray-100">
                  <div className="h-full bg-blue-500" style={{ width: batch.status === "completed" ? "100%" : batch.status === "in_progress" ? "55%" : "20%" }} />
                </div>
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
                </div>
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
              <select
                value={reviewStatus}
                onChange={(event) => setReviewStatus(event.target.value as typeof reviewStatus)}
                className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="pending">Pending</option>
                <option value="cleared">Cleared</option>
                <option value="confirmed_issue">Confirmed Issue</option>
                <option value="requires_legal">Requires Legal</option>
              </select>
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

