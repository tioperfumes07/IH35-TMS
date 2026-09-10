import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { LoadDetailDriverPayTab } from "../../components/dispatch/LoadDetailDriverPayTab";
import { visibleDocumentLabel } from "../../lib/entity-label";
import { formatUsdCents } from "../../lib/money";

/**
 * REG-023(b) (owner 2026-09-10: "the Open Driver Bill button is unwired — no driver_bills/:id route
 * exists"). The kind="driver_bill" EntityLink now routes here. This page resolves a
 * driver_finance.driver_bills id → its load (read-only GET /driver-finance/driver-bills/:id) and then
 * renders the SAME canonical Driver Pay detail the load drawer shows (LoadDetailDriverPayTab, keyed by
 * loadId, LDT-3) — one source of truth, no duplicated money math. driver_finance.driver_bills is a
 * DIFFERENT table from accounting.bills (see the driver-finance-driver-bills-not-accounting-bills
 * landmine): this page never touches /accounting/bills/:id.
 */
type DriverBillRef = {
  id: string;
  bill_number: string;
  status: string;
  gross_amount_cents: number;
  load_id: string;
  load_number: string | null;
  driver_name: string | null;
};

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DriverBillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const enabled = Boolean(id && selectedCompanyId);

  const query = useQuery({
    queryKey: ["driver-finance", "driver-bill", selectedCompanyId, id],
    enabled,
    queryFn: () =>
      apiRequest<DriverBillRef>(
        `/api/v1/driver-finance/driver-bills/${encodeURIComponent(id!)}?operating_company_id=${encodeURIComponent(selectedCompanyId!)}`
      ),
  });

  if (!enabled || query.isLoading) {
    return <div className="p-6 text-xs text-gray-500">Loading driver bill…</div>;
  }
  if (query.error) {
    const err = query.error as { status?: number };
    if (err?.status === 403) {
      return <div className="p-6 text-xs text-red-700">You do not have permission to view this driver bill.</div>;
    }
    if (err?.status === 404) {
      return <div className="p-6 text-xs text-gray-500">Driver bill not found.</div>;
    }
    return (
      <div className="p-6">
        <ListErrorState title="Failed to load driver bill." status={err?.status ?? 0} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const bill = query.data!;
  const label = visibleDocumentLabel(bill.bill_number, bill.id, "Driver bill");
  const subtitle = [statusLabel(bill.status), bill.driver_name ?? undefined, formatUsdCents(bill.gross_amount_cents)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-5xl p-4">
      <PageHeader
        title={`Driver bill ${label}`}
        subtitle={subtitle}
        breadcrumb={[
          { label: "Dispatch", href: "/dispatch?subtab=load_board&view=list" },
          bill.load_id
            ? { label: `Load ${bill.load_number ?? bill.load_id}`, href: `/dispatch/loads/${bill.load_id}` }
            : { label: "Load" },
          { label: `Driver bill ${label}` },
        ]}
      />

      {bill.load_id ? (
        <div className="mt-3 rounded-sm border border-gray-200 bg-white p-3" data-testid="driver-bill-detail-body">
          {/* Reuse the canonical Driver Pay detail (LDT-3) — USMCA books in USD. */}
          <LoadDetailDriverPayTab loadId={bill.load_id} operatingCompanyId={selectedCompanyId!} currencyCode="USD" />
        </div>
      ) : (
        <div className="mt-3 rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-500">
          This driver bill is not linked to a load.
        </div>
      )}
    </div>
  );
}
