import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMaintenanceVendorDetail } from "../../api/maintenance";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";

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
          <div className="rounded border border-gray-200 bg-white p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Profile</h3>
            <dl className="space-y-1">
              <div><dt className="inline font-medium">Code:</dt> <dd className="inline">{vendor.code}</dd></div>
              <div><dt className="inline font-medium">Type:</dt> <dd className="inline">{vendor.type ?? "—"}</dd></div>
              <div><dt className="inline font-medium">Email:</dt> <dd className="inline">{vendor.contact_email ?? "—"}</dd></div>
              <div><dt className="inline font-medium">Phone:</dt> <dd className="inline">{vendor.contact_phone ?? "—"}</dd></div>
              <div><dt className="inline font-medium">Address:</dt> <dd className="inline">{vendor.address ?? "—"}</dd></div>
              <div><dt className="inline font-medium">Payment terms:</dt> <dd className="inline">{vendor.payment_terms ?? "—"}</dd></div>
              <div><dt className="inline font-medium">Status:</dt> <dd className="inline">{vendor.is_active ? "Active" : "Archived"}</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-gray-500">
              Catalog record in{" "}
              <Link className="text-blue-600 underline" to="/lists/maintenance/vendors">
                Lists & Catalogs / Maintenance Vendors
              </Link>
              .
            </p>
          </div>

          <div className="rounded border border-gray-200 bg-white p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Notes</h3>
            <p className="whitespace-pre-wrap text-gray-700">{vendor.notes ?? vendor.description ?? "No notes recorded."}</p>
          </div>
        </div>
      ) : null}

      <div className="rounded border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Work Order History</h3>
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase text-gray-600">
            <tr>
              <th className="py-1">WO</th>
              <th className="py-1">Type</th>
              <th className="py-1">Status</th>
              <th className="py-1">Location</th>
              <th className="py-1">Opened</th>
            </tr>
          </thead>
          <tbody>
            {woHistory.map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="py-1">{String(row.display_id ?? row.id ?? "—")}</td>
                <td className="py-1">{String(row.wo_type ?? "—")}</td>
                <td className="py-1">{String(row.status ?? "—")}</td>
                <td className="py-1">{String(row.repair_location ?? "—")}</td>
                <td className="py-1">{String(row.opened_at ?? "—")}</td>
              </tr>
            ))}
            {woHistory.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-center text-gray-500">
                  No linked work orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Invoice History</h3>
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase text-gray-600">
            <tr>
              <th className="py-1">Invoice #</th>
              <th className="py-1">WO</th>
              <th className="py-1">Amount</th>
              <th className="py-1">Date</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoiceHistory.map((row) => (
              <tr key={`${String(row.work_order_id)}-${String(row.invoice_number)}`} className="border-t border-gray-100">
                <td className="py-1">{String(row.invoice_number ?? "—")}</td>
                <td className="py-1">{String(row.display_id ?? row.work_order_id ?? "—")}</td>
                <td className="py-1">{row.invoice_amount != null ? `$${Number(row.invoice_amount).toFixed(2)}` : "—"}</td>
                <td className="py-1">{String(row.invoice_date ?? "—")}</td>
                <td className="py-1">{String(row.status ?? "—")}</td>
              </tr>
            ))}
            {invoiceHistory.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-center text-gray-500">
                  No vendor invoices recorded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
