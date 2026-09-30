import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createManualDeliveryAuthorization,
  listNeedsDeliveryAuthorization,
  type NeedsDeliveryAuthorizationRow,
} from "../../api/dispatch";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { DispatchSubnav } from "../../components/dispatch/DispatchSubnav";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { userFacingApiError } from "../../lib/api-error-message";

/**
 * ROUND 292 — FACTOR-BUT-NOT-DELIVERED named queue.
 * Issued invoices on loads still dispatched/in transit with no
 * dispatch.manual_delivery_authorizations row. Owner authorizes here (reason ≥ 20 chars,
 * customer + factoring both true). Seat never POSTs fixtures.
 */
export function NeedsDeliveryAuthorizationPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [active, setActive] = useState<NeedsDeliveryAuthorizationRow | null>(null);
  const [reason, setReason] = useState("");
  const [customerOk, setCustomerOk] = useState(false);
  const [factorOk, setFactorOk] = useState(false);

  const queueQ = useQuery({
    queryKey: ["dispatch", "needs-delivery-authorization", companyId],
    queryFn: () => listNeedsDeliveryAuthorization(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  const rows = queueQ.data?.rows ?? [];

  const authorizeM = useMutation({
    mutationFn: async () => {
      if (!active || !companyId) throw new Error("no_load");
      if (!customerOk || !factorOk) throw new Error("both_authorizations_required");
      if (reason.trim().length < 20) throw new Error("reason_too_short");
      return createManualDeliveryAuthorization(active.load_id, {
        operating_company_id: companyId,
        reason: reason.trim(),
        customer_authorized: true,
        factoring_authorized: true,
      });
    },
    onSuccess: (res) => {
      pushToast(`Authorized ${active?.load_number ?? ""} · ${res.authorization_id.slice(0, 8)}…`, "success");
      setActive(null);
      setReason("");
      setCustomerOk(false);
      setFactorOk(false);
      void qc.invalidateQueries({ queryKey: ["dispatch", "needs-delivery-authorization"] });
      void qc.invalidateQueries({ queryKey: ["dispatch-subnav"] });
    },
    onError: (e) => pushToast(userFacingApiError(e, "Could not record delivery authorization."), "error"),
  });

  const columns = useMemo<ParityColumn<NeedsDeliveryAuthorizationRow>[]>(
    () => [
      {
        key: "load_number",
        label: "Load #",
        sortable: true,
        className: "font-medium",
        render: (row) => (
          <EntityLinkOrTombstone kind="load" id={row.load_id} name={row.load_number} noun="Load" />
        ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => <StatusBadge status={row.status.replace(/_/g, " ")} />,
      },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        render: (row) => row.customer_name ?? "—",
      },
      {
        key: "invoice_display_id",
        label: "Invoice",
        sortable: true,
        render: (row) => row.invoice_display_id ?? "—",
      },
      {
        key: "invoice_status",
        label: "Inv status",
        sortable: true,
        render: (row) => row.invoice_status.replace(/_/g, " "),
      },
      {
        key: "factoring_status",
        label: "Factoring",
        sortable: true,
        render: (row) => (row.factoring_status ? row.factoring_status.replace(/_/g, " ") : "—"),
      },
      {
        key: "actions",
        label: "Action",
        sortable: false,
        render: (row) => (
          <button
            type="button"
            className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#0F1219]"
            data-testid={`authorize-delivery-${row.load_number}`}
            onClick={() => {
              setActive(row);
              setReason("");
              setCustomerOk(false);
              setFactorOk(false);
            }}
          >
            Authorize
          </button>
        ),
      },
    ],
    [],
  );

  if (!companyId) {
    return (
      <div className="rounded-sm border bg-white p-4 text-xs text-slate-600">
        Select an operating company.
      </div>
    );
  }

  return (
    <div data-testid="needs-delivery-authorization-page" className="mx-auto max-w-5xl space-y-4 p-4">
      <DispatchSubnav operatingCompanyId={companyId} />
      <PageHeader
        title="Needs delivery authorization"
        subtitle="Issued invoices on loads still rolling (dispatched / in transit). Record customer + factoring approval before delivery — same engine as FACTOR-BUT-NOT-DELIVERED."
        actions={
          <Link to="/dispatch/awaiting-bol-invoice" className="rounded-sm border px-3 py-1.5 text-xs">
            Awaiting BOL
          </Link>
        }
      />

      {queueQ.isError ? (
        <ListErrorState
          title="Couldn't load the delivery-authorization queue"
          status={0}
          message={(queueQ.error as Error)?.message}
          onRetry={() => void queueQ.refetch()}
        />
      ) : (
        <ParityTable<NeedsDeliveryAuthorizationRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.load_id}
          loading={queueQ.isLoading}
          emptyText="No rolling loads with an unauthorized issued invoice."
          storageKey="dispatch-needs-delivery-authorization"
          exportFilename="needs-delivery-authorization"
          tableTestId="needs-delivery-authorization-table"
        />
      )}
      <p className="text-section-header text-gray-500" data-testid="needs-delivery-authorization-count">
        {rows.length} load{rows.length === 1 ? "" : "s"} need delivery authorization.
      </p>

      {active ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          data-testid="authorize-delivery-dialog"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-sm border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <h2 className="text-section-header font-bold uppercase text-[#4B5563]">
              Authorize load {active.load_number}
            </h2>
            <p className="mt-1 text-xs text-[#6B7280]">
              Invoice {active.invoice_display_id ?? "—"} · status {active.status.replace(/_/g, " ")}. Does not change
              load status — records customer + factoring approval only.
            </p>
            <label className="mt-3 block text-xs text-[#0F1219]">
              Reason (min 20 characters)
              <textarea
                className="mt-1 h-20 w-full rounded-sm border border-[#E5E7EB] px-2 py-1 text-xs"
                data-testid="authorize-delivery-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-[#0F1219]">
              <input
                type="checkbox"
                data-testid="authorize-delivery-customer"
                checked={customerOk}
                onChange={(e) => setCustomerOk(e.target.checked)}
              />
              Customer authorized
            </label>
            <label className="mt-1 flex items-center gap-2 text-xs text-[#0F1219]">
              <input
                type="checkbox"
                data-testid="authorize-delivery-factoring"
                checked={factorOk}
                onChange={(e) => setFactorOk(e.target.checked)}
              />
              Factoring authorized
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="h-7 rounded-sm border border-[#E5E7EB] px-2 text-xs"
                onClick={() => setActive(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-7 rounded-sm bg-[#14314F] px-2 text-xs text-white disabled:opacity-50"
                data-testid="authorize-delivery-submit"
                disabled={authorizeM.isPending || !customerOk || !factorOk || reason.trim().length < 20}
                onClick={() => authorizeM.mutate()}
              >
                {authorizeM.isPending ? "Saving…" : "Record authorization"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
