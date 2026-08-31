import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { getActiveLiabilities, getLiabilitiesByDriver, getLiabilitiesKpis, getLiabilityDetail } from "../../api/liabilities";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { useStagedListFilters } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LIABILITY_TABS, LiabilitiesKpiRow } from "./components/LiabilitiesKpiRow";
import { LiabilitiesTable } from "./components/LiabilitiesTable";
import { LiabilityDetailDrawer } from "./components/LiabilityDetailDrawer";
import { SendAckRequestModal } from "./components/SendAckRequestModal";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";

// C8: the tab list is owned by LiabilitiesKpiRow so a KPI drill and a tab click cannot drift apart.
const SUBNAV = LIABILITY_TABS;

const EMPTY_FILTERS = {
  driverId: "",
};

export function LiabilitiesHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkLiabilityId = searchParams.get("liability_id");
  // LAW OF THE LAND §9 (2026-07-22): driver-profile reverse-link — "View all liabilities" from
  // EarningsTab.tsx scopes this list to one driver (cash-advances ?driver_id= parity).
  // BANK-F5166 — visible EntityPicker (URL-only banner is not reverse chrome).
  // LV-LIABILITIES-HOME-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
  const driverIdFilter = searchParams.get("driver_id");

  function patchListSearchParam(next: { driverId: string }) {
    const params = new URLSearchParams(searchParams);
    if (next.driverId) params.set("driver_id", next.driverId);
    else params.delete("driver_id");
    setSearchParams(params, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFilter?.trim() ?? "",
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
    setApplied((prev) => ({ ...prev, driverId: driverIdFilter?.trim() ?? "" }));
  }, [driverIdFilter]);

  const setDriverFilter = (driverId: string) => {
    staged.setDraft((d) => ({ ...d, driverId }));
  };
  const effectiveDriverId = applied.driverId.trim() || undefined;
  const [tab, setTab] = useState<(typeof SUBNAV)[number]>("All Active");
  const [selectedLiabilityId, setSelectedLiabilityId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [ackModalOpen, setAckModalOpen] = useState(false);

  // LAW: EntityLink kind=liability → /liabilities?liability_id= opens the detail drawer (settlement parity).
  useEffect(() => {
    if (!deepLinkLiabilityId) return;
    setSelectedLiabilityId(deepLinkLiabilityId);
    setDetailOpen(true);
  }, [deepLinkLiabilityId]);

  const kpisQuery = useQuery({
    queryKey: ["liabilities", "kpis", companyId],
    queryFn: () => getLiabilitiesKpis(companyId),
    enabled: Boolean(companyId),
  });
  const activeQuery = useQuery({
    queryKey: ["liabilities", "active", companyId, effectiveDriverId ?? ""],
    queryFn: () =>
      effectiveDriverId ? getLiabilitiesByDriver(effectiveDriverId, companyId) : getActiveLiabilities(companyId),
    enabled: Boolean(companyId),
  });
  const detailQuery = useQuery({
    queryKey: ["liabilities", "detail", companyId, selectedLiabilityId ?? ""],
    queryFn: () => getLiabilityDetail(selectedLiabilityId!, companyId),
    enabled: Boolean(companyId && selectedLiabilityId),
  });

  const rows = useMemo(() => {
    const all = activeQuery.data?.liabilities ?? [];
    if (tab === "Pending Acknowledgments") return all.filter((row) => String(row.display_status) === "pending_ack");
    if (tab === "Paid Off") return all.filter((row) => String(row.display_status) === "paid_off");
    return all;
  }, [activeQuery.data?.liabilities, tab]);

  return (
    <div className="space-y-3">
      <PageHeader title="Liabilities" subtitle="Driver debt with acknowledgment + forfeiture status" />

      <div className="relative flex flex-wrap items-end gap-3" data-testid="liabilities-filters">
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
            dataTestId="liabilities-filter-driver"
          />
        </label>
        <Button type="button" size="sm" data-testid="liabilities-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="liabilities-filter-cancel"
          onClick={staged.cancel}
          disabled={!staged.dirty}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="liabilities-filter-reset"
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
        items={SUBNAV.map((item) => ({ label: item, to: `#${item}` }))}
        activeId={tab}
        onTabChange={(id) => setTab(id as typeof tab)}
        itemIds={[...SUBNAV]}
      />

      {kpisQuery.isError || activeQuery.isError ? (
        <ListErrorBanner
          message="Liabilities data could not be loaded."
          onRetry={() => { void kpisQuery.refetch(); void activeQuery.refetch(); }}
        />
      ) : null}

      <LiabilitiesKpiRow kpis={kpisQuery.data} onSelectTab={setTab} />
      <LiabilitiesTable
        rows={rows}
        onOpenDetail={(row) => {
          setSelectedLiabilityId(String(row.id));
          setDetailOpen(true);
        }}
        onSendAck={(row) => {
          setSelectedLiabilityId(String(row.id));
          setAckModalOpen(true);
        }}
      />

      {detailOpen && detailQuery.isError ? (
        <div className="rounded-sm border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Failed to load liability detail. <button type="button" className="font-semibold underline" onClick={() => void detailQuery.refetch()}>Retry</button>
        </div>
      ) : null}

      <LiabilityDetailDrawer
        open={detailOpen}
        operatingCompanyId={companyId}
        liability={detailQuery.data ?? null}
        onClose={() => setDetailOpen(false)}
        onUpdated={() => {
          void queryClient.invalidateQueries({ queryKey: ["liabilities"] });
        }}
      />

      <SendAckRequestModal
        open={ackModalOpen}
        operatingCompanyId={companyId}
        liabilityId={selectedLiabilityId}
        onClose={() => setAckModalOpen(false)}
        onSent={() => {
          void queryClient.invalidateQueries({ queryKey: ["liabilities"] });
        }}
      />
    </div>
  );
}
