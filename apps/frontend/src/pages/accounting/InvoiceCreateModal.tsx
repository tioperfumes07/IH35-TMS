import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useInvoiceCreateFromLoad, type LoadStatusFilter } from "../../hooks/useInvoiceCreateFromLoad";
import { InvoiceCreateBlankPage } from "./InvoiceCreateBlankPage";

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

  const { loads, totalCount, isLoading, createFromLoad, isCreating } = useInvoiceCreateFromLoad(operatingCompanyId, {
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
    <Modal open={open} onClose={resetAndClose} title={title}>
      <div className="space-y-4" data-invoice-create-modal="true">
        {step === "choose" ? (
          <div className="grid gap-2">
            <button
              type="button"
              className="rounded border border-gray-200 px-3 py-3 text-left hover:border-slate-300 hover:bg-slate-100"
              onClick={() => setStep("from_load")}
            >
              <div className="text-sm font-semibold text-gray-900">From an existing load</div>
              <div className="text-xs text-gray-600">Pick a delivered or in-transit load; invoice fields pre-fill from load data.</div>
            </button>
            <button
              type="button"
              className="rounded border border-gray-200 px-3 py-3 text-left hover:border-slate-300 hover:bg-slate-100"
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

        {step === "from_load" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <input
                value={loadSearch}
                onChange={(event) => {
                  setLoadSearch(event.target.value);
                  setLoadPage(1);
                }}
                placeholder="Search load # or customer"
                className="h-9 min-w-[200px] flex-1 rounded border border-gray-300 px-2 text-sm"
              />
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as LoadStatusFilter);
                  setLoadPage(1);
                }}
                className="h-9 rounded border border-gray-300 px-2 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="delivered">Delivered</option>
                <option value="in_transit">In transit</option>
              </select>
            </div>
            <div className="max-h-[360px] overflow-y-auto rounded border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-2 py-1">Load #</th>
                    <th className="px-2 py-1">Customer</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Route</th>
                  </tr>
                </thead>
                <tbody>
                  {loads.map((load) => (
                    <tr key={load.id} className="border-t border-gray-100">
                      <td className="px-2 py-2 font-medium">{load.load_number}</td>
                      <td className="px-2 py-2">{load.customer_name ?? "—"}</td>
                      <td className="px-2 py-2">{load.status}</td>
                      <td className="px-2 py-2 text-xs text-gray-600">
                        {load.first_pickup_city ?? "—"} → {load.first_delivery_city ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          size="sm"
                          disabled={isCreating}
                          onClick={async () => {
                            try {
                              const result = await createFromLoad(load.id);
                              handleCreated(result.invoice.id);
                              pushToast("Invoice created from load.", "success");
                            } catch (error) {
                              pushToast(String((error as Error).message || "Could not create invoice from load."), "error");
                            }
                          }}
                        >
                          Select
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && loads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-center text-sm text-gray-500">
                        No loads match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
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
    </Modal>
  );
}
