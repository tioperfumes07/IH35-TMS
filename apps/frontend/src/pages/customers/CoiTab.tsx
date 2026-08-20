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
import { DatePicker } from "../../components/forms/DatePicker";
import { DataPanel } from "../../components/layout/DataPanel";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { ListErrorState } from "../../components/ListErrorState";
import { Modal } from "../../components/Modal";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { entityLabel } from "../../lib/entity-label";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";

export type CoiTabVariant = "list-preview" | "full-page";

type Props = {
  customerId: string;
  customerName: string;
  operatingCompanyId?: string;
  /** list-preview = Customers list COI tab; full-page = CustomerDetail COI tab */
  variant: CoiTabVariant;
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

function extractInsurerEmail(notes: string | null | undefined): string {
  const line = (notes ?? "").split("\n").find((row) => row.toLowerCase().startsWith("insurer email:"));
  return line ? line.split(":").slice(1).join(":").trim() : "";
}

export function CoiTab({ customerId, customerName, operatingCompanyId, variant }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isFullPage = variant === "full-page";

  const [statusFilter, setStatusFilter] = useState<"" | CoiRequestStatus>("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNotes, setRequestNotes] = useState("");
  const [requestExpiresAt, setRequestExpiresAt] = useState("");
  const [requestPolicyId, setRequestPolicyId] = useState("");
  const [insurerEmail, setInsurerEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<CoiRequestStatus>("pending");
  const [editNotes, setEditNotes] = useState("");
  const [editDocumentUrl, setEditDocumentUrl] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");

  const query = useQuery({
    queryKey: ["insurance-coi-requests", operatingCompanyId ?? "none", customerId, statusFilter || "all", variant],
    queryFn: () =>
      listInsuranceCoiRequests({
        operating_company_id: operatingCompanyId!,
        customer_id: customerId,
        status: !isFullPage && statusFilter ? statusFilter : undefined,
      }).then((result) => result.requests),
    enabled: Boolean(operatingCompanyId),
  });

  // Policies load via EntityPicker kind=insurance_policy (no local listInsurancePolicies query).


  function resetCreateForm() {
    setRequestNotes("");
    setRequestExpiresAt("");
    setRequestPolicyId("");
    setInsurerEmail("");
    setRequestOpen(false);
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const noteParts = [
        requestNotes.trim(),
        isFullPage && insurerEmail.trim() ? `Insurer email: ${insurerEmail.trim()}` : "",
      ].filter(Boolean);
      return createInsuranceCoiRequest({
        operating_company_id: operatingCompanyId!,
        customer_id: customerId,
        policy_id: requestPolicyId.trim() ? requestPolicyId.trim() : null,
        notes: noteParts.length ? noteParts.join("\n") : null,
        expires_at: !isFullPage && requestExpiresAt ? requestExpiresAt : null,
      });
    },
    onSuccess: () => {
      pushToast("COI request created", "success");
      resetCreateForm();
      void queryClient.invalidateQueries({
        queryKey: ["insurance-coi-requests", operatingCompanyId ?? "none", customerId],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["insurance-coi-requests", operatingCompanyId ?? "none", customerId],
      });
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
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Select an operating company to manage COI requests.
      </div>
    );
  }

  const createFormFields = (
    <div className={isFullPage ? "grid gap-2" : "mb-3 grid gap-2 rounded-sm border border-gray-200 bg-gray-50 p-3 md:grid-cols-2"}>
      {isFullPage ? (
        <label className="block text-xs">
          Policy
          {/* CLS-EP-INS-POLICY: full-page branch → EntityPicker kind=insurance_policy (same as compact). */}
          <EntityPicker
            kind="insurance_policy"
            operatingCompanyId={operatingCompanyId ?? ""}
            value={requestPolicyId || null}
            onChange={(next) => setRequestPolicyId(next ?? "")}
            enabled={requestOpen}
            placeholder="No policy selected"
            className="mt-0.5"
          />
        </label>
      ) : (
        <label className="block text-xs">
          Policy (optional)
          {/* C1 PICKER LAW: was a raw-UUID box. The compact (non-full-page) branch now offers the
              SAME canonical insurance.policy roster the full-page branch lists, so a COI request
              cannot cite a policy id the operator guessed. */}
          <EntityPicker
            kind="insurance_policy"
            operatingCompanyId={operatingCompanyId ?? ""}
            value={requestPolicyId || null}
            onChange={(next) => setRequestPolicyId(next ?? "")}
            enabled={requestOpen}
            placeholder="No policy selected"
            className="mt-0.5"
          />
        </label>
      )}
      {isFullPage ? (
        <label className="text-xs font-semibold text-gray-600">
          Insurer Email
          <input
            type="email"
            className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
            value={insurerEmail}
            onChange={(event) => setInsurerEmail(event.target.value)}
            placeholder="insurer@example.com"
          />
        </label>
      ) : (
        <label className="block text-xs">
          Expires At (optional)
          <DatePicker
            className="mt-0.5 w-full"
            value={requestExpiresAt}
            onChange={(next) => setRequestExpiresAt(next)}
          />
        </label>
      )}
      <label className={isFullPage ? "text-xs font-semibold text-gray-600" : "block text-xs md:col-span-2"}>
        {isFullPage ? "Additional Notes" : "Notes"}
        <textarea
          rows={isFullPage ? 3 : 2}
          className={
            isFullPage
              ? "mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
              : "mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
          }
          value={requestNotes}
          onChange={(event) => setRequestNotes(event.target.value)}
          placeholder={isFullPage ? "Optional details for the request" : "Requested coverage details"}
        />
      </label>
      {!isFullPage ? (
        <div className="md:col-span-2">
          <Button size="sm" onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
            + Create
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <DataPanel title={`COI Requests · ${customerName}`}>
      {isFullPage ? (
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs text-gray-600">Track COI requests and responses per customer.</div>
          <Button size="sm" onClick={() => setRequestOpen(true)}>
            + Create COI
          </Button>
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setRequestOpen((open) => !open)}>
            {requestOpen ? "Cancel" : "+ Create COI"}
          </Button>
        </div>
      )}

      {!isFullPage && requestOpen ? createFormFields : null}

      {query.isError ? (
        <ListErrorState
          title="Couldn't load COI requests"
          status={query.error instanceof ApiError ? query.error.status : 0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {!query.isError ? (
      <ParityTable<InsuranceCoiRequest>
        rows={requests}
        rowKey={(request) => request.id}
        loading={query.isLoading}
        storageKey={isFullPage ? "customer-coi-requests-tab" : "customer-coi-requests"}
        emptyText={isFullPage ? "No COI requests yet." : "No COI requests yet for this customer."}
        exportFilename="customer-coi-requests"
        filterBar={
          !isFullPage ? (
            <label className="text-xs font-semibold text-gray-600">
              Status filter
              <select
                className="ml-2 rounded-sm border border-gray-300 px-2 py-1 text-xs"
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
          ) : undefined
        }
        rowActions={(request) => (
          <Button size="sm" variant="secondary" onClick={() => beginEdit(request)}>
            Update
          </Button>
        )}
        columns={
          isFullPage
            ? [
                {
                  key: "requested_at",
                  label: "Date",
                  sortable: true,
                  render: (request) => new Date(request.requested_at).toLocaleString(),
                },
                {
                  key: "requested_by",
                  label: "Requester User",
                  render: (request) =>
                    request.requested_by ? (
                      <EntityLinkOrTombstone
                        kind="user"
                        id={request.requested_by}
                        name={request.requested_by_name}
                        noun="User"
                      />
                    ) : (
                      entityLabel(null, request.requested_by, "User")
                    ),
                },
                {
                  key: "policy_id",
                  label: "Policy Reference",
                  render: (request) => (
                    <EntityLinkOrTombstone
                      kind="insurance_policy"
                      id={request.policy_id}
                      name={request.policy_number}
                      noun="Policy"
                    />
                  ),
                },
                {
                  key: "insurer_email",
                  label: "Insurer Email",
                  render: (request) => extractInsurerEmail(request.notes) || "-",
                },
                {
                  key: "status",
                  label: "Status",
                  sortable: true,
                  render: (request) => (
                    <StatusBadge variant={statusVariant(request.status)}>{statusLabel(request.status)}</StatusBadge>
                  ),
                },
                {
                  key: "document_url",
                  label: "Action",
                  render: (request) =>
                    request.document_url ? (
                      <a href={request.document_url} className="text-slate-700 underline" target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      "-"
                    ),
                },
              ]
            : [
                {
                  key: "requested_at",
                  label: "Requested",
                  sortable: true,
                  render: (request) => new Date(request.requested_at).toLocaleString(),
                },
                {
                  key: "status",
                  label: "Status",
                  sortable: true,
                  render: (request) => (
                    <StatusBadge variant={statusVariant(request.status)}>{statusLabel(request.status)}</StatusBadge>
                  ),
                },
                {
                  key: "expires_at",
                  label: "Expires",
                  sortable: true,
                  render: (request) => formatDateTimeUS(request.expires_at) || "-",
                },
                {
                  key: "document_url",
                  label: "Document",
                  render: (request) =>
                    request.document_url ? (
                      <a className="text-slate-700 underline" href={request.document_url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      "-"
                    ),
                },
                {
                  key: "notes",
                  label: "Notes",
                  cellClass: "max-w-[24rem]",
                  render: (request) => request.notes || "-",
                },
              ]
        }
      />
      ) : null}

      {selected ? (
        <div className="mt-3 grid gap-2 rounded-sm border border-gray-200 bg-gray-50 p-3 md:grid-cols-2">
          <label className="block text-xs">
            Status
            <select
              className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
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
            <DatePicker
              className="mt-0.5 w-full"
              value={editExpiresAt}
              onChange={(next) => setEditExpiresAt(next)}
            />
          </label>
          <label className="block text-xs md:col-span-2">
            Document URL
            <input
              className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
              value={editDocumentUrl}
              onChange={(event) => setEditDocumentUrl(event.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="block text-xs md:col-span-2">
            Notes
            <textarea
              rows={2}
              className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
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

      {isFullPage ? (
        <Modal variant="drawer" title="Create COI Request" open={requestOpen} onClose={() => setRequestOpen(false)}>
          {createFormFields}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
              + Create
            </Button>
          </div>
        </Modal>
      ) : null}
    </DataPanel>
  );
}
