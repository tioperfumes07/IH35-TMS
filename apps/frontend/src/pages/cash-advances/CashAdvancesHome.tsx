import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCashAdvanceDetail, getCashAdvancesKpis, listCashAdvances } from "../../api/cashAdvances";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useListState } from "../../components/list-state";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AdvanceDetailDrawer } from "./components/AdvanceDetailDrawer";
import { CashAdvancesKpiRow } from "./components/CashAdvancesKpiRow";
import { CashAdvancesTable } from "./components/CashAdvancesTable";
import { CreateAdvanceModal } from "./components/CreateAdvanceModal";
import { MarkDisbursedModal } from "./components/MarkDisbursedModal";
import { ListErrorState } from "../../components/ListErrorState";

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

export function CashAdvancesHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  // LAW OF THE LAND §9 (2026-07-22): EntityLink kind="cash_advance" → /cash-advances?advance_id=
  // and the driver-profile reverse link → /cash-advances?driver_id= (settlement/liability parity).
  const deepLinkAdvanceId = searchParams.get("advance_id");
  const driverIdFilter = searchParams.get("driver_id");
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
    queryKey: ["cash-advances", "kpis", companyId],
    queryFn: () => getCashAdvancesKpis(companyId),
    enabled: Boolean(companyId),
  });

  const listQuery = useQuery({
    queryKey: ["cash-advances", "list", companyId, tab, driverIdFilter],
    queryFn: () => listCashAdvances(companyId, { view: tab, driver_id: driverIdFilter ?? undefined }),
    enabled: Boolean(companyId),
  });

  const detailQuery = useQuery({
    queryKey: ["cash-advances", "detail", companyId, selectedId ?? ""],
    queryFn: () => getCashAdvanceDetail(selectedId!, companyId),
    enabled: Boolean(companyId && selectedId),
  });

  const rows = useMemo(() => listQuery.data?.advances ?? [], [listQuery.data?.advances]);
  // SETL-S02 — settled-only empty (LIST-EMPTY-1); never flash "No cash advances" mid-fetch.
  const listState = useListState(listQuery, rows.length === 0);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Cash Advances"
        subtitle="Driver advances + bill-payment linkage"
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            + Create Advance
          </Button>
        }
      />

      {driverIdFilter ? (
        <div className="flex items-center justify-between rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span>Filtered to one driver.</span>
          <button
            type="button"
            className="text-slate-700 underline"
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.delete("driver_id");
              setSearchParams(params, { replace: true });
            }}
          >
            Clear filter
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-sm bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {SUBNAV.map(([label, value]) => (
            <button
              key={value}
              type="button"
              className={tab === value ? "border-b border-white pb-0.5 font-semibold" : ""}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {kpisQuery.isError ? (
        <ListErrorState
          title="Couldn't load cash advance totals"
          status={0}
          message={(kpisQuery.error as Error)?.message}
          onRetry={() => void kpisQuery.refetch()}
        />
      ) : (
        <CashAdvancesKpiRow kpis={kpisQuery.data} />
      )}

      {listQuery.isError ? (
        <ListErrorState
          title="Couldn't load cash advances"
          status={0}
          message={(listQuery.error as Error)?.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : listState.isEmpty ? (
        <p
          className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs text-slate-600"
          data-testid="cash-advances-empty"
        >
          No cash advances found — none created for this entity yet (or no rows match the current filter).
        </p>
      ) : (
        <CashAdvancesTable
          rows={rows}
          isLoading={listState.isLoading}
          onOpenDetail={(row) => {
            setSelectedId(String(row.id));
            setDetailOpen(true);
          }}
          onMarkDisbursed={(row) => {
            setSelectedId(String(row.id));
            setMarkDisbursedOpen(true);
          }}
        />
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
        onClose={() => setMarkDisbursedOpen(false)}
        onDone={() => {
          setMarkDisbursedOpen(false);
          void queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
        }}
      />
    </div>
  );
}
