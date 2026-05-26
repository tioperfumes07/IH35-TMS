import { useQuery } from "@tanstack/react-query";
import { listMaintenanceCompliance425cLog } from "../../../api/maintenance";
import { useCompanyContext } from "../../../contexts/CompanyContext";

export function Compliance425CPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const listQ = useQuery({
    queryKey: ["maintenance", "compliance-425c", companyId],
    queryFn: () => listMaintenanceCompliance425cLog(companyId),
    enabled: Boolean(companyId),
  });

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Compliance / 425C Linkage</h2>
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 text-xs text-gray-600">Read-only 425C audit linkage feed for maintenance events.</div>
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase text-gray-600">
            <tr>
              <th className="py-1">Timestamp</th>
              <th className="py-1">Event Type</th>
              <th className="py-1">Payload</th>
            </tr>
          </thead>
          <tbody>
            {(listQ.data?.rows ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100 align-top">
                <td className="py-1">{String(row.created_at ?? "—")}</td>
                <td className="py-1">{String(row.event_type ?? "—")}</td>
                <td className="py-1">
                  <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-[11px]">{JSON.stringify(row.payload ?? {}, null, 2)}</pre>
                </td>
              </tr>
            ))}
            {(listQ.data?.rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="py-3 text-gray-500">No 425C-linked events found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
