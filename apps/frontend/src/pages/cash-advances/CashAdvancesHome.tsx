import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCashAdvanceDetail, getCashAdvancesKpis, listCashAdvances } from "../../api/cashAdvances";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AdvanceDetailDrawer } from "./components/AdvanceDetailDrawer";
import { CashAdvancesKpiRow } from "./components/CashAdvancesKpiRow";
import { CashAdvancesTable } from "./components/CashAdvancesTable";
import { CreateAdvanceModal } from "./components/CreateAdvanceModal";
import { MarkDisbursedModal } from "./components/MarkDisbursedModal";

const SUBNAV = [
  ["All Advances", "all"],
  ["Pending Approval", "pending_approval"],
  ["Outstanding", "outstanding"],
  ["Paid Off", "paid_off"],
] as const;

export function CashAdvancesHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [tab, setTab] = useState<(typeof SUBNAV)[number][1]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [markDisbursedOpen, setMarkDisbursedOpen] = useState(false);

  const kpisQuery = useQuery({
    queryKey: ["cash-advances", "kpis", companyId],
    queryFn: () => getCashAdvancesKpis(companyId),
    enabled: Boolean(companyId),
  });

  const listQuery = useQuery({
    queryKey: ["cash-advances", "list", companyId, tab],
    queryFn: () => listCashAdvances(companyId, { view: tab }),
    enabled: Boolean(companyId),
  });

  const detailQuery = useQuery({
    queryKey: ["cash-advances", "detail", companyId, selectedId ?? ""],
    queryFn: () => getCashAdvanceDetail(selectedId!, companyId),
    enabled: Boolean(companyId && selectedId),
  });

  const rows = useMemo(() => listQuery.data?.advances ?? [], [listQuery.data?.advances]);

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

      <div className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
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

      <CashAdvancesKpiRow kpis={kpisQuery.data} />

      <CashAdvancesTable
        rows={rows}
        onOpenDetail={(row) => {
          setSelectedId(String(row.id));
          setDetailOpen(true);
        }}
        onMarkDisbursed={(row) => {
          setSelectedId(String(row.id));
          setMarkDisbursedOpen(true);
        }}
      />

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
