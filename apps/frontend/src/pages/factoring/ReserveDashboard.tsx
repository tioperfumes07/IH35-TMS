import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getReserveBalanceHistory,
  getReserveBalances,
  getReserveReleaseForecast,
  listFactors,
  type FactoringReserveBalanceHistoryEntry,
  type FactoringReserveReleaseForecastPoint,
} from "../../api/factoring";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Combobox } from "../../components/Combobox";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useListState } from "../../components/list-state";
import { formatDateUS } from "../../lib/formatDate";
import { ReserveDashboardAddFactorModal } from "./ReserveDashboardAddFactorModal";

const LOOKAHEAD_WINDOWS = [7, 14, 30, 60] as const;
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function asMoney(cents: number) {
  return money.format((Number(cents) || 0) / 100);
}

function asDateTime(value: string | null | undefined) {
  return formatDateUS(value);
}

function asDate(value: string | null | undefined) {
  return formatDateUS(value);
}

// Display-only ParityTable columns — 1:1 with the former hand-rolled tables
// (same column order, same formatting, same sign coloring). No amounts math changed.
const HISTORY_COLUMNS: Array<ParityColumn<FactoringReserveBalanceHistoryEntry>> = [
  { key: "created_at", label: "Date", sortable: true, render: (row) => asDateTime(row.created_at) },
  {
    key: "signed_amount_cents",
    label: "Signed Movement",
    sortable: true,
    className: "text-right",
    render: (row) => (
      <span className={row.signed_amount_cents >= 0 ? "text-slate-700" : "text-red-700"}>
        {asMoney(row.signed_amount_cents)}
      </span>
    ),
  },
  {
    key: "running_balance_cents",
    label: "Running Balance",
    sortable: true,
    className: "text-right",
    cellClass: "text-right font-medium",
    render: (row) => asMoney(row.running_balance_cents),
  },
];

const FORECAST_COLUMNS: Array<ParityColumn<FactoringReserveReleaseForecastPoint>> = [
  { key: "release_date", label: "Release Date", sortable: true, render: (row) => asDate(row.release_date) },
  {
    key: "projected_release_cents",
    label: "Projected",
    sortable: true,
    className: "text-right",
    render: (row) => asMoney(row.projected_release_cents),
  },
  {
    key: "source_movement_count",
    label: "Movements",
    sortable: true,
    className: "text-right",
    render: (row) => row.source_movement_count,
  },
];

