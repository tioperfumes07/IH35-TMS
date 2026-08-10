import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { entityLabel } from "../../lib/entity-label";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

type FaultDraft = {
  id: string;
  display_id: string | null;
  wo_title: string | null;
  description: string | null;
  status: string;
  unit_number: string | null;
  fault_code: string | null;
  fault_severity: string | null;
  fault_occurred_at: string | null;
  unit_id: string;
};

function fetchDrafts(companyId: string) {
  return apiRequest<{ drafts: FaultDraft[] }>(
    `/api/v1/maintenance/auto-wo-drafts?operating_company_id=${encodeURIComponent(companyId)}`
  );
}

export function FaultDraftsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  // Vehicle profile "View fault history" → ?unit_id= (MaintenanceSnapshotSection).
  const deepLinkUnitId = searchParams.get("unit_id");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const draftsQuery = useQuery({
    queryKey: ["maintenance", "fault-drafts", companyId],
    queryFn: () => fetchDrafts(companyId),
    enabled: Boolean(companyId),
  });

  const confirmMutation = useMutation({
    mutationFn: (workOrderId: string) =>
      apiRequest(`/api/v1/maintenance/work-orders/${workOrderId}/transition`, {
        method: "POST",
        body: {
          operating_company_id: companyId,
          to_status: "open",
        },
      }),
    onSuccess: () => {
      pushToast("Draft work order confirmed and opened.", "success");
      queryClient.invalidateQueries({ queryKey: ["maintenance", "fault-drafts", companyId] });
      setSelectedId(null);
    },
    onError: () => pushToast("Could not confirm draft work order.", "error"),
  });

  const drafts = useMemo(() => {
    const all = draftsQuery.data?.drafts ?? [];
    if (!deepLinkUnitId) return all;
    return all.filter((d) => d.unit_id === deepLinkUnitId);
  }, [draftsQuery.data?.drafts, deepLinkUnitId]);
  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  const columns = useMemo<ParityColumn<FaultDraft>[]>(
    () => [
      { key: "unit_id", label: "Unit", render: (row) => <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} /> },
      { key: "fault_code", label: "Fault code", sortable: true, render: (row) => row.fault_code ?? "—" },
      { key: "fault_severity", label: "Severity", sortable: true, render: (row) => <span className="capitalize">{row.fault_severity ?? "—"}</span> },
      {
        key: "fault_occurred_at",
        label: "Occurred",
        sortable: true,
        render: (row) => (row.fault_occurred_at ? `${formatDateTimeUS(row.fault_occurred_at)} CT` : "—"),
      },
      { key: "status", label: "WO status", sortable: true, render: (row) => row.status },
      {
        key: "action",
        label: "Action",
        alwaysVisible: true,
        render: (row) => (
          <Button size="sm" variant="secondary" onClick={() => setSelectedId(row.id)}>
            Review
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Fault-Driven Drafts"
        subtitle="Auto-created draft work orders from high-severity Samsara fault codes — review, assign shop, and confirm."
      />
      <div className="flex gap-2 text-sm">
        <Link to="/maintenance" className="text-slate-700 underline">
          Maintenance home
        </Link>
        <span className="text-gray-400">·</span>
        <Link to="/maintenance/fault-rules" className="text-slate-700 underline">
          Fault rules
        </Link>
      </div>

      {draftsQuery.isError ? <p className="text-sm text-red-600">Failed to load fault-driven drafts.</p> : null}

      {deepLinkUnitId ? (
        <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Filtered to unit <span className="font-semibold">{entityLabel(null, deepLinkUnitId, "Unit")}</span>
          {" — "}
          <Link to="/maintenance/fault-drafts" className="underline">
            clear filter
          </Link>
        </p>
      ) : null}

      <ParityTable
        rows={drafts}
        columns={columns}
        rowKey={(row) => row.id}
        loading={draftsQuery.isLoading}
        storageKey="maintenance-fault-drafts"
        emptyText={
          deepLinkUnitId
            ? "No fault-driven drafts for this unit."
            : "No fault-driven draft work orders pending review."
        }
        exportFilename="fault-drafts"
      />

      {selected ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-sm bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold">{selected.wo_title ?? entityLabel(null, selected.display_id, "Work order") ?? "Draft WO"}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{selected.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to={`/maintenance/work-orders/${selected.id}`}>
                <Button size="sm">Open WO detail</Button>
              </Link>
              <Button
                size="sm"
                variant="secondary"
                disabled={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate(selected.id)}
              >
                Confirm &amp; open WO
              </Button>
              <Button size="sm" variant="tertiary" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
