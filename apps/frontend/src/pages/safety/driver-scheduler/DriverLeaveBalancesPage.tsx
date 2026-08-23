import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ListErrorState } from "../../../components/ListErrorState";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";

type BalanceRow = {
  id: string;
  driver_id: string;
  driver_name?: string;
  driver_status?: string;
  plan_year: number;
  vacation_allocated: number;
  vacation_used: number;
  vacation_remaining: number;
  sick_allocated: number;
  sick_used: number;
  sick_remaining: number;
  personal_allocated: number;
  personal_used: number;
  personal_remaining: number;
};

export function DriverLeaveBalancesPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const year = new Date().getFullYear();

  const policyQuery = useQuery({
    queryKey: ["driver-scheduler", "policy", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.getPolicy(operatingCompanyId),
  });

  const balancesQuery = useQuery({
    queryKey: ["driver-scheduler", "balances", operatingCompanyId, year],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.listBalances(operatingCompanyId, year),
  });

  const rows = (balancesQuery.data?.balances ?? []) as BalanceRow[];

  const columns = useMemo<ParityColumn<BalanceRow>[]>(
    () => [
      {
        key: "driver_id",
        label: "Driver",
        render: (row) => (
          <EntityLink
            kind="driver"
            id={row.driver_id}
            label={entityLabel(row.driver_name, row.driver_id, "Driver")}
            onClick={() => navigate(`/drivers/${row.driver_id}`)}
          />
        ),
      },
      {
        key: "vacation",
        label: "Vacation (rem / used / alloc)",
        render: (row) =>
          `${row.vacation_remaining} / ${row.vacation_used} / ${row.vacation_allocated}`,
      },
      {
        key: "sick",
        label: "Sick (rem / used / alloc)",
        render: (row) => `${row.sick_remaining} / ${row.sick_used} / ${row.sick_allocated}`,
      },
      {
        key: "personal",
        label: "Personal (rem / used / alloc)",
        render: (row) =>
          `${row.personal_remaining} / ${row.personal_used} / ${row.personal_allocated}`,
      },
      {
        key: "plan_year",
        label: "Plan year",
        render: (row) => String(row.plan_year),
      },
    ],
    [navigate]
  );

  return (
    <div className="space-y-3" data-testid="safety-leave-balances-page">
      <PageHeader
        title="Leave Balances"
        subtitle={`Per-driver allocated / used / remaining for plan year ${year} (catalogs.driver_leave_balances)`}
      />
      <div className="mb-2">
        <Link to="/safety/driver-scheduler" className="text-xs text-slate-700 hover:underline">
          ← Driver Scheduler grid
        </Link>
      </div>
      {policyQuery.isLoading ? <div className="text-sm text-gray-500">Loading policy…</div> : null}
      {policyQuery.isError ? (
        <ListErrorState
          title="Couldn't load leave policy"
          status={0}
          message="The company leave policy is temporarily unavailable."
          onRetry={() => void policyQuery.refetch()}
        />
      ) : null}
      {policyQuery.data ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <span className="font-semibold">Vacation days / year:</span>{" "}
              {String(policyQuery.data.vacation_days_per_year ?? "—")}
            </div>
            <div>
              <span className="font-semibold">Sick days / year:</span>{" "}
              {String(policyQuery.data.sick_days_per_year ?? "—")}
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
      {balancesQuery.isLoading ? <div className="text-sm text-gray-500">Loading driver balances…</div> : null}
      {balancesQuery.isError ? (
        <ListErrorState
          title="Couldn't load driver leave balances"
          status={0}
          message="The company-scoped balance roster is temporarily unavailable."
          onRetry={() => void balancesQuery.refetch()}
        />
      ) : null}
      {!balancesQuery.isLoading && !balancesQuery.isError ? (
        rows.length === 0 ? (
          <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm text-gray-600">
            No active drivers (or no leave policy) for this company — balances seed from policy when
            drivers exist.
          </div>
        ) : (
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(row) => String(row.id)}
            loading={balancesQuery.isLoading}
            emptyText="No leave balance rows"
            storageKey="safety-leave-balances"
            exportFilename="leave-balances"
          />
        )
      ) : null}
    </div>
  );
}
