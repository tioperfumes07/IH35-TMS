import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { getMaintenanceWorkOrderPdfUrl, getWoCostContext, getWorkOrder } from "../../api/maintenance";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function pickInvoiceTotalCents(wo: Record<string, unknown>): number | null {
  for (const key of ["vendor_invoice_total_cents", "external_vendor_invoice_cents", "invoice_total_cents"]) {
    const v = wo[key];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  }
  const numeric = wo.vendor_invoice_total;
  if (typeof numeric === "number" && Number.isFinite(numeric)) return Math.round(numeric * 100);
  return null;
}

function sumLineItemsCents(lineItems: unknown): number {
  if (!Array.isArray(lineItems)) return 0;
  let sum = 0;
  for (const raw of lineItems) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as Record<string, unknown>;
    if (typeof line.total_cents === "number") {
      sum += line.total_cents;
      continue;
    }
    if (typeof line.line_total_cents === "number") {
      sum += line.line_total_cents;
      continue;
    }
    if (typeof line.total_cost === "number") {
      sum += Math.round(line.total_cost * 100);
    }
  }
  return sum;
}

export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [woQ, costQ] = useQueries({
    queries: [
      {
        queryKey: ["maintenance", "work-order-detail", id, companyId],
        queryFn: () => getWorkOrder(id!, companyId),
        enabled: Boolean(id && companyId),
      },
      {
        queryKey: ["maintenance", "wo-cost-context", companyId],
        queryFn: () => getWoCostContext(companyId),
        enabled: Boolean(companyId),
      },
    ],
  });

  const wo = woQ.data;

  const invoiceCents = useMemo(() => (wo ? pickInvoiceTotalCents(wo) : null), [wo]);
  const linesCents = useMemo(() => (wo ? sumLineItemsCents(wo.line_items) : 0), [wo]);
  const deltaCents = invoiceCents != null ? invoiceCents - linesCents : null;
  const invoiceMismatch = deltaCents != null ? Math.abs(deltaCents) > 1 : false;

  const woNumber = String(wo?.display_id ?? id?.slice(0, 8) ?? "—");

  if (!id) {
    return <div className="p-4 text-sm text-red-600">Missing work order id.</div>;
  }

  if (!companyId) {
    return <div className="p-4 text-sm text-amber-800">Select an operating company.</div>;
  }

  if (woQ.isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading work order…</div>;
  }

  if (woQ.isError || !wo) {
    return <div className="p-4 text-sm text-red-600">Failed to load work order.</div>;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={`Work Order ${woNumber}`}
        backHref="/maintenance"
        breadcrumb={[
          { label: "Maintenance", href: "/maintenance" },
          { label: "Work Orders", href: "/maintenance/work-orders" },
          { label: woNumber },
        ]}
      />

      {invoiceCents != null ? (
        <div
          className={`rounded border px-3 py-2 text-sm ${invoiceMismatch ? "border-red-300 bg-red-50 text-red-900" : "border-gray-200 bg-white text-gray-800"}`}
        >
          Invoice {money.format(invoiceCents / 100)} vs Line items {money.format(linesCents / 100)} · Δ{" "}
          {money.format((deltaCents ?? 0) / 100)}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={invoiceMismatch || !id}>
          Save header
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const url = getMaintenanceWorkOrderPdfUrl(id, companyId);
            window.open(url, "_blank", "noopener,noreferrer");
          }}
        >
          Generate WO PDF
        </Button>
        {invoiceMismatch ? <span className="text-xs text-red-700">Resolve invoice vs line total before saving.</span> : null}
      </div>

      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <p>Status: {String(wo.status ?? "—")}</p>
        <p>Source type: {String(wo.source_type ?? "—")}</p>
        <p>Unit: {String(wo.unit_id ?? "—")}</p>
      </div>

      <details className="rounded border border-gray-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-900">WO cost context (live)</summary>
        <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-700">
          {costQ.isLoading ? <p>Loading…</p> : null}
          {costQ.isError ? <p className="text-red-600">Could not load cost context.</p> : null}
          {costQ.data ? (
            <ul className="list-inside list-disc space-y-1">
              <li>Expense categories (Section A): {costQ.data.expense_categories.length}</li>
              <li>Items (Section B): {costQ.data.items.length}</li>
              <li>Parts: {costQ.data.parts.length}</li>
              <li>Labor rates: {costQ.data.labor_rates.length}</li>
            </ul>
          ) : null}
        </div>
      </details>

      <details className="rounded border border-gray-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-900">Line items (raw)</summary>
        <pre className="max-h-64 overflow-auto border-t border-gray-100 p-2 text-[11px]">
          {JSON.stringify(wo.line_items ?? [], null, 2)}
        </pre>
      </details>
    </div>
  );
}
