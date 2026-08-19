import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { Link, useParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMaintenanceVendorDetail } from "../../api/maintenance";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

type VendorHistoryRow = Record<string, unknown>;

export function VendorDetailPage() {
  const { vendorId = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const detailQ = useQuery({
    queryKey: ["maintenance", "vendor-detail", companyId, vendorId],
    queryFn: () => getMaintenanceVendorDetail(vendorId, companyId),
    enabled: Boolean(companyId && vendorId),
  });

  const vendor = detailQ.data?.vendor;
  const woHistory = detailQ.data?.wo_history ?? [];
  const invoiceHistory = detailQ.data?.invoice_history ?? [];

  const woColumns = useMemo<ParityColumn<VendorHistoryRow>[]>(
    () => [
      { key: "display_id", label: "WO", sortable: true, render: (row) => <EntityLinkOrTombstone kind="work_order" id={row.id == null ? null : String(row.id)} name={row.display_id} noun="Work order" /> },
      { key: "wo_type", label: "Type", sortable: true, render: (row) => String(row.wo_type ?? "—") },
      { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "—") },
      { key: "repair_location", label: "Location", render: (row) => String(row.repair_location ?? "—") },
      { key: "opened_at", label: "Opened", sortable: true, render: (row) => String(row.opened_at ?? "—") },
    ],
    [],
  );

  const invoiceColumns = useMemo<ParityColumn<VendorHistoryRow>[]>(
    () => [
      { key: "invoice_number", label: "Invoice #", sortable: true, render: (row) => String(row.invoice_number ?? "—") },
      { key: "display_id", label: "WO", render: (row) => <EntityLinkOrTombstone kind="work_order" id={row.work_order_id == null ? null : String(row.work_order_id)} name={row.display_id} noun="Work order" /> },
      {
        key: "invoice_amount",
        label: "Amount",
        render: (row) => (row.invoice_amount != null ? `$${Number(row.invoice_amount).toFixed(2)}` : "—"),
      },
      { key: "invoice_date", label: "Date", sortable: true, render: (row) => String(row.invoice_date ?? "—") },
      { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "—") },
    ],
    [],
  );

  return (
    <div className="space-y-3" data-testid="maint-vendor-detail-page">
      <BackArrowHeader
        backTo="/maintenance/vendors"
        breadcrumb={["Maintenance", "Vendors", vendor?.display_name ?? "Detail"]}
        title={vendor?.display_name ?? "Vendor Detail"}
      />
      {detailQ.isError ? <ListErrorBanner onRetry={() => void detailQ.refetch()} /> : null}

      {vendor ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Profile</h3>
            <dl className="space-y-1">
              <div><dt className="inline font-medium">Code:</dt> <dd className="inline">{vendor.code}</dd></div>
              <div><dt className="inline font-medium">Type:</dt> <dd className="inline">{vendor.type ?? "—"}</dd></div>
              <div><dt className="inline font-medium">Email:</dt> <dd className="inline">{vendor.contact_email ?? "—"}</dd></div>
              <div><dt className="inline font-medium">Phone:</dt> <dd className="inline">{vendor.contact_phone ?? "—"}</dd></div>
              <div><dt className="inline font-medium">Address:</dt> <dd className="inline">{vendor.address ?? "—"}</dd></div>
              <div><dt className="inline font-medium">Payment terms:</dt> <dd className="inline">{vendor.payment_terms ?? "—"}</dd></div>
              <div>
                <dt className="inline font-medium">AP Vendor:</dt>{" "}
                <dd className="inline">
                  {vendor.mdata_vendor_id ? (
                    <EntityLink
                      kind="vendor"
                      id={vendor.mdata_vendor_id}
                      label={entityLabel(vendor.mdata_vendor_name, vendor.mdata_vendor_id, "Vendor")}
                      className="text-slate-600 underline"
                      data-testid="maintenance-vendor-detail-ap-vendor-link"
                    />
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div><dt className="inline font-medium">Status:</dt> <dd className="inline">{vendor.is_active ? "Active" : "Archived"}</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-gray-500">
              Catalog record in{" "}
              <Link className="text-slate-600 underline" to="/lists/maintenance/vendors">
                Lists & Catalogs / Maintenance Vendors
              </Link>
              .
            </p>
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Notes</h3>
            <p className="whitespace-pre-wrap text-gray-700">{vendor.notes ?? vendor.description ?? "No notes recorded."}</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Work Order History</h3>
        <ParityTable
          rows={woHistory}
          columns={woColumns}
          rowKey={(row) => String(row.id)}
          loading={detailQ.isLoading}
          storageKey="maintenance-vendor-wo-history"
          emptyText="No linked work orders yet."
        />
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Invoice History</h3>
        <ParityTable
          rows={invoiceHistory}
          columns={invoiceColumns}
          rowKey={(row) => `${String(row.work_order_id)}-${String(row.invoice_number)}`}
          loading={detailQ.isLoading}
          storageKey="maintenance-vendor-invoice-history"
          emptyText="No vendor invoices recorded."
        />
      </div>
    </div>
  );
}
