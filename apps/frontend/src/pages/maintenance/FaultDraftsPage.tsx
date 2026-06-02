import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";

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

  const drafts = draftsQuery.data?.drafts ?? [];
  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Fault-Driven Drafts"
        subtitle="Auto-created draft work orders from high-severity Samsara fault codes — review, assign shop, and confirm."
      />
      <div className="flex gap-2 text-sm">
        <Link to="/maintenance" className="text-blue-700 underline">
          Maintenance home
        </Link>
        <span className="text-gray-400">·</span>
        <Link to="/maintenance/fault-rules" className="text-blue-700 underline">
          Fault rules
        </Link>
      </div>

      {draftsQuery.isLoading ? <p className="text-sm text-gray-600">Loading drafts…</p> : null}
      {draftsQuery.isError ? <p className="text-sm text-red-600">Failed to load fault-driven drafts.</p> : null}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Fault code</th>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Occurred</th>
              <th className="px-3 py-2">WO status</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {drafts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No fault-driven draft work orders pending review.
                </td>
              </tr>
            ) : (
              drafts.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{row.unit_number ?? row.unit_id.slice(0, 8)}</td>
                  <td className="px-3 py-2">{row.fault_code ?? "—"}</td>
                  <td className="px-3 py-2 capitalize">{row.fault_severity ?? "—"}</td>
                  <td className="px-3 py-2">{row.fault_occurred_at ? new Date(row.fault_occurred_at).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="secondary" onClick={() => setSelectedId(row.id)}>
                      Review
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold">{selected.wo_title ?? selected.display_id ?? "Draft WO"}</h3>
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
