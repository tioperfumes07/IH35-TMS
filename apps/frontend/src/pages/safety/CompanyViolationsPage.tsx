import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanyViolations } from "../../api/safety";
import { CompanyViolationCreateModal } from "./components/CompanyViolationCreateModal";
import { CompanyViolationDetailDrawer } from "./components/CompanyViolationDetailDrawer";

type Props = {
  operatingCompanyId: string;
};

export function CompanyViolationsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  const query = useQuery({
    queryKey: ["safety", "company-violations", operatingCompanyId],
    queryFn: () => getCompanyViolations(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white"
        >
          + Create Company Violation
        </button>
      </div>
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-[980px] w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-1">Reported</th>
              <th className="px-2 py-1">Type</th>
              <th className="px-2 py-1">Severity</th>
              <th className="px-2 py-1">Description</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.company_violations ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.reported_date ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.violation_type ?? "—")}</td>
                <td className="px-2 py-1">{String(row.violation_severity ?? "—")}</td>
                <td className="px-2 py-1">{String(row.description ?? "—")}</td>
                <td className="px-2 py-1">{String(row.status ?? "open")}</td>
                <td className="px-2 py-1">
                  <button type="button" className="text-blue-700 underline" onClick={() => setSelected(row)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {(query.data?.company_violations ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-center text-gray-500">
                  No company violations found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <CompanyViolationCreateModal
        open={createOpen}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "company-violations", operatingCompanyId] })}
      />
      <CompanyViolationDetailDrawer
        open={Boolean(selected)}
        violation={selected}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setSelected(null)}
        onUpdated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "company-violations", operatingCompanyId] })}
      />
    </div>
  );
}
