import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { getActiveLiabilities, getLiabilitiesByDriver, getLiabilitiesKpis, getLiabilityDetail } from "../../api/liabilities";
import { PageHeader } from "../../components/layout/PageHeader";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LIABILITY_TABS, LiabilitiesKpiRow } from "./components/LiabilitiesKpiRow";
import { LiabilitiesTable } from "./components/LiabilitiesTable";
import { LiabilityDetailDrawer } from "./components/LiabilityDetailDrawer";
import { SendAckRequestModal } from "./components/SendAckRequestModal";

// C8: the tab list is owned by LiabilitiesKpiRow so a KPI drill and a tab click cannot drift apart.
const SUBNAV = LIABILITY_TABS;

export function LiabilitiesHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkLiabilityId = searchParams.get("liability_id");
  // LAW OF THE LAND §9 (2026-07-22): driver-profile reverse-link — "View all liabilities" from
  // EarningsTab.tsx scopes this list to one driver (cash-advances ?driver_id= parity).
  // BANK-F5166 — visible EntityPicker (URL-only banner is not reverse chrome).
  const driverIdFilter = searchParams.get("driver_id");
  const [driverPickerId, setDriverPickerId] = useState("");
  useEffect(() => {
    if (driverIdFilter) setDriverPickerId(driverIdFilter);
  }, [driverIdFilter]);
  const setDriverFilter = (driverId: string) => {
    setDriverPickerId(driverId);
    const params = new URLSearchParams(searchParams);
    if (driverId) params.set("driver_id", driverId);
    else params.delete("driver_id");
    setSearchParams(params, { replace: true });
  };
  const effectiveDriverId = driverPickerId.trim() || driverIdFilter || undefined;
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

      <div className="flex flex-wrap items-end gap-3" data-testid="liabilities-filters">
        <label className="text-[11px] text-slate-600">
          Driver
          <EntityPicker
            kind="driver"
            operatingCompanyId={companyId}
            value={driverPickerId || null}
            onChange={(next) => setDriverFilter(next ?? "")}
            allowCreate={false}
            placeholder="All drivers"
            className="mt-1"
            dataTestId="liabilities-filter-driver"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-sm bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {SUBNAV.map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? "border-b border-white pb-0.5 font-semibold" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

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
