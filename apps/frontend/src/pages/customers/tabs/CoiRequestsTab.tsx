import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listInsurancePolicies } from "../../../api/insurance";
import { createCoiRequest, listCoiRequests } from "../../../api/customers";
import { Button } from "../../../components/Button";
import { DataPanel } from "../../../components/layout/DataPanel";
import { StatusBadge } from "../../../components/layout/StatusBadge";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";

type Props = {
  customerId: string;
  customerName: string;
  operatingCompanyId?: string;
};

type CoiStatus = "pending" | "sent" | "responded";

function statusLabel(status: string): CoiStatus {
  if (status === "received") return "responded";
  if (status === "sent") return "sent";
  return "pending";
}

function statusVariant(status: CoiStatus): "neutral" | "warn" | "positive" {
  if (status === "responded") return "positive";
  if (status === "sent") return "warn";
  return "neutral";
}

export function CoiRequestsTab({ customerId, customerName, operatingCompanyId }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [policyId, setPolicyId] = useState("");
  const [insurerEmail, setInsurerEmail] = useState("");
  const [notes, setNotes] = useState("");

  const requestsQuery = useQuery({
    queryKey: ["customer-coi-requests", operatingCompanyId ?? "none", customerId],
    queryFn: () => listCoiRequests(customerId, { operating_company_id: operatingCompanyId! }).then((result) => result.requests),
    enabled: Boolean(operatingCompanyId),
  });

  const policiesQuery = useQuery({
    queryKey: ["insurance-policies", operatingCompanyId ?? "none"],
    queryFn: () => listInsurancePolicies({ operating_company_id: operatingCompanyId! }).then((result) => result.policies),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCoiRequest(customerId, {
        operating_company_id: operatingCompanyId!,
        policy_id: policyId || null,
        notes: [notes.trim(), insurerEmail.trim() ? `Insurer email: ${insurerEmail.trim()}` : ""].filter(Boolean).join("\n") || null,
      }),
    onSuccess: () => {
      pushToast("COI request created", "success");
      setModalOpen(false);
      setPolicyId("");
      setInsurerEmail("");
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["customer-coi-requests", operatingCompanyId ?? "none", customerId] });
    },
    onError: () => pushToast("Failed to create COI request", "error"),
  });

  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);

  if (!operatingCompanyId) {
    return <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to manage COI requests.</div>;
  }

  return (
    <DataPanel title={`COI Requests · ${customerName}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-gray-600">Track COI requests and responses per customer.</div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          Request New COI
        </Button>
      </div>

      {requestsQuery.isLoading ? <div className="text-sm text-gray-500">Loading COI requests...</div> : null}
      {requestsQuery.isError ? <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">Failed to load COI requests.</div> : null}

      {!requestsQuery.isLoading && requests.length === 0 ? <div className="text-sm text-gray-600">No COI requests yet.</div> : null}

      {requests.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-2 py-1.5 font-semibold">Date</th>
                <th className="px-2 py-1.5 font-semibold">Requester User</th>
                <th className="px-2 py-1.5 font-semibold">Policy Reference</th>
                <th className="px-2 py-1.5 font-semibold">Insurer Email</th>
                <th className="px-2 py-1.5 font-semibold">Status</th>
                <th className="px-2 py-1.5 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const status = statusLabel(request.status);
                const insurerEmailLine = (request.notes ?? "").split("\n").find((line) => line.toLowerCase().startsWith("insurer email:"));
                const insurerEmailValue = insurerEmailLine ? insurerEmailLine.split(":").slice(1).join(":").trim() : "-";
                return (
                  <tr key={request.id} className="border-b border-gray-100 align-top">
                    <td className="px-2 py-1.5 text-gray-800">{new Date(request.requested_at).toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-gray-700">{request.requested_by || "-"}</td>
                    <td className="px-2 py-1.5 text-gray-700">{request.policy_id || "-"}</td>
                    <td className="px-2 py-1.5 text-gray-700">{insurerEmailValue}</td>
                    <td className="px-2 py-1.5">
                      <StatusBadge variant={statusVariant(status)}>{status}</StatusBadge>
                    </td>
                    <td className="px-2 py-1.5 text-gray-700">{request.document_url ? <a href={request.document_url} className="text-slate-700 underline" target="_blank" rel="noreferrer">Open</a> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        title="Request New COI"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <div className="grid gap-2">
          <label className="text-xs font-semibold text-gray-600">
            Policy
            <select className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" value={policyId} onChange={(event) => setPolicyId(event.target.value)}>
              <option value="">No policy selected</option>
              {(policiesQuery.data ?? []).map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.policy_number} · {policy.insurer_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Insurer Email
            <input
              type="email"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={insurerEmail}
              onChange={(event) => setInsurerEmail(event.target.value)}
              placeholder="insurer@example.com"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Additional Notes
            <textarea
              rows={3}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional details for the request"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
            Submit Request
          </Button>
        </div>
      </Modal>
    </DataPanel>
  );
}
