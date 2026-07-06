import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { PageHeader } from "../../../components/layout/PageHeader";

type SessionRow = {
  uuid: string;
  diff_status: string;
  diff_summary: string | null;
  created_at: string;
  unit_number?: string;
  driver_name?: string;
};

async function fetchSessions(operatingCompanyId: string) {
  return apiRequest<{ sessions: SessionRow[] }>(
    `/api/safety/photo-comparison/sessions?operating_company_id=${operatingCompanyId}`
  );
}

export function PhotoComparisonPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["photo-comparison-sessions", companyId],
    queryFn: () => fetchSessions(companyId),
    enabled: Boolean(companyId),
  });

  const sessions = query.data?.sessions ?? [];

  return (
    <div className="space-y-3 p-4">
      <PageHeader backHref="/safety" breadcrumb={["Safety", "Photo Comparison"]} title="Photo Comparison" subtitle="AI pre/post-trip damage detection" />

      {!companyId ? <p className="text-sm text-red-600">Select operating company.</p> : null}

      {query.isLoading ? <p className="text-sm text-gray-500">Loading sessions…</p> : null}

      {query.isError ? <p className="text-sm text-red-600">Failed to load sessions.</p> : null}

      {sessions.length === 0 && !query.isLoading && !query.isError ? (
        <p className="text-sm text-gray-500">No photo comparison sessions found.</p>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Unit</th>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Summary</th>
              <th className="px-2 py-1 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.uuid} className="border-t border-gray-100">
                <td className="px-2 py-1">{new Date(session.created_at).toLocaleDateString()}</td>
                <td className="px-2 py-1">{session.unit_number ?? "—"}</td>
                <td className="px-2 py-1">{session.driver_name ?? "—"}</td>
                <td className="px-2 py-1">{session.diff_status}</td>
                <td className="px-2 py-1">{session.diff_summary ?? "—"}</td>
                <td className="px-2 py-1">
                  <Link to={`/safety/photo-comparison/${session.uuid}`} className="text-slate-700 underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
