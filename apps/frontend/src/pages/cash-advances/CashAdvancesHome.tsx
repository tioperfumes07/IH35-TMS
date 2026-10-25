import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCashAdvanceDetail, getCashAdvancesKpis, listCashAdvances } from "../../api/cashAdvances";
import { Button } from "../../components/Button";
import { useListState } from "../../components/list-state";
import { EntityMultiSelect } from "../../components/EntityMultiSelect";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AdvanceDetailDrawer } from "./components/AdvanceDetailDrawer";
import { useCashAdvancesParityColumns } from "./components/CashAdvancesTable";
import { CreateAdvanceModal } from "./components/CreateAdvanceModal";
import { MarkDisbursedModal } from "./components/MarkDisbursedModal";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable } from "../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { moneyListKpiCard } from "../accounting/moneyListKpiCard";
import { formatUsdTable } from "../../lib/money";

const EMPTY_FILTERS = {
  driverId: "",
};

const SUBNAV = [
  ["All Advances", "all"],
  ["Pending Approval", "pending_approval"],
  ["Outstanding", "outstanding"],
  ["Paid Off", "paid_off"],
] as const;

type CashAdvancesTab = (typeof SUBNAV)[number][1];
const TAB_IDS = new Set<string>(SUBNAV.map(([, value]) => value));

export function parseCashAdvancesTab(raw: string | null): CashAdvancesTab {
  if (raw && TAB_IDS.has(raw)) return raw as CashAdvancesTab;
  return "all";
}

