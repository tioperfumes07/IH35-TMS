import { useQuery } from "@tanstack/react-query";
import { listMaintenanceVendors } from "../../../api/maintenance";
import { useCompanyContext } from "../../../contexts/CompanyContext";

export function VendorsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const listQ = useQuery({
    queryKey: ["maintenance", "vendors", companyId],
    queryFn: () => listMaintenanceVendors(companyId),
    enabled: Boolean(companyId),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Maintenance Vendors</h2>
      </div>
      <div className="rounded border border-gray-200 bg-white p-3">
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase text-gray-600">
            <tr>
              <th className="py-1">Vendor</th>
              <th className="py-1">Email</th>
              <th className="py-1">Phone</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {(listQ.data?.rows ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="py-1">{String(row.name ?? "—")}</td>
                <td className="py-1">{String(row.contact_email ?? "—")}</td>
                <td className="py-1">{String(row.contact_phone ?? "—")}</td>
                <td className="py-1">{row.active ? "Active" : "Voided"}</td>
              </tr>
            ))}
            {(listQ.data?.rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 text-gray-500">No vendors available.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
