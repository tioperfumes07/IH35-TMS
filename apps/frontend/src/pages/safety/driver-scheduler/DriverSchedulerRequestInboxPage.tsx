import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";

export function DriverSchedulerRequestInboxPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["driver-scheduler", "pending", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.listPending(operatingCompanyId),
  });

  return (
    <div className="space-y-3">
      <PageHeader title="Leave Requests" subtitle="Pending time-off requests awaiting review" />
      <div className="mb-2">
        <Link to="/safety/driver-scheduler" className="text-xs text-blue-600 hover:underline">
          ← Back to Driver Scheduler grid
        </Link>
      </div>

      {query.isLoading ? <div className="text-sm text-gray-500">Loading…</div> : null}
      {query.isError ? <div className="text-sm text-red-700">Could not load pending requests.</div> : null}

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-2 py-1 text-left">Request</th>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-left">Type</th>
              <th className="px-2 py-1 text-left">Dates</th>
              <th className="px-2 py-1 text-left" />
            </tr>
          </thead>
          <tbody>
            {(query.data?.requests ?? []).map((r) => (
              <tr key={String(r.id)} className="border-t border-gray-100">
                <td className="px-2 py-1 font-mono">{String(r.request_number)}</td>
                <td className="px-2 py-1">{String(r.driver_name ?? "")}</td>
                <td className="px-2 py-1">{String(r.leave_type)}</td>
                <td className="px-2 py-1">
                  {String(r.start_date).slice(0, 10)} – {String(r.end_date).slice(0, 10)}
                </td>
                <td className="px-2 py-1">
                  <Link to={`/safety/scheduler/requests/${String(r.id)}`}>
                    <Button size="sm" variant="secondary">
                      Review
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!query.isLoading && (query.data?.requests?.length ?? 0) === 0 ? (
          <div className="p-4 text-sm text-gray-500">No pending leave requests.</div>
        ) : null}
      </div>
    </div>
  );
}
