import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listDrivers } from "../../api/mdata";
import { DriverImportModal } from "./DriverImportModal";
import { listDriverQualificationItems, type DriverQualificationFileItem } from "../../api/safety";
import { Button } from "../../components/Button";
import { CreateDriverModal } from "../../components/drivers/CreateDriverModal";
import { KpiCard } from "../../components/layout/KpiCard";
import { ListErrorState } from "../../components/ListErrorState";
import { KpiStrip } from "../../components/layout/KpiStrip";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { colors } from "../../design/tokens";
import { type DqfComplianceLevel, driverDisplayName, summarizeDriverDqf } from "../../lib/driverDqf";
import { formatDateUS } from "../../lib/formatDate";
import { DriversTable } from "./DriversTable";
import { userFacingApiError } from "../../lib/api-error-message";
import { companyToday } from "../../lib/businessDate";

type DriversListPageProps = {
  onOpenProfile?: (driverId: string) => void;
};

type DriverDqfSummaryRow = {
  driverId: string;
  name: string;
  status: string;
  summary: ReturnType<typeof summarizeDriverDqf>;
};

type DqfFocus = Exclude<DqfComplianceLevel, "unknown"> | null;

export function DriversListPage({ onOpenProfile }: DriversListPageProps) {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  // B-A3: KPI focus — filters the loaded DQF summary rows by the same level the KPI counts.
  const [dqfFocus, setDqfFocus] = useState<DqfFocus>(null);
  const [showImport, setShowImport] = useState(false);
  // SM1: single-driver create action on the shared DQF surface (Drivers "Profiles" + Safety "Driver
  // Files") — reuses the SAME canonical CreateDriverModal as the Drivers module, never a second creator.
  const [showCreate, setShowCreate] = useState(false);
  const pageSize = 25;

  // Server-side pagination (GO-LIVE Block 1A): fetch only the current page + a real total, so the FULL
  // roster is reachable via Prev/Next — not truncated to the default first 50.
  const driversQ = useQuery({
    queryKey: ["drivers", "dqf-list", companyId, search, page],
    enabled: Boolean(companyId),
    queryFn: () =>
      listDrivers({ operating_company_id: companyId, status: "All", search, limit: pageSize, offset: page * pageSize }),
  });
  const pageDrivers = useMemo(() => driversQ.data?.drivers ?? [], [driversQ.data?.drivers]);
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
  }, [dqfQ.data, pageDrivers]);

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

  const focusedRows = useMemo(() => {
    if (!dqfFocus) return rows;
    return rows.filter((row) => row.summary.level === dqfFocus);
  }, [rows, dqfFocus]);

  const toggleDqfFocus = (level: Exclude<DqfComplianceLevel, "unknown"> | null) => {
    setDqfFocus((prev) => (prev === level ? null : level));
  };

  const rangeStart = totalDrivers === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize + pageDrivers.length, totalDrivers);
  const canPrev = page > 0;
  const canNext = rangeEnd < totalDrivers;

  const [exporting, setExporting] = useState(false);
  // Export the FULL driver roster (not just the current page) to CSV for offline review — names + hire/term
  // dates + pay basis + status + CDL. Reads through the authenticated session (correct per-entity RLS).
  //
  // CLS-SILENT-CAP — this asked for limit:500 in ONE call. The backend clamps limit to max(200)
  // (drivers.routes.ts listQuerySchema), so that request did not truncate at 500 — it failed zod
  // validation and 400'd. With no catch, the rejection was swallowed and `exporting` simply reset:
  // clicking "Export profiles (CSV)" produced no file and no error. A silent FAILURE reading as a
  // no-op is worse than the silent cap the card described.
  //
  // Now pages at the backend's real maximum and keeps going until the server's own `total` is
  // satisfied, then refuses to hand over a file it knows is short. An export that quietly omits
  // drivers is the thing to prevent — a roster CSV is used offline, where nobody can see what is
  // missing.
  async function handleExportCsv() {
    if (!companyId || exporting) return;
    setExporting(true);
    try {
      const PAGE = 200; // backend listQuerySchema caps limit at 200; asking for more is a 400.
      const first = await listDrivers({ operating_company_id: companyId, status: "All", limit: PAGE, offset: 0 });
      const expected = first.total ?? first.drivers.length;
      const collected = [...first.drivers];
      // Walk OFFSETS, not collected-row counts: listDrivers filters system rows out client-side
      // while `total` is the server's unfiltered count, so comparing lengths would under-count on
      // every roster that has a system driver and refuse to export at all. Covering every offset up
      // to `total` is the condition that actually proves nothing was skipped.
      let covered = PAGE;
      const maxPages = 200; // bound so a server that never advances cannot spin forever
      for (let pageIndex = 1; covered < expected && pageIndex < maxPages; pageIndex += 1) {
        const next = await listDrivers({
          operating_company_id: companyId,
          status: "All",
          limit: PAGE,
          offset: pageIndex * PAGE,
        });
        collected.push(...next.drivers);
        covered += PAGE;
      }
      if (covered < expected) {
        pushToast(
          `Export covered only ${covered} of ${expected} driver records — the file was NOT downloaded ` +
            `because it would have been incomplete. Please retry.`,
          "error"
        );
        return;
      }
      const all = { drivers: collected };
      const esc = (value: unknown) => {
        const s = value == null ? "" : String(value);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ["Last name", "First name", "Hire date", "Termination date", "Pay basis", "Status", "CDL number", "CDL state", "Phone", "Driver ID"];
      const lines = all.drivers.map((d) =>
        [d.last_name, d.first_name, formatDateUS(d.hire_date), formatDateUS(d.termination_date), d.pay_basis ?? "", d.status ?? "", d.cdl_number ?? "", d.cdl_state ?? "", d.phone ?? "", d.id]
          .map(esc)
          .join(",")
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `IH35-driver-profiles-${companyToday()}.csv`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      // Previously absent: the 400 from the over-limit request rejected into nothing, so a broken
      // export was indistinguishable from a working one.
      pushToast(userFacingApiError(err, "Failed to export driver profiles"), "error");
    } finally {
      setExporting(false);
    }
  }

  if (!companyId) {
    return <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Driver qualification profiles"
        subtitle="Fleet DQF checklist and compliance status chips"
        actions={
          <div className="flex items-center gap-2">
            <input
              className="h-8 w-[220px] rounded-sm border border-gray-300 px-2 text-xs"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search drivers"
              aria-label="Search drivers"
            />
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting || !companyId}
              className="h-8 rounded-sm border border-gray-300 px-3 text-xs text-slate-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {exporting ? "Exporting…" : "Export profiles (CSV)"}
            </button>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              disabled={!companyId}
              className="h-8 rounded-sm border border-gray-300 px-3 text-xs text-slate-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Import drivers (CSV)
            </button>
            <Button type="button" size="sm" onClick={() => setShowCreate(true)} disabled={!companyId}>
              + Create driver
            </Button>
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

      <CreateDriverModal
        open={showCreate}
        companyId={companyId}
        onClose={() => setShowCreate(false)}
        onCreated={onOpenProfile}
      />

      {!dqfQ.isError ? <KpiStrip>
        <KpiCard
          label="Drivers"
          number={String(totals.total)}
          accent={colors.info.strong}
          onClick={() => setDqfFocus(null)}
        />
        <KpiCard
          label="Compliant"
          number={String(totals.compliant)}
          accent={colors.positive.strong}
          onClick={() => toggleDqfFocus("compliant")}
        />
        <KpiCard
          label="Needs attention"
          number={String(totals.attention)}
          accent={colors.warn.strong}
          onClick={() => toggleDqfFocus("attention")}
        />
        <KpiCard
          label="Non-compliant"
          number={String(totals.nonCompliant)}
          accent={colors.crit.strong}
          onClick={() => toggleDqfFocus("non_compliant")}
        />
        <KpiCard
          label="No DQF items"
          number={String(totals.empty)}
          accent={colors.drivers.strong}
          onClick={() => toggleDqfFocus("empty")}
        />
      </KpiStrip> : null}

      <section className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        {dqfQ.isError ? (
          <ListErrorState title="Couldn't load driver DQF summaries" status={0} message={(dqfQ.error as Error)?.message} onRetry={() => void dqfQ.refetch()} />
        ) : driversQ.isError ? (
          <ListErrorState title="Couldn't load drivers" status={0} message={(driversQ.error as Error)?.message} onRetry={() => void driversQ.refetch()} />
        ) : driversQ.isLoading ? (
          <div className="px-3 py-6 text-center text-slate-500 text-xs">Loading drivers...</div>
        ) : (
          <DriversTable
            rows={focusedRows}
            companyId={companyId}
            onOpenProfile={onOpenProfile}
            onUpdated={() => {
              void driversQ.refetch();
              void dqfQ.refetch();
            }}
          />
        )}
        <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 text-xs text-slate-600">
          <span>{totalDrivers === 0 ? "0 of 0" : `${rangeStart}–${rangeEnd} of ${totalDrivers}`}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