export function ReserveDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [selectedFactorId, setSelectedFactorId] = useState<string>("");
  const [showAddFactorModal, setShowAddFactorModal] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const factorsQuery = useQuery({
    queryKey: ["factoring", "factors", "all", companyId],
    queryFn: () => listFactors(companyId, { active_only: false }).then((res) => res.factors),
    enabled: Boolean(companyId),
  });
  const factorFilterOptions = useMemo(
    () => (factorsQuery.data ?? []).map((factor) => ({ value: factor.id, label: factor.name })),
    [factorsQuery.data],
  );

  const balancesQuery = useQuery({
    queryKey: ["factoring", "reserves", "balances", companyId],
    queryFn: () => getReserveBalances(companyId).then((res) => res.balances),
    enabled: Boolean(companyId),
  });

  const factorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const factor of factorsQuery.data ?? []) map.set(factor.id, entityLabel(factor.name, factor.id, "Factor"));
    return map;
  }, [factorsQuery.data]);

  useEffect(() => {
    if (selectedFactorId) return;
    const firstBalance = balancesQuery.data?.[0]?.factor_id;
    const firstFactor = factorsQuery.data?.[0]?.id;
    const next = firstBalance ?? firstFactor ?? "";
    if (next) setSelectedFactorId(next);
  }, [balancesQuery.data, factorsQuery.data, selectedFactorId]);

  useEffect(() => {
    setPage(0);
  }, [selectedFactorId]);

  const historyQuery = useQuery({
    queryKey: ["factoring", "reserves", "history", companyId, selectedFactorId, page, pageSize],
    queryFn: () =>
      getReserveBalanceHistory(selectedFactorId, companyId, {
        limit: pageSize,
        offset: page * pageSize,
      }),
    enabled: Boolean(companyId && selectedFactorId),
  });

  const forecast7Query = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 7],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 7),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const forecast14Query = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 14],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 14),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const forecast30Query = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 30],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 30),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const forecast60Query = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 60],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 60),
    enabled: Boolean(companyId && selectedFactorId),
  });

  const totalPages = Math.max(1, Math.ceil((historyQuery.data?.total ?? 0) / pageSize));
  const forecastByWindow: Record<number, number> = {
    7: forecast7Query.data?.total_projected_release_cents ?? 0,
    14: forecast14Query.data?.total_projected_release_cents ?? 0,
    30: forecast30Query.data?.total_projected_release_cents ?? 0,
    60: forecast60Query.data?.total_projected_release_cents ?? 0,
  };

  // Empty states render only once their backing query settles (never mid-fetch).
  const balancesListState = useListState(balancesQuery, (balancesQuery.data ?? []).length === 0);
  const historyListState = useListState(historyQuery, (historyQuery.data?.movements ?? []).length === 0);
  const forecastListState = useListState(forecast60Query, (forecast60Query.data?.schedule ?? []).length === 0);

  // Recent-movements columns resolve the factor display name, so they depend on the loaded factor map.
  const movementColumns = useMemo<Array<ParityColumn<FactoringReserveBalanceHistoryEntry>>>(
    () => [
      {
        key: "factor_id",
        label: "Factor",
        sortable: true,
        render: (row) => factorNameById.get(row.factor_id ?? "") ?? "-",
        sortValue: (row) => factorNameById.get(row.factor_id ?? "") ?? "-",
      },
      { key: "created_at", label: "Date", sortable: true, render: (row) => asDateTime(row.created_at) },
      { key: "reason", label: "Reason", sortable: true, render: (row) => row.reason },
      { key: "direction", label: "Direction", sortable: true, className: "text-right", render: (row) => row.direction },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        className: "text-right",
        render: (row) => asMoney(row.amount_cents),
      },
    ],
    [factorNameById],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        backHref="/factoring"
        breadcrumb={["Factoring", "Reserves"]}
        title="Reserve Dashboard"
        subtitle="Reserve balances, release forecasts, and movement history by factor"
      />
      {!companyId ? (
        <div
          className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700"
          data-testid="factoring-reserves-need-company"
        >
          Select an operating company to view reserve balances (display only — no CoA reserve mutations).
        </div>
      ) : (
      <div className="space-y-3 rounded-sm border border-gray-200 bg-white p-4">
      {balancesQuery.isError ? <ListErrorBanner onRetry={() => void balancesQuery.refetch()} /> : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px]" data-testid="reserve-dashboard-factor-picker">
          <div className="text-xs uppercase tracking-wide text-gray-500">Factor Filter</div>
          {/* LST-F158: bare <select> had no + Add new — operators left Reserves to create a factor. */}
          <div className="mt-1">
            <Combobox
              options={factorFilterOptions}
              value={selectedFactorId || null}
              onChange={(next) => setSelectedFactorId(next ?? "")}
              placeholder="Select factor"
              loading={factorsQuery.isLoading}
              allowAddNew={{
                label: "+ Add new factor",
                onAdd: () => setShowAddFactorModal(true),
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3" data-testid="factoring-reserves-kpi">
        {(balancesQuery.data ?? []).map((balance) => (
          <div key={balance.factor_id} className="rounded-sm border border-gray-200 p-3 text-sm">
            {/* LINK reverse_link: factor_id was dead text — EntityLink kind="factor" resolves to
                /factoring/factors?factor_id= (FactorAdmin, which now honors that param). */}
            <div className="text-xs uppercase tracking-wide text-gray-500">
              <EntityLink kind="factor" id={balance.factor_id} label={entityLabel(factorNameById.get(balance.factor_id), balance.factor_id, "Factor")} />
            </div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{asMoney(balance.balance_cents)}</div>
            <div className="mt-1 text-xs text-gray-600">Last movement: {asDateTime(balance.last_movement_at)}</div>
            <div className="text-xs text-gray-600">Total movements: {balance.movement_count}</div>
          </div>
        ))}
        {balancesListState.isEmpty ? (
          <div
            className="rounded-sm border border-dashed border-gray-300 p-3 text-sm text-gray-500"
            data-testid="factoring-reserves-honest-empty"
          >
            No reserve balances found.
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-sm border border-gray-200 p-3">
          <div className="mb-2 text-sm font-medium text-gray-900">Reserve Balance Over Time</div>
          {historyQuery.isError ? (
            <ListErrorState
              title="Couldn't load reserve balance history"
              status={0}
              message={(historyQuery.error as Error | undefined)?.message}
              onRetry={() => void historyQuery.refetch()}
            />
          ) : (
            <ParityTable
              rows={historyQuery.data?.movements ?? []}
              columns={HISTORY_COLUMNS}
              rowKey={(row) => row.id}
              loading={historyListState.isLoading}
              storageKey="factoring-reserve-balance-history"
              tableTestId="factoring-reserve-balance-history-table"
              // ACCT-F-PARITYTABLE-DOUBLE-PAGINATION: `rows` is already one server page (limit=
              // pageSize of `historyQuery.data.total`, offset-driven via the `page` state below).
              // Without pageSize+hidePager, ParityTable's own uncontrolled pager re-derives
              // "total" from rows.length and renders a second, contradictory pager directly above
              // the real "Page {page+1} of {totalPages}" Prev/Next pager rendered right below this
              // table -- same class already fixed 4x this session (REPORTS-F6363,
              // DOCS-F-PARITYTABLE-DOUBLE-PAGINATION, ADMIN-F-PARITYTABLE-DOUBLE-PAGINATION,
              // ACCT-F6433). Per ParityTable's own documented "caller pre-pages" combo: pageSize =
              // server page size + hidePager -- no double slicing.
              pageSize={pageSize}
              hidePager
              // Settled-only empty text (LIST-EMPTY-1): supplied only once the query settles empty.
              emptyText={historyListState.isEmpty ? "No reserve movements found for the selected factor." : undefined}
            />
          )}
          <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
            <span>
              Page {Math.min(page + 1, totalPages)} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page <= 0}
              >
                Prev
              </button>
              <button
                type="button"
                className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-sm border border-gray-200 p-3">
          <div className="mb-2 text-sm font-medium text-gray-900">Forecast Releases (7/14/30/60)</div>
          <div className="grid gap-2 grid-cols-2">
            {LOOKAHEAD_WINDOWS.map((days) => (
              <div key={days} className="rounded-sm border border-gray-200 p-2 text-sm">
                <div className="text-xs uppercase tracking-wide text-gray-500">Next {days} days</div>
                <div className="mt-1 font-semibold text-gray-900">{asMoney(forecastByWindow[days])}</div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            {forecast60Query.isError ? (
              <ListErrorState
                title="Couldn't load reserve release forecast"
                status={0}
                message={(forecast60Query.error as Error | undefined)?.message}
                onRetry={() => void forecast60Query.refetch()}
              />
            ) : (
              <ParityTable
                rows={forecast60Query.data?.schedule ?? []}
                columns={FORECAST_COLUMNS}
                rowKey={(row) => `${row.release_date}-${row.source_movement_count}`}
                loading={forecastListState.isLoading}
                storageKey="factoring-reserve-release-forecast"
                tableTestId="factoring-reserve-release-forecast-table"
                pageSizeOptions={[100, 300]}
                initialPageSize={100}
                emptyText={forecastListState.isEmpty ? "No projected reserve releases in the selected window." : undefined}
              />
            )}
          </div>
        </div>
      </div>

      <div className="rounded-sm border border-gray-200 p-3">
        <div className="mb-2 text-sm font-medium text-gray-900">Recent Movements</div>
        {historyQuery.isError ? (
          <ListErrorState
            title="Couldn't load recent reserve movements"
            status={0}
            message={(historyQuery.error as Error | undefined)?.message}
            onRetry={() => void historyQuery.refetch()}
          />
        ) : (
          <ParityTable
            rows={historyQuery.data?.movements ?? []}
            columns={movementColumns}
            rowKey={(movement) => movement.id}
            loading={historyListState.isLoading}
            storageKey="factoring-reserve-recent-movements"
            tableTestId="factoring-reserve-recent-movements-table"
            pageSizeOptions={[20, 50, 100, 300]}
            initialPageSize={20}
            emptyText={historyListState.isEmpty ? "No recent movements for this factor." : undefined}
          />
        )}
      </div>
      </div>
      )}

      <ReserveDashboardAddFactorModal
        companyId={companyId}
        open={showAddFactorModal}
        onClose={() => setShowAddFactorModal(false)}
        onCreated={(factorId) => setSelectedFactorId(factorId)}
      />
    </div>
  );
}