function kpiAmount(kpis: Record<string, unknown> | undefined, key: string): number | null {
  const raw = kpis?.[key];
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function CashAdvancesHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkAdvanceId = searchParams.get("advance_id");
  const driverIdFilter = searchParams.get("driver_id")?.trim() ?? "";

  function patchListSearchParam(next: { driverId: string }) {
    const params = new URLSearchParams(searchParams);
    if (next.driverId) params.set("driver_id", next.driverId);
    else params.delete("driver_id");
    setSearchParams(params, { replace: true });
  }

  const [listSearch, setListSearch] = useState("");
  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFilter,
  }));

  useEffect(() => {
    setApplied((prev) => ({ ...prev, driverId: driverIdFilter }));
  }, [driverIdFilter]);

  const setDriverFilterLive = (driverId: string) => {
    const next = { ...applied, driverId };
    setApplied(next);
    patchListSearchParam(next);
  };

  const effectiveDriverId = applied.driverId.trim() || undefined;
  const tab = parseCashAdvancesTab(searchParams.get("tab"));
  const setTab = (next: CashAdvancesTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [markDisbursedOpen, setMarkDisbursedOpen] = useState(false);

  useEffect(() => {
    if (!deepLinkAdvanceId) return;
    setSelectedId(deepLinkAdvanceId);
    setDetailOpen(true);
  }, [deepLinkAdvanceId]);

  const kpisQuery = useQuery({
    queryKey: ["cash-advances", "kpis", companyId, effectiveDriverId],
    queryFn: () => getCashAdvancesKpis(companyId, effectiveDriverId),
    enabled: Boolean(companyId),
  });

  const paidOffQuery = useQuery({
    queryKey: ["cash-advances", "paid-off-count", companyId, effectiveDriverId ?? ""],
    queryFn: async () => {
      const res = await listCashAdvances(companyId, { view: "paid_off", driver_id: effectiveDriverId });
      return res.advances?.length ?? 0;
    },
    enabled: Boolean(companyId),
  });

  const listQuery = useQuery({
    queryKey: ["cash-advances", "list", companyId, tab, effectiveDriverId, listSearch],
    queryFn: () =>
      listCashAdvances(companyId, {
        view: tab,
        driver_id: effectiveDriverId,
        search: listSearch.trim() || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const detailQuery = useQuery({
    queryKey: ["cash-advances", "detail", companyId, selectedId ?? ""],
    queryFn: () => getCashAdvanceDetail(selectedId!, companyId),
    enabled: Boolean(companyId && selectedId),
  });

  const rows = useMemo(() => listQuery.data?.advances ?? [], [listQuery.data?.advances]);
  const listState = useListState(listQuery, rows.length === 0);

  const onOpenDetail = (row: Record<string, unknown>) => {
    setSelectedId(String(row.id));
    setDetailOpen(true);
  };
  const onMarkDisbursed = (row: Record<string, unknown>) => {
    setSelectedId(String(row.id));
    setMarkDisbursedOpen(true);
  };
  const columns = useCashAdvancesParityColumns(onOpenDetail, onMarkDisbursed);

  const kpisFailed = kpisQuery.isError;
  const outstandingDisplay = kpisFailed
    ? "—"
    : formatUsdTable(kpiAmount(kpisQuery.data, "total_outstanding") ?? 0);
  const pendingDisplay = kpisFailed ? "—" : String(Math.round(kpiAmount(kpisQuery.data, "pending_approval") ?? 0));
  const paidOffDisplay = kpisFailed
    ? "—"
    : paidOffQuery.isError
      ? "—"
      : String(paidOffQuery.data ?? 0);
  const totalDisplay = kpisFailed ? "—" : String(Math.round(kpiAmount(kpisQuery.data, "advances_on_file") ?? 0));

  const activeFilterCount = applied.driverId.trim() ? 1 : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-page-title font-semibold text-[#0F1219]">Cash Advances</h1>
          <p className="text-xs text-[#6B7280]">Driver advances + bill-payment linkage</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          + Create Advance
        </Button>
      </div>

      <MoneyListToolbar
        search={listSearch}
        onSearchChange={setListSearch}
        searchPlaceholder="Search advances"
        onClearAll={() => {
          setListSearch("");
          setApplied(EMPTY_FILTERS);
          patchListSearchParam(EMPTY_FILTERS);
        }}
        activeFilterCount={activeFilterCount}
        testIdPrefix="cash-advances"
      >
        <label className="text-xs text-[#4B5563]">
          Driver
          <EntityMultiSelect
            kind="driver"
            operatingCompanyId={companyId}
            value={applied.driverId || null}
            onChange={(next) => setDriverFilterLive(next ?? "")}
            placeholder="All drivers"
            className="mt-1"
            dataTestId="cash-advances-filter-driver"
          />
        </label>
      </MoneyListToolbar>

      <div className="flex flex-wrap gap-2" data-testid="cash-advances-tab-buttons">
        {SUBNAV.map(([label, value]) => (
          <button
            key={value}
            type="button"
            className={`h-7 rounded-sm border px-2 text-xs font-medium ${
              tab === value
                ? "border-[#14314F] bg-[#14314F] text-white"
                : "border-gray-300 bg-[var(--surface-unselected)] text-gray-700 hover:bg-[var(--surface-hover)]"
            }`}
            onClick={() => setTab(value)}
            data-testid={`cash-advances-tab-${value}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" data-testid="cash-advances-kpi-strip">
        {moneyListKpiCard("Outstanding", outstandingDisplay, "total balance to recover", "warn")}
        {moneyListKpiCard("Pending", pendingDisplay, "awaiting approval")}
        {moneyListKpiCard("Paid off", paidOffDisplay, "zero outstanding balance")}
        {moneyListKpiCard("Total", totalDisplay, "advances on file")}
      </div>

      {listQuery.isError ? (
        <ListErrorState
          title="Couldn't load cash advances"
          status={0}
          message={(listQuery.error as Error)?.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <div data-testid="cash-advances-empty">
          <ParityTable<Record<string, unknown>>
            title="Cash advances"
            columns={columns}
            rows={rows}
            rowKey={(row) => String(row.id)}
            loading={listState.isLoading}
            emptyText="No cash advances found — none created for this entity yet (or no rows match the current filter)."
            storageKey="cash-advances-roster"
            exportFilename="cash-advances"
            tableTestId="cash-advances-table"
            gearButtonTestId="cash-advances-column-gear"
            suppressToolbarSearch
          />
        </div>
      )}

      {detailOpen && detailQuery.isError ? (
        <ListErrorState
          title="Couldn't load cash advance details"
          status={0}
          message={(detailQuery.error as Error)?.message}
          onRetry={() => void detailQuery.refetch()}
        />
      ) : null}

      <CreateAdvanceModal
        open={createOpen}
        operatingCompanyId={companyId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
        }}
      />

      <AdvanceDetailDrawer
        open={detailOpen}
        operatingCompanyId={companyId}
        advance={detailQuery.data ?? null}
        onClose={() => setDetailOpen(false)}
        onUpdated={() => {
          void queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
        }}
        onMarkDisbursed={() => setMarkDisbursedOpen(true)}
      />

      <MarkDisbursedModal
        open={markDisbursedOpen}
        operatingCompanyId={companyId}
        advanceId={selectedId}
        advance={detailQuery.data ?? null}
        onClose={() => setMarkDisbursedOpen(false)}
        onDone={() => {
          setMarkDisbursedOpen(false);
          void queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
        }}
      />
    </div>
  );
}
