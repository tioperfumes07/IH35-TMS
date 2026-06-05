import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers } from "../../api/mdata";
import { listDriverQualificationItems, type DriverQualificationFileItem } from "../../api/safety";
import { KpiCard } from "../../components/layout/KpiCard";
import { KpiStrip } from "../../components/layout/KpiStrip";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { colors } from "../../design/tokens";
import { driverDisplayName, summarizeDriverDqf } from "../../lib/driverDqf";
import { DriversTable } from "./DriversTable";

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
        {driversQ.isLoading ? (
          <div className="px-3 py-6 text-center text-slate-500 text-xs">Loading drivers...</div>
        ) : (
          <DriversTable rows={rows} onOpenProfile={onOpenProfile} />
        )}
      </section>
    </div>
  );
}
