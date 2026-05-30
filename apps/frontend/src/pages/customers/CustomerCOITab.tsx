import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  createInsuranceCoiRequest,
  listInsuranceCoiRequests,
  updateInsuranceCoiRequest,
  type CoiRequestStatus,
  type InsuranceCoiRequest,
} from "../../api/insurance";
import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { DataPanel } from "../../components/layout/DataPanel";
import { StatusBadge } from "../../components/layout/StatusBadge";

type Props = {
  customerId: string;
  customerName: string;
  operatingCompanyId?: string;
};

const STATUS_OPTIONS: CoiRequestStatus[] = ["pending", "sent", "received", "expired", "dismissed"];

function statusVariant(status: CoiRequestStatus): "neutral" | "warn" | "positive" | "crit" {
  if (status === "received") return "positive";
  if (status === "expired") return "warn";
  if (status === "dismissed") return "crit";
  return "neutral";
}

function statusLabel(status: CoiRequestStatus) {
  return status.replace("_", " ");
}

export function CustomerCOITab({ customerId, customerName, operatingCompanyId }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"" | CoiRequestStatus>("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNotes, setRequestNotes] = useState("");
  const [requestExpiresAt, setRequestExpiresAt] = useState("");
  const [requestPolicyId, setRequestPolicyId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<CoiRequestStatus>("pending");
  const [editNotes, setEditNotes] = useState("");
  const [editDocumentUrl, setEditDocumentUrl] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");

  const query = useQuery({
    queryKey: ["insurance-coi-requests", operatingCompanyId ?? "none", customerId, statusFilter || "all"],
    queryFn: () =>
      listInsuranceCoiRequests({
        operating_company_id: operatingCompanyId!,
        customer_id: customerId,
        status: statusFilter || undefined,
      }).then((result) => result.requests),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createInsuranceCoiRequest({
        operating_company_id: operatingCompanyId!,
        customer_id: customerId,
        policy_id: requestPolicyId.trim() ? requestPolicyId.trim() : null,
        notes: requestNotes.trim() ? requestNotes.trim() : null,
        expires_at: requestExpiresAt || null,
      }),
    onSuccess: () => {
      pushToast("COI request created", "success");
      setRequestNotes("");
      setRequestExpiresAt("");
      setRequestPolicyId("");
      setRequestOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["insurance-coi-requests", operatingCompanyId ?? "none", customerId] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        pushToast("Customer or policy not found", "error");
        return;
      }
      pushToast("Failed to create COI request", "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      updateInsuranceCoiRequest(id, operatingCompanyId!, {
        status: editStatus,
        notes: editNotes.trim() ? editNotes.trim() : null,
        document_url: editDocumentUrl.trim() ? editDocumentUrl.trim() : null,
        expires_at: editExpiresAt || null,
      }),
    onSuccess: () => {
      pushToast("COI request updated", "success");
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ["insurance-coi-requests", operatingCompanyId ?? "none", customerId] });
    },
    onError: () => pushToast("Failed to update COI request", "error"),
  });

  const requests = query.data ?? [];
  const selected = useMemo(
    () => (editingId ? requests.find((request) => request.id === editingId) ?? null : null),
    [editingId, requests]
  );

  function beginEdit(request: InsuranceCoiRequest) {
    setEditingId(request.id);
    setEditStatus(request.status);
    setEditNotes(request.notes ?? "");
    setEditDocumentUrl(request.document_url ?? "");
    setEditExpiresAt(request.expires_at ?? "");
  }

  if (!operatingCompanyId) {
    return <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to manage COI requests.</div>;
  }

  return (
    <DataPanel title={`COI Requests · ${customerName}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-gray-600">
          Status filter
          <select
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs"
            value={statusFilter}
            onChange={(event) => setStatusFilter((event.target.value || "") as "" | CoiRequestStatus)}
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="secondary" onClick={() => setRequestOpen((open) => !open)}>
          {requestOpen ? "Close Request Form" : "Request COI"}
        </Button>
      </div>

      {requestOpen ? (
        <div className="mb-3 grid gap-2 rounded border border-gray-200 bg-gray-50 p-3 md:grid-cols-2">
          <label className="block text-xs">
            Policy ID (optional)
            <input
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={requestPolicyId}
              onChange={(event) => setRequestPolicyId(event.target.value)}
              placeholder="policy uuid"
            />
          </label>
          <label className="block text-xs">
            Expires At (optional)
            <input
              type="date"
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={requestExpiresAt}
              onChange={(event) => setRequestExpiresAt(event.target.value)}
            />
          </label>
          <label className="block text-xs md:col-span-2">
            Notes
            <textarea
              rows={2}
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={requestNotes}
              onChange={(event) => setRequestNotes(event.target.value)}
              placeholder="Requested coverage details"
            />
          </label>
          <div className="md:col-span-2">
            <Button size="sm" onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
              Create Request
            </Button>
          </div>
        </div>
      ) : null}

      {query.isLoading ? <div className="text-sm text-gray-500">Loading COI requests...</div> : null}
      {query.isError ? <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">Failed to load COI requests.</div> : null}

      {!query.isLoading && requests.length === 0 ? <div className="text-sm text-gray-600">No COI requests yet for this customer.</div> : null}

      {requests.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-2 py-1.5 font-semibold">Requested</th>
                <th className="px-2 py-1.5 font-semibold">Status</th>
                <th className="px-2 py-1.5 font-semibold">Expires</th>
                <th className="px-2 py-1.5 font-semibold">Document</th>
                <th className="px-2 py-1.5 font-semibold">Notes</th>
                <th className="px-2 py-1.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-b border-gray-100 align-top">
                  <td className="px-2 py-1.5 text-gray-800">{new Date(request.requested_at).toLocaleString()}</td>
                  <td className="px-2 py-1.5">
                    <StatusBadge variant={statusVariant(request.status)}>{statusLabel(request.status)}</StatusBadge>
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">{request.expires_at ?? "-"}</td>
                  <td className="px-2 py-1.5 text-gray-700">
                    {request.document_url ? (
                      <a className="text-blue-700 underline" href={request.document_url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="max-w-[24rem] px-2 py-1.5 text-gray-700">{request.notes || "-"}</td>
                  <td className="px-2 py-1.5">
                    <Button size="sm" variant="secondary" onClick={() => beginEdit(request)}>
                      Update
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <div className="mt-3 grid gap-2 rounded border border-gray-200 bg-gray-50 p-3 md:grid-cols-2">
          <label className="block text-xs">
            Status
            <select
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={editStatus}
              onChange={(event) => setEditStatus(event.target.value as CoiRequestStatus)}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Expires At
            <input
              type="date"
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={editExpiresAt}
              onChange={(event) => setEditExpiresAt(event.target.value)}
            />
          </label>
          <label className="block text-xs md:col-span-2">
            Document URL
            <input
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={editDocumentUrl}
              onChange={(event) => setEditDocumentUrl(event.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="block text-xs md:col-span-2">
            Notes
            <textarea
              rows={2}
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={editNotes}
              onChange={(event) => setEditNotes(event.target.value)}
            />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button size="sm" onClick={() => updateMutation.mutate(selected.id)} loading={updateMutation.isPending}>
              Save Update
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </DataPanel>
  );
}
