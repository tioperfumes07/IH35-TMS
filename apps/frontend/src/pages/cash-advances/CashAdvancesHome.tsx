import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCashAdvanceDetail, getCashAdvancesKpis, listCashAdvances } from "../../api/cashAdvances";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useListState } from "../../components/list-state";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { useStagedListFilters } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AdvanceDetailDrawer } from "./components/AdvanceDetailDrawer";
import { CashAdvancesKpiRow } from "./components/CashAdvancesKpiRow";
import { CashAdvancesTable } from "./components/CashAdvancesTable";
import { CreateAdvanceModal } from "./components/CreateAdvanceModal";
import { MarkDisbursedModal } from "./components/MarkDisbursedModal";
import { ListErrorState } from "../../components/ListErrorState";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";

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

export function CashAdvancesHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  // LAW OF THE LAND §9 (2026-07-22): EntityLink kind="cash_advance" → /cash-advances?advance_id=
  // and the driver-profile reverse link → /cash-advances?driver_id= (settlement/liability parity).
  // BANK-F5164 — visible EntityPicker (URL-only banner is not reverse chrome).
  // LV-CASH-ADVANCES-HOME-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
  const deepLinkAdvanceId = searchParams.get("advance_id");
  const driverIdFilter = searchParams.get("driver_id")?.trim() ?? "";

  function patchListSearchParam(next: { driverId: string }) {
    const params = new URLSearchParams(searchParams);
    if (next.driverId) params.set("driver_id", next.driverId);
    else params.delete("driver_id");
    setSearchParams(params, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFilter,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({ ...prev, driverId: driverIdFilter }));
  }, [driverIdFilter]);

  const setDriverFilter = (driverId: string) => {
    staged.setDraft((d) => ({ ...d, driverId }));
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
    queryKey: ["cash-advances", "kpis", companyId],
    queryFn: () => getCashAdvancesKpis(companyId),
    enabled: Boolean(companyId),
  });

  const listQuery = useQuery({
    queryKey: ["cash-advances", "list", companyId, tab, effectiveDriverId],
    queryFn: () => listCashAdvances(companyId, { view: tab, driver_id: effectiveDriverId }),
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

      <div className="relative flex flex-wrap items-end gap-3" data-testid="cash-advances-filters">
        <label className="text-[11px] text-slate-600">
          Driver
          <EntityPicker
            kind="driver"
            operatingCompanyId={companyId}
            value={filterDraft.driverId || null}
            onChange={(next) => setDriverFilter(next ?? "")}
            allowCreate={false}
            placeholder="All drivers"
            className="mt-1"
            dataTestId="cash-advances-filter-driver"
          />
        </label>
        <Button type="button" size="sm" data-testid="cash-advances-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="cash-advances-filter-cancel"
          onClick={staged.cancel}
          disabled={!staged.dirty}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="cash-advances-filter-reset"
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY_FILTERS);
            patchListSearchParam(EMPTY_FILTERS);
          }}
        >
          Reset
        </Button>
      </div>

      <NavyPageSubNav
        items={SUBNAV.map(([label, value]) => ({ label, to: `#${value}` }))}
        activeId={tab}
        onTabChange={(id) => setTab(id as CashAdvancesTab)}
        itemIds={SUBNAV.map(([, value]) => value)}
      />

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
      ) : (
        /* SETL-F3544: always mount table chrome (empty/loading via ParityTable) — empty early-return skipped surface bar. */
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
