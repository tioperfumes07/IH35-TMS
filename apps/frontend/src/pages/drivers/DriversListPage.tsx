import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listDrivers } from "../../api/mdata";
import { listDriverQualificationItems, type DriverQualificationFileItem } from "../../api/safety";
import { KpiCard } from "../../components/layout/KpiCard";
import { KpiStrip } from "../../components/layout/KpiStrip";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { colors } from "../../design/tokens";
import { driverDisplayName, summarizeDriverDqf } from "../../lib/driverDqf";
import { DriverDqfComplianceChip } from "./components/DriverDqfComplianceChip";

type DriversListPageProps = {
  onOpenProfile?: (driverId: string) => void;
};

type DriverDqfSummaryRow = {
  driverId: string;
  name: string;
  status: string;
  summary: ReturnType<typeof summarizeDriverDqf>;
};

export function DriversListPage({ onOpenProfile }: DriversListPageProps) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");

  const driversQ = useQuery({
    queryKey: ["drivers", "dqf-list", companyId, search],
    enabled: Boolean(companyId),
    queryFn: () => listDrivers({ operating_company_id: companyId, status: "All", search }).then((result) => result.drivers),
  });

  const dqfQ = useQuery({
    queryKey: ["drivers", "dqf-list-summary", companyId, driversQ.data?.map((driver) => driver.id).join(",") ?? ""],
    enabled: Boolean(companyId && driversQ.data),
    queryFn: async () => {
      const drivers = driversQ.data ?? [];
      const pairs = await Promise.all(
        drivers.map(async (driver) => {
          const items = await listDriverQualificationItems(driver.id, companyId).then((result) => result.items);
          return [driver.id, items] as const;
        })
      );
      return new Map<string, DriverQualificationFileItem[]>(pairs);
    },
  });

  const rows = useMemo<DriverDqfSummaryRow[]>(() => {
    return (driversQ.data ?? []).map((driver) => {
      const items = dqfQ.data?.get(driver.id);
      return {
        driverId: driver.id,
        name: driverDisplayName(driver.first_name, driver.last_name, driver.id),
        status: driver.status,
        summary: summarizeDriverDqf(items),
      };
    });
  }, [driversQ.data, dqfQ.data]);

  const totals = useMemo(() => {
    const compliant = rows.filter((row) => row.summary.level === "compliant").length;
    const attention = rows.filter((row) => row.summary.level === "attention").length;
    const nonCompliant = rows.filter((row) => row.summary.level === "non_compliant").length;
    const empty = rows.filter((row) => row.summary.level === "empty").length;
    return {
      total: rows.length,
      compliant,
      attention,
      nonCompliant,
      empty,
    };
  }, [rows]);

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Driver qualification profiles"
        subtitle="Fleet DQF checklist and compliance status chips"
        actions={
          <input
            className="h-8 w-[220px] rounded border border-gray-300 px-2 text-xs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search drivers"
          />
        }
      />

      <KpiStrip>
        <KpiCard label="Drivers" number={String(totals.total)} accent={colors.info.strong} />
        <KpiCard label="Compliant" number={String(totals.compliant)} accent={colors.positive.strong} />
        <KpiCard label="Needs attention" number={String(totals.attention)} accent={colors.warn.strong} />
        <KpiCard label="Non-compliant" number={String(totals.nonCompliant)} accent={colors.crit.strong} />
        <KpiCard label="No DQF items" number={String(totals.empty)} accent={colors.drivers.strong} />
      </KpiStrip>

      <section className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Driver</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">DQF status chips</th>
              <th className="px-3 py-2">Checklist stats</th>
              <th className="px-3 py-2 text-right">Profile</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.driverId} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2">
                  <DriverDqfComplianceChip summary={row.summary} compact />
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {row.summary.presentCount} present · {row.summary.missingCount} missing · {row.summary.expiredCount} expired
                </td>
                <td className="px-3 py-2 text-right">
                  {onOpenProfile ? (
                    <button
                      type="button"
                      onClick={() => onOpenProfile(row.driverId)}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Open profile
                    </button>
                  ) : (
                    <Link to={`/drivers/${row.driverId}/profile`} className="text-xs font-semibold text-sky-700 hover:underline">
                      Open profile
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {!driversQ.isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  No drivers found.
                </td>
              </tr>
            ) : null}
            {driversQ.isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Loading drivers...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
