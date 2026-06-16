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
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Server-side pagination (GO-LIVE Block 1A): fetch only the current page + a real total, so the FULL
  // roster is reachable via Prev/Next — not truncated to the default first 50.
  const driversQ = useQuery({
    queryKey: ["drivers", "dqf-list", companyId, search, page],
    enabled: Boolean(companyId),
    queryFn: () =>
      listDrivers({ operating_company_id: companyId, status: "All", search, limit: pageSize, offset: page * pageSize }),
  });
  const pageDrivers = driversQ.data?.drivers ?? [];
  const totalDrivers = driversQ.data?.total ?? 0;

  const dqfQ = useQuery({
    queryKey: ["drivers", "dqf-list-summary", companyId, pageDrivers.map((driver) => driver.id).join(",")],
    enabled: Boolean(companyId && driversQ.data),
    queryFn: async () => {
      const drivers = pageDrivers;
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
    return pageDrivers.map((driver) => {
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
      total: totalDrivers,
      compliant,
      attention,
      nonCompliant,
      empty,
    };
  }, [rows, totalDrivers]);

  const rangeStart = totalDrivers === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize + pageDrivers.length, totalDrivers);
  const canPrev = page > 0;
  const canNext = rangeEnd < totalDrivers;

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
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
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
        <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 text-xs text-slate-600">
          <span>{totalDrivers === 0 ? "0 of 0" : `${rangeStart}–${rangeEnd} of ${totalDrivers}`}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
