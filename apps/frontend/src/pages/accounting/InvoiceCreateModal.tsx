import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { ParityTable } from "../../components/parity/ParityTable";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useInvoiceCreateFromLoad, type LoadStatusFilter } from "../../hooks/useInvoiceCreateFromLoad";
import { InvoiceCreateBlankPage } from "./InvoiceCreateBlankPage";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { EntityLink } from "../../components/shared/EntityLink";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel } from "../../lib/entity-label";

type Step = "choose" | "from_load" | "blank";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
};

export function InvoiceCreateModal({ open, operatingCompanyId, onClose }: Props) {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [step, setStep] = useState<Step>("choose");
  const [loadSearch, setLoadSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LoadStatusFilter>("all");
  const [loadPage, setLoadPage] = useState(1);
  const pageSize = 25;
  // LINK-F5191: hold the just-created invoice instead of firing handleCreated() (which
  // navigates away) in the same tick -- same "hold state -> confirm -> close" pattern already
  // applied to InvoiceTypeModalBase.tsx (the "blank" step below inherits its own confirmation
  // from that fix; this state covers the "from an existing load" step's own direct create call).
  const [createdFromLoad, setCreatedFromLoad] = useState<{ id: string; display_id: string | null } | null>(null);

  const { loads, totalCount, isLoading, isError, error, refetchLoads, createFromLoad, isCreating } = useInvoiceCreateFromLoad(operatingCompanyId, {
    search: loadSearch,
    statusFilter,
    page: loadPage,
    pageSize,
  });

  const resetAndClose = () => {
    setStep("choose");
    setLoadSearch("");
    setStatusFilter("all");
    setLoadPage(1);
    setCreatedFromLoad(null);
    onClose();
  };

  const handleCreated = (invoiceId: string) => {
    resetAndClose();
    navigate(`/accounting/invoices/${invoiceId}`);
  };

  const title =
    step === "choose"
      ? "How do you want to create this invoice?"
      : step === "from_load"
        ? "Select a load to invoice"
        : "Blank invoice";

  return (
    <ParityDrawer open={open} onClose={resetAndClose} title={title} size="wide">
      <div className="space-y-4" data-invoice-create-modal="true" data-testid="invoice-create-drawer">
        {step === "choose" ? (
          <div className="grid gap-2">
            <button
              type="button"
              className="rounded-sm border border-gray-200 px-3 py-3 text-left hover:border-slate-300 hover:bg-slate-100"
              onClick={() => setStep("from_load")}
            >
              <div className="text-sm font-semibold text-gray-900">From an existing load</div>
              <div className="text-xs text-gray-600">Pick a delivered or in-transit load; invoice fields pre-fill from load data.</div>
            </button>
            <button
              type="button"
              className="rounded-sm border border-gray-200 px-3 py-3 text-left hover:border-slate-300 hover:bg-slate-100"
              onClick={() => setStep("blank")}
            >
              <div className="text-sm font-semibold text-gray-900">Blank invoice (no load)</div>
              <div className="text-xs text-gray-600">Start with an empty invoice form inside Accounting.</div>
            </button>
            <p className="text-xs text-gray-500">Recurring templates are not available yet — use Manual invoice types from the list header dropdown if needed.</p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={resetAndClose}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {step === "from_load" && createdFromLoad ? (
          <div
            className="flex flex-col items-start gap-3 rounded-sm border border-slate-200 bg-slate-50 p-3 text-sm"
            data-testid="invoice-create-from-load-confirmation"
          >
            <p className="text-gray-700">
              Invoice created:{" "}
              <EntityLink
                kind="invoice"
                id={createdFromLoad.id}
                label={entityLabel(createdFromLoad.display_id, createdFromLoad.id, "Invoice")}
                data-testid="invoice-create-from-load-view-invoice"
              />
            </p>
            <Button
              size="sm"
              onClick={() => {
                const id = createdFromLoad.id;
                setCreatedFromLoad(null);
                handleCreated(id);
              }}
            >
              Done
            </Button>
          </div>
        ) : null}

        {step === "from_load" && !createdFromLoad ? (
          <div className="space-y-3">
            {isError ? (
              <ListErrorBanner
                message={`Failed to load invoiceable loads: ${userFacingApiError(error, "Request failed")}`}
                onRetry={() => void refetchLoads()}
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <input
                value={loadSearch}
                onChange={(event) => {
                  setLoadSearch(event.target.value);
                  setLoadPage(1);
                }}
                placeholder="Search load # or customer"
                className="h-9 min-w-[200px] flex-1 rounded-sm border border-gray-300 px-2 text-sm"
              />
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as LoadStatusFilter);
                  setLoadPage(1);
                }}
                className="h-9 rounded-sm border border-gray-300 px-2 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="delivered">Delivered</option>
                <option value="in_transit">In transit</option>
              </select>
            </div>
            {/* ACCT-F3594: embedded ParityTable owns Search+Range+gear on from-load pick list.
                PARITYTABLE-MISSING-HIDEPAGER-CLASS: this list is already server-paginated
                (loadPage/pageSize above, own Previous/Next below) -- hidePager stops ParityTable's
                own internal pager from computing a contradicting total off just this page's
                rows.length once loads exceed one server page. */}
            <ParityTable
              embedded
              rows={loads}
              rowKey={(load) => load.id}
              storageKey="invoice-create-modal-from-load"
              exportFilename="invoice-create-from-load"
              tableTestId="invoice-create-from-load-table"
              pageSize={pageSize}
              pageSizeOptions={[pageSize]}
              hidePager
              emptyText={
                isLoading
                  ? "Loading loads…"
                  : isError
                    ? "Could not load loads."
                    : "No loads match the current filters."
              }
              columns={[
                {
                  key: "load",
                  label: "Load #",
                  cellClass: "font-medium",
                  // C5 — a "Load #" column header promises a load reference; render it through the
                  // canonical EntityLink drill instead of a plain (unclickable) label. The row's
                  // "Select" action stays the primary picker control in its own column.
                  render: (load) => (
                    <EntityLink kind="load" id={load.id} label={entityLabel(load.load_number, load.id, "Load")} />
                  ),
                },
                {
                  key: "customer",
                  label: "Customer",
                  // C5 (same principle as the Load # column above): a "Customer" column with a real
                  // customer_id promises a drill-through, not a plain unclickable label.
                  render: (load) =>
                    load.customer_id ? (
                      <EntityLink kind="customer" id={load.customer_id} label={entityLabel(load.customer_name, load.customer_id, "Customer")} />
                    ) : (
                      entityLabel(load.customer_name, load.customer_id, "Customer")
                    ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (load) => load.status,
                },
                {
                  key: "route",
                  label: "Route",
                  cellClass: "text-xs text-gray-600",
                  render: (load) => `${load.first_pickup_city ?? "—"} → ${load.first_delivery_city ?? "—"}`,
                },
                {
                  key: "select",
                  label: "Select",
                  className: "text-right",
                  cellClass: "text-right",
                  alwaysVisible: true,
                  render: (load) => (
                    <Button
                      size="sm"
                      disabled={isCreating}
                      onClick={async () => {
                        try {
                          const result = await createFromLoad(load.id);
                          pushToast("Invoice created from load.", "success");
                          setCreatedFromLoad({ id: result.invoice.id, display_id: result.invoice.display_id ?? null });
                        } catch (error) {
                          pushToast(userFacingApiError(error, "Could not create invoice from load."), "error");
                        }
                      }}
                    >
                      Select
                    </Button>
                  ),
                },
              ]}
            />
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>
                Showing {loads.length} of {totalCount} loads
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={loadPage <= 1} onClick={() => setLoadPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button size="sm" variant="secondary" disabled={loadPage * pageSize >= totalCount} onClick={() => setLoadPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep("choose")}>
                Back
              </Button>
              <Button variant="secondary" onClick={resetAndClose}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {step === "blank" ? (
          <div className="space-y-3">
            <InvoiceCreateBlankPage
              operatingCompanyId={operatingCompanyId}
              onClose={() => setStep("choose")}
              onCreated={handleCreated}
            />
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep("choose")}>
                Back
              </Button>
              <Button variant="secondary" onClick={resetAndClose}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </ParityDrawer>
  );
}
