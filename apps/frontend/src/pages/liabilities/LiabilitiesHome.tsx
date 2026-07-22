import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { getActiveLiabilities, getLiabilitiesByDriver, getLiabilitiesKpis, getLiabilityDetail } from "../../api/liabilities";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LiabilitiesKpiRow } from "./components/LiabilitiesKpiRow";
import { LiabilitiesTable } from "./components/LiabilitiesTable";
import { LiabilityDetailDrawer } from "./components/LiabilityDetailDrawer";
import { SendAckRequestModal } from "./components/SendAckRequestModal";

const SUBNAV = ["All Active", "By Driver", "By Type", "Pending Acknowledgments", "Paid Off"] as const;

export function LiabilitiesHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkLiabilityId = searchParams.get("liability_id");
  // LAW OF THE LAND §9 (2026-07-22): driver-profile reverse-link — "View all liabilities" from
  // EarningsTab.tsx scopes this list to one driver (cash-advances ?driver_id= parity).
  const driverIdFilter = searchParams.get("driver_id");
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
    queryKey: ["liabilities", "active", companyId, driverIdFilter ?? ""],
    queryFn: () =>
      driverIdFilter ? getLiabilitiesByDriver(driverIdFilter, companyId) : getActiveLiabilities(companyId),
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

      <LiabilitiesKpiRow kpis={kpisQuery.data} />
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
