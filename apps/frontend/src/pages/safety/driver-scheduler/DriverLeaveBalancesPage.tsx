import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import { Link } from "react-router-dom";

export function DriverLeaveBalancesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const policyQuery = useQuery({
    queryKey: ["driver-scheduler", "policy", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.getPolicy(operatingCompanyId),
  });

  return (
    <div className="space-y-3">
      <PageHeader title="Leave Balances" subtitle="Annual entitlements per company policy (driver-level balances in a follow-on PR)" />
      <div className="mb-2">
        <Link to="/safety/driver-scheduler" className="text-xs text-blue-600 hover:underline">
          ← Driver Scheduler grid
        </Link>
      </div>
      {policyQuery.isLoading ? <div className="text-sm text-gray-500">Loading policy…</div> : null}
      {policyQuery.data ? (
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <span className="font-semibold">Vacation days / year:</span>{" "}
              {String(policyQuery.data.vacation_days_per_year ?? "—")}
            </div>
            <div>
              <span className="font-semibold">Sick days / year:</span> {String(policyQuery.data.sick_days_per_year ?? "—")}
            </div>
            <div>
              <span className="font-semibold">Personal days / year:</span>{" "}
              {String(policyQuery.data.personal_days_per_year ?? "—")}
            </div>
            <div>
              <span className="font-semibold">Vacation advance notice (days):</span>{" "}
              {String(policyQuery.data.vacation_advance_notice_days ?? "—")}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
