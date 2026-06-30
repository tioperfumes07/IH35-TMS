import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listDrivers } from "../../api/mdata";
import { DriverImportModal } from "./DriverImportModal";
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
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showImport, setShowImport] = useState(false);
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

  const [exporting, setExporting] = useState(false);
  // Export the FULL driver roster (not just the current page) to CSV for offline review — names + hire/term
  // dates + pay basis + status + CDL. Reads through the authenticated session (correct per-entity RLS).
  async function handleExportCsv() {
    if (!companyId || exporting) return;
    setExporting(true);
    try {
      const all = await listDrivers({ operating_company_id: companyId, status: "All", limit: 500, offset: 0 });
      const esc = (value: unknown) => {
        const s = value == null ? "" : String(value);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ["Last name", "First name", "Hire date", "Termination date", "Pay basis", "Status", "CDL number", "CDL state", "Phone", "Driver ID"];
      const lines = all.drivers.map((d) =>
        [d.last_name, d.first_name, d.hire_date ?? "", d.termination_date ?? "", d.pay_basis ?? "", d.status ?? "", d.cdl_number ?? "", d.cdl_state ?? "", d.phone ?? "", d.id]
          .map(esc)
          .join(",")
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `IH35-driver-profiles-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(href);
    } finally {
      setExporting(false);
    }
  }

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Driver qualification profiles"
        subtitle="Fleet DQF checklist and compliance status chips"
        actions={
          <div className="flex items-center gap-2">
            <input
              className="h-8 w-[220px] rounded border border-gray-300 px-2 text-xs"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search drivers"
            />
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting || !companyId}
              className="h-8 rounded border border-gray-300 px-3 text-xs text-slate-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {exporting ? "Exporting…" : "Export profiles (CSV)"}
            </button>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              disabled={!companyId}
              className="h-8 rounded border border-gray-300 px-3 text-xs text-slate-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Import drivers (CSV)
            </button>
          </div>
        }
      />

      {showImport ? (
        <DriverImportModal
          companyId={companyId}
          onClose={() => setShowImport(false)}
          onImported={() => void queryClient.invalidateQueries({ queryKey: ["drivers"] })}
        />
      ) : null}

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
