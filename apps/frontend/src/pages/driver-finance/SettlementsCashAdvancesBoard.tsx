/**
 * ROUND 443.326 — Settlements-CashAdvances full V3 board (not chromeOnly shell).
 * kpiStrip + MoneyListToolbar + ParityTable in this surface file (Escrow grammar).
 * Engines unchanged: getCashAdvancesKpis / listCashAdvances / cashAdvanceRequestsOfficeApi.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCashAdvanceDetail, getCashAdvancesKpis, listCashAdvances } from "../../api/cashAdvances";
import { cashAdvanceRequestsOfficeApi } from "../../api/cashAdvanceRequests";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";
import { MoneyCell } from "../../components/shared/MoneyCell";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { BoardSection } from "../../components/v3/BoardSection";
import { formatDisplayName } from "../../components/v3/formatDisplayName";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { V3 } from "../../design/v3-tokens";
import { entityLabel } from "../../lib/entity-label";
import { formatUsdTable } from "../../lib/money";
import { AdvanceDetailDrawer } from "../cash-advances/components/AdvanceDetailDrawer";
import { useCashAdvancesParityColumns } from "../cash-advances/components/CashAdvancesTable";
import { MarkDisbursedModal } from "../cash-advances/components/MarkDisbursedModal";
import { S443326 } from "./settlementsV3BoardStrings";

const BASE_PATH = "/driver-finance/cash-advances";
const REQUESTS_PATH = "/driver-finance/cash-advance-requests";
const PREVIEW = 8;

function amount(kpis: Record<string, unknown> | undefined, key: string): number | null {
  const raw = kpis?.[key];
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const money = (n: number | null) => (n === null ? null : formatUsdTable(n));
const display = (v: string | number | null) => (v === null || v === undefined ? "—" : String(v));

function formatAsked(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function policyLabel(row: Record<string, unknown>): string {
  const c = S443326.cashAdvances;
  if (Boolean(row.owner_approval_required) && Boolean(row.owner_approval_token_expires_at)) {
    return c.policyPendingOwner;
  }
  if (Boolean(row.is_above_policy)) return c.policyAbove;
  return c.policyWithin;
}

type RequestRow = Record<string, unknown>;

/** Board body only — chrome is SettlementsModuleShell / SettlementsSubNavWrapper (443.326). */
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
  const [search, setSearch] = useState("");

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
  const requestRows = useMemo(
    () => (requestsQuery.data?.requests ?? []) as RequestRow[],
    [requestsQuery.data?.requests],
  );

  const filteredAdvances = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.display_id,
        row.driver_full_name,
        row.load_display_id,
        row.disbursement_method,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const previewRequests = requestRows.slice(0, PREVIEW);

  const onFile = amount(kpisQuery.data as Record<string, unknown> | undefined, "advances_on_file");
  const awaiting = amount(kpisQuery.data as Record<string, unknown> | undefined, "pending_approval");
  const outstanding = money(
    amount(kpisQuery.data as Record<string, unknown> | undefined, "total_outstanding"),
  );

  const openAdvance = (row: Record<string, unknown>) => {
    setSelectedId(String(row.id));
    setDetailOpen(true);
  };

  const advanceColumns = useCashAdvancesParityColumns(openAdvance, (row) => {
    setSelectedId(String(row.id));
    setMarkDisbursedOpen(true);
  });

  const requestColumns = useMemo<ParityColumn<RequestRow>[]>(
    () => {
      const c = S443326.cashAdvances;
      return [
      {
        key: "driver",
        label: c.colDriver,
        sortable: true,
        sortValue: (row) => formatDisplayName(row.driver_name ? String(row.driver_name) : null),
        render: (row) => {
          const name = formatDisplayName(row.driver_name ? String(row.driver_name) : null);
          return (
            <EntityLink
              kind="driver"
              id={row.driver_id ? String(row.driver_id) : null}
              label={entityLabel(name || null, row.driver_id ? String(row.driver_id) : null, c.entityDriver)}
            />
          );
        },
      },
      {
        key: "asked",
        label: c.colAsked,
        sortable: true,
        sortValue: (row) => String(row.submitted_at ?? ""),
        render: (row) => formatAsked(row.submitted_at),
      },
      {
        key: "amount",
        label: c.colAmount,
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (row) => Number(row.requested_amount_cents ?? 0),
        render: (row) => {
          const id = String(row.id ?? "");
          const cents = Number(row.requested_amount_cents ?? 0);
          return (
            <MoneyCell
              cents={Number.isFinite(cents) ? cents : null}
              drill={{ entity: { kind: "cash_advance_request", id } }}
            />
          );
        },
      },
      {
        key: "policy",
        label: c.colPolicy,
        sortable: true,
        sortValue: (row) => policyLabel(row),
        render: (row) => policyLabel(row),
      },
      {
        key: "action",
        label: c.colAction,
        sortable: false,
        render: () => (
          <button
            type="button"
            onClick={() => navigate(REQUESTS_PATH)}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: V3.link,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontFamily: V3.font,
              textDecoration: "underline",
            }}
          >
            {c.review}
          </button>
        ),
      },
    ];
    },
    [navigate],
  );

  return (
    <div
      className="space-y-3"
      data-testid="settlements-cash-advances-board"
      data-settlements-cash-advances-rebuild="1"
    >
      {kpisQuery.isError ? (
        <ListErrorState
          title={S443326.cashAdvances.errKpiTitle}
          status={0}
          message={(kpisQuery.error as Error)?.message}
          onRetry={() => void kpisQuery.refetch()}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
            gap: 8,
            fontFamily: V3.font,
          }}
          data-testid="cash-advances-kpi-strip"
          data-cash-advances-v3-kpis="1"
        >
          <V3KpiTile
            label={S443326.cashAdvances.kpiOnFile}
            value={display(onFile === null ? null : Math.round(onFile))}
            testId="cash-advances-kpi-on-file"
            onClick={() => navigate(BASE_PATH)}
          />
          <V3KpiTile
            label={S443326.cashAdvances.kpiAwaiting}
            value={display(awaiting === null ? null : Math.round(awaiting))}
            testId="cash-advances-kpi-awaiting"
            onClick={() => navigate(`${BASE_PATH}?tab=pending_approval`)}
          />
          <V3KpiTile
            label={S443326.cashAdvances.kpiOutstanding}
            value={display(outstanding)}
            testId="cash-advances-kpi-outstanding"
            onClick={() => navigate(`${BASE_PATH}?tab=outstanding`)}
          />
          <V3KpiTile
            label={S443326.cashAdvances.kpiRecovered}
            value="—"
            sub={S443326.cashAdvances.kpiRecoveredSub}
            testId="cash-advances-kpi-recovered"
            onClick={() => navigate(`${BASE_PATH}?tab=paid_off`)}
          />
        </div>
      )}

      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={S443326.cashAdvances.searchPlaceholder}
        searchTestId="settlements-cash-advances-search-input"
        onClearAll={() => setSearch("")}
        activeFilterCount={0}
        testIdPrefix="settlements-cash-advances"
      >
        {null}
      </MoneyListToolbar>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, alignItems: "start" }}
        data-testid="settlements-cash-advances-board-body"
        data-settlements-cash-advances-board-1fr-2fr="1"
      >
        <BoardSection
          title={S443326.cashAdvances.sectionRequests}
          testId="settlements-cash-advances-requests-panel"
          onViewAll={() => navigate(REQUESTS_PATH)}
        >
          <div data-testid="settlements-cash-advances-requests-body">
            {requestsQuery.isError ? (
              <p className="px-3.5 py-2 text-xs" style={{ color: V3.muted, fontFamily: V3.font }}>
                {S443326.cashAdvances.requestsLoadFailed}
              </p>
            ) : (
              <ParityTable
                title={S443326.cashAdvances.sectionRequests}
                storageKey="settlements-cash-advances-requests-v3"
                columns={requestColumns}
                rows={previewRequests}
                rowKey={(row) => String(row.id ?? row.display_id ?? "")}
                rowTestId={(row) => `settlements-cash-advances-request-${String(row.id ?? "")}`}
                loading={requestsQuery.isLoading}
                emptyText={S443326.cashAdvances.emptyRequests}
                tableTestId="settlements-cash-advances-requests-table"
                hidePager
                pageSize={Math.max(1, previewRequests.length || 1)}
              />
            )}
          </div>
        </BoardSection>

        <BoardSection
          title={S443326.cashAdvances.sectionAdvances}
          testId="settlements-cash-advances-advances-panel"
          onViewAll={() => navigate(BASE_PATH)}
          footer={S443326.cashAdvances.advancesFooter}
        >
          <div data-testid="settlements-cash-advances-advances-body">
            {listQuery.isError ? (
              <ListErrorState
                title={S443326.cashAdvances.errAdvancesTitle}
                status={0}
                message={(listQuery.error as Error)?.message}
                onRetry={() => void listQuery.refetch()}
              />
            ) : (
              <ParityTable
                title={S443326.cashAdvances.sectionAdvances}
                storageKey="settlements-cash-advances-roster-v3"
                columns={advanceColumns}
                rows={filteredAdvances}
                rowKey={(row) => String(row.id)}
                rowTestId={(row) => `settlements-cash-advances-advance-${String(row.id)}`}
                loading={listQuery.isLoading}
                emptyText={S443326.cashAdvances.emptyAdvances}
                tableTestId="settlements-cash-advances-advances-table"
                onRowClick={(row) => openAdvance(row)}
              />
            )}
          </div>
        </BoardSection>
      </div>

      {detailOpen && detailQuery.isError ? (
        <ListErrorState
          title={S443326.cashAdvances.errDetailTitle}
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
