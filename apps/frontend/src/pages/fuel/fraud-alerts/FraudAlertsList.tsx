import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../../api/client";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ActionButton } from "../../../components/shared/ActionButton";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { userFacingApiError } from "../../../lib/api-error-message";

type FraudAlertRow = {
  uuid: string;
  fuel_transaction_uuid: string;
  rule_id: string;
  severity: "info" | "warn" | "critical";
  detected_at: string;
  evidence: Record<string, unknown>;
  status: string;
  transaction_at: string;
  gallons: number | null;
  location_city: string | null;
  location_state: string | null;
};

function severityClass(severity: FraudAlertRow["severity"]) {
  if (severity === "critical") return "bg-red-100 text-red-800";
  if (severity === "warn") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

async function listAlerts(companyId: string, status?: string, severity?: string) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  return apiRequest<{ alerts: FraudAlertRow[] }>(`/api/v1/fuel/fraud-alerts?${params.toString()}`);
}

export function FraudAlertsListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("open");

  const alertsQuery = useQuery({
    queryKey: ["fuel", "fraud-alerts", companyId, statusFilter],
    queryFn: () => listAlerts(companyId, statusFilter),
    enabled: Boolean(companyId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["fuel", "fraud-alerts"] });
  };

  const investigateMut = useMutation({
    mutationFn: (uuid: string) =>
      apiRequest(`/api/v1/fuel/fraud-alerts/${uuid}/investigate`, {
        method: "PATCH",
        body: { operating_company_id: companyId },
      }),
    onSuccess: () => {
      pushToast("Alert marked investigating.", "success");
      invalidate();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not mark the alert as investigating"), "error"),
  });

  const confirmMut = useMutation({
    mutationFn: (uuid: string) =>
      apiRequest(`/api/v1/fuel/fraud-alerts/${uuid}/confirm-fraud`, {
        method: "PATCH",
        body: { operating_company_id: companyId },
      }),
    onSuccess: () => {
      pushToast("Alert confirmed as fraud.", "error");
      invalidate();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not confirm the alert as fraud"), "error"),
  });

  const dismissMut = useMutation({
    mutationFn: ({ uuid, reason }: { uuid: string; reason: string }) =>
      apiRequest(`/api/v1/fuel/fraud-alerts/${uuid}/dismiss`, {
        method: "PATCH",
        body: { operating_company_id: companyId, reason },
      }),
    onSuccess: () => {
      pushToast("Alert dismissed.", "success");
      invalidate();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not dismiss the alert"), "error"),
  });

  const rows = alertsQuery.data?.alerts ?? [];

  const columns = useMemo<ParityColumn<FraudAlertRow>[]>(
    () => [
      { key: "detected_at", label: "Detected", sortable: true, render: (row) => new Date(row.detected_at).toLocaleString() },
      {
        key: "severity",
        label: "Severity",
        sortable: true,
        render: (row) => (
          <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${severityClass(row.severity)}`}>{row.severity}</span>
        ),
      },
      { key: "rule_id", label: "Rule", sortable: true, cellClass: "font-mono text-[10px]", render: (row) => row.rule_id },
      {
        key: "location_city",
        label: "Location",
        sortable: true,
        render: (row) => [row.location_city, row.location_state].filter(Boolean).join(", ") || "—",
      },
      { key: "gallons", label: "Gallons", sortable: true, render: (row) => (row.gallons != null ? row.gallons.toFixed(1) : "—") },
      { key: "status", label: "Status", sortable: true, render: (row) => row.status },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <div className="flex flex-wrap gap-1">
            <ActionButton disabled={investigateMut.isPending} onClick={() => investigateMut.mutate(row.uuid)}>
              Investigate
            </ActionButton>
            <ActionButton disabled={confirmMut.isPending} onClick={() => confirmMut.mutate(row.uuid)}>
              Confirm fraud
            </ActionButton>
            <ActionButton
              disabled={dismissMut.isPending}
              onClick={() => {
                const reason = window.prompt("Dismiss reason");
                if (reason?.trim()) dismissMut.mutate({ uuid: row.uuid, reason: reason.trim() });
              }}
            >
              Dismiss
            </ActionButton>
          </div>
        ),
      },
    ],
    [investigateMut, confirmMut, dismissMut],
  );

  if (!companyId) {
    return (
      <div className="space-y-3 p-4">
        <PageHeader title="Fuel fraud alerts" subtitle="CAP-11 real-time fuel card fraud monitoring" />
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          Select an operating company to view fraud alerts.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Fuel fraud alerts"
        subtitle="CAP-11 real-time fuel card fraud monitoring"
        actions={
          <Link to="/fuel" className="text-xs font-semibold text-slate-700 hover:underline">
            Back to Fuel Home
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {["open", "investigating", "dismissed", "confirmed_fraud"].map((status) => (
          <button
            key={status}
            type="button"
            className={`rounded-sm border px-2 py-1 text-xs ${statusFilter === status ? "border-slate-300 bg-slate-100" : "border-gray-300"}`}
            onClick={() => setStatusFilter(status)}
          >
            {status.replace("_", " ")}
          </button>
        ))}
      </div>

      {alertsQuery.isError ? (
        <ListErrorBanner onRetry={() => void alertsQuery.refetch()} />
      ) : (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.uuid}
          loading={alertsQuery.isLoading}
          storageKey="fuel-fraud-alerts"
          emptyText="No fraud alerts for this filter."
          exportFilename="fuel-fraud-alerts"
        />
      )}
    </div>
  );
}
