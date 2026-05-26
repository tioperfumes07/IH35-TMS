import { useQuery } from "@tanstack/react-query";
import { listMaintenanceInspections } from "../../../api/maintenance";
import { useCompanyContext } from "../../../contexts/CompanyContext";

export function InspectionsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const listQ = useQuery({
    queryKey: ["maintenance", "inspections", companyId],
    queryFn: () => listMaintenanceInspections(companyId),
    enabled: Boolean(companyId),
  });

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Inspections</h2>
      <div className="rounded border border-gray-200 bg-white p-3">
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase text-gray-600">
            <tr>
              <th className="py-1">Date</th>
              <th className="py-1">Type</th>
              <th className="py-1">Unit</th>
              <th className="py-1">Inspector</th>
              <th className="py-1">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {(listQ.data?.rows ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="py-1">{String(row.inspection_date ?? "—")}</td>
                <td className="py-1">{String(row.inspection_type ?? "—")}</td>
                <td className="py-1">{String(row.unit_id ?? "—")}</td>
                <td className="py-1">{String(row.inspector_name ?? "—")}</td>
                <td className="py-1">{String(row.outcome ?? "—")}</td>
              </tr>
            ))}
            {(listQ.data?.rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-gray-500">No inspections logged yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
