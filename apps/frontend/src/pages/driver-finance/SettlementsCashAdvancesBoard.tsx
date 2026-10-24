/**
 * ROUND 443.282 — Settlements-CashAdvances board REPLACES the page body.
 * Does NOT mount CashAdvancesHome filters/subnav/ParityTable under the V3 board
 * (Settlements-CashAdvances.dc.html — KPI row + 1fr|2fr Requests|Advances).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCashAdvanceDetail, getCashAdvancesKpis, listCashAdvances } from "../../api/cashAdvances";
import { cashAdvanceRequestsOfficeApi } from "../../api/cashAdvanceRequests";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AdvanceDetailDrawer } from "../cash-advances/components/AdvanceDetailDrawer";
import { CashAdvancesKpiRow } from "../cash-advances/components/CashAdvancesKpiRow";
import { MarkDisbursedModal } from "../cash-advances/components/MarkDisbursedModal";

const BASE_PATH = "/driver-finance/cash-advances";

export function SettlementsCashAdvancesBoard() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [searchParams] = useSearchParams();
  const deepLinkAdvanceId = searchParams.get("advance_id");

  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const requestsQuery = useQuery({
    queryKey: ["cash-advance-requests", "pending-board", companyId],
    queryFn: () => cashAdvanceRequestsOfficeApi.listPending(companyId),
    enabled: Boolean(companyId),
  });

  const listQuery = useQuery({
    queryKey: ["cash-advances", "list", companyId, "all", "settlements-board"],
    queryFn: () => listCashAdvances(companyId, { view: "all" }),
    enabled: Boolean(companyId),
  });

  const detailQuery = useQuery({
    queryKey: ["cash-advances", "detail", companyId, selectedId ?? ""],
    queryFn: () => getCashAdvanceDetail(selectedId!, companyId),
    enabled: Boolean(companyId && selectedId),
  });

  const rows = useMemo(() => listQuery.data?.advances ?? [], [listQuery.data?.advances]);

  return (
    <div
      className="space-y-3"
      data-testid="settlements-cash-advances-board"
      data-settlements-cash-advances-rebuild="1"
    >
      <PageHeader
        title="Driver Settlements"
        subtitle="List + detail settlement workflow"
        breadcrumb={["Driver Finance", "Cash Advances"]}
        actions={
          <Button
            size="sm"
            data-testid="settlements-cash-advances-creator"
            onClick={() => navigate("/driver-finance/settlements?creator=1")}
          >
            + Settlement Creator
          </Button>
        }
      />

      {kpisQuery.isError ? (
        <ListErrorState
          title="Couldn't load cash advance totals"
          status={0}
          message={(kpisQuery.error as Error)?.message}
          onRetry={() => void kpisQuery.refetch()}
        />
      ) : (
        <CashAdvancesKpiRow
          kpis={kpisQuery.data}
          basePath={BASE_PATH}
          requestRows={requestsQuery.data?.requests ?? []}
          requestsLoading={requestsQuery.isLoading}
          requestsFailed={requestsQuery.isError}
          advanceRows={rows}
          advancesLoading={listQuery.isLoading}
          advancesFailed={listQuery.isError}
          onOpenAdvance={(row) => {
            setSelectedId(String(row.id));
            setDetailOpen(true);
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
