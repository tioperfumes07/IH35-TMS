/**
 * ReserveTracker — FARO Escrow / Reserve Tracker.
 * Spec: FACTORING-PACKET-AUTO-ASSEMBLY.md §Factoring Reserve Tracker
 *
 * Shows per FARO account:
 *   - Estimated reserve release schedule (7/14/30/60-day forecast)
 *   - Reserve movement history for the selected factor
 *   - Per-factor reserve balances
 *   - Chargeback + fee history (with monthly summaries)
 *
 * NEW-19 (owner 2026-09-07): this page used to ALSO render its own 6-tile summary KPI band
 * (Submitted/Advances/Reserve Held/Fees Paid/Outstanding Liability/Active Factor) using
 * KpiStatCard. ReserveTracker is only ever mounted inside FactoringHome.tsx (confirmed —
 * no other importer), which already renders an overlapping 6-tile band one screen higher
 * (Active factor/Reserve balance/Outstanding Liability Balance/Advanced MTD/Recourse
 * days/Chargebacks & fees, via DrillKpiCard) for the SAME company/summary data — same
 * queryKey ["factoring","summary",companyId], so it was even the same network fetch,
 * just rendered twice in two different card styles. That duplication is exactly what read
 * as "KPI boxes ... out of proportion" — removed here; FactoringHome's band is now the only
 * summary band on this tab. All data from existing reserve/factoring APIs — no new financial code.
 */
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getFactoringChargebacksFees,
  getReserveBalances,
  getReserveBalanceHistory,
  getReserveReleaseForecast,
  listFactors,
  type FactoringChargebackFeeRow,
  type FactoringReserveBalanceHistoryEntry,
  type FactoringReserveReleaseForecastPoint,
} from "../../api/factoring";
import { Combobox } from "../../components/Combobox";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { ReserveDashboardAddFactorModal } from "./ReserveDashboardAddFactorModal";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { useCompanyContext } from "../../contexts/CompanyContext";

// ─── helpers ──────────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtM = (cents: number) => money.format((Number(cents) || 0) / 100);
const fmtD = (v: string | null | undefined) => formatDateUS(v);
const fmtDt = (v: string | null | undefined) => formatDateUS(v);

// ─── ParityTable columns (display-only; order/format preserved 1:1) ──────────

const FORECAST_COLUMNS: Array<ParityColumn<FactoringReserveReleaseForecastPoint>> = [
  { key: "release_date", label: "Release Date", sortable: true, render: (row) => fmtD(row.release_date) },
  {
    key: "projected_release_cents",
    label: "Projected Amount",
    sortable: true,
    className: "text-right",
    cellClass: "text-right font-medium text-slate-700",
    render: (row) => fmtM(row.projected_release_cents),
  },
  {
    key: "source_movement_count",
    label: "Source Movements",
    sortable: true,
    className: "text-right",
  },
];

const HISTORY_COLUMNS: Array<ParityColumn<FactoringReserveBalanceHistoryEntry>> = [
  { key: "created_at", label: "Date", sortable: true, render: (row) => fmtDt(row.created_at) },
  { key: "reason", label: "Reason", sortable: true },
  {
    key: "signed_amount_cents",
    label: "Movement",
    sortable: true,
    className: "text-right",
    render: (row) => (
      <span className={`font-medium ${row.signed_amount_cents >= 0 ? "text-slate-700" : "text-red-700"}`}>
        {fmtM(row.signed_amount_cents)}
      </span>
    ),
  },
  {
    key: "running_balance_cents",
    label: "Running Balance",
    sortable: true,
    className: "text-right",
    render: (row) => fmtM(row.running_balance_cents),
  },
];

const CHARGEBACK_COLUMNS: Array<ParityColumn<FactoringChargebackFeeRow>> = [
  { key: "created_at", label: "Date", sortable: true, render: (row) => fmtD(row.created_at) },
  {
    key: "invoice_id",
    label: "Invoice",
    render: (row) => row.invoice_id ? <EntityLink kind="invoice" id={row.invoice_id} label={entityLabel(row.invoice_display_id, row.invoice_id, "Invoice")} /> : "—",
  },
  {
    key: "customer_id",
    label: "Customer",
    render: (row) => row.customer_id ? <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} /> : "—",
  },
  {
    key: "factoring_advance_id",
    label: "Advance",
    render: (row) => (
      <EntityLink
        kind="factoring_advance"
        id={row.factoring_advance_id}
        label={entityLabel(row.statement_reference, row.factoring_advance_id, "Advance")}
      />
    ),
  },
  {
    key: "chargeback_amount",
    label: "Chargeback",
    sortable: true,
    className: "text-right",
    cellClass: "text-right text-red-700",
    render: (row) => (row.chargeback_amount > 0 ? fmtM(row.chargeback_amount) : "—"),
  },
  {
    key: "factor_fee_amount",
    label: "Fee",
    sortable: true,
    className: "text-right",
    render: (row) => (row.factor_fee_amount > 0 ? fmtM(row.factor_fee_amount) : "—"),
  },
];

// ─── component ────────────────────────────────────────────────────────────────

export function ReserveTracker() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [selectedFactorId, setSelectedFactorId] = useState("");
  const [showAddFactorModal, setShowAddFactorModal] = useState(false);
  const [histPage, setHistPage] = useState(0);
  const PAGE_SIZE = 20;

  // factors
  const factorsQ = useQuery({
    queryKey: ["factoring", "factors", "all", companyId],
    queryFn: () => listFactors(companyId, { active_only: false }).then((r) => r.factors),
    enabled: Boolean(companyId),
  });
  const factorFilterOptions = useMemo(
    () => (factorsQ.data ?? []).map((f) => ({ value: f.id, label: f.name })),
    [factorsQ.data],
  );
  // reserve balances per factor
  const balancesQ = useQuery({
    queryKey: ["factoring", "reserves", "balances", companyId],
    queryFn: () => getReserveBalances(companyId).then((r) => r.balances),
    enabled: Boolean(companyId),
  });

  // chargebacks & fees (YTD)
  const chargebacksQ = useQuery({
    queryKey: ["factoring", "chargebacks-fees", companyId],
    queryFn: () => getFactoringChargebacksFees(companyId),
    enabled: Boolean(companyId),
  });

  // reserve history for selected factor
  const historyQ = useQuery({
    queryKey: ["factoring", "reserves", "history", companyId, selectedFactorId, histPage, PAGE_SIZE],
    queryFn: () =>
      getReserveBalanceHistory(selectedFactorId, companyId, {
        limit: PAGE_SIZE,
        offset: histPage * PAGE_SIZE,
      }),
    enabled: Boolean(companyId && selectedFactorId),
  });

  // forecasts
  const fc7 = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 7],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 7),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const fc14 = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 14],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 14),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const fc30 = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 30],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 30),
    enabled: Boolean(companyId && selectedFactorId),
  });
  const fc60 = useQuery({
    queryKey: ["factoring", "reserves", "forecast", companyId, selectedFactorId, 60],
    queryFn: () => getReserveReleaseForecast(selectedFactorId, companyId, 60),
    enabled: Boolean(companyId && selectedFactorId),
  });

  // default to first factor with a balance
  useEffect(() => {
    if (selectedFactorId) return;
    const first =
      (balancesQ.data ?? [])[0]?.factor_id ?? (factorsQ.data ?? [])[0]?.id ?? "";
    if (first) setSelectedFactorId(first);
  }, [balancesQ.data, factorsQ.data, selectedFactorId]);

  useEffect(() => setHistPage(0), [selectedFactorId]);

  // ── computed KPIs ────────────────────────────────────────────────────────────

  const factorNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of factorsQ.data ?? []) m.set(f.id, f.name);
    return m;
  }, [factorsQ.data]);

  const totalHistPages = Math.max(1, Math.ceil((historyQ.data?.total ?? 0) / PAGE_SIZE));

  const forecastByWindow = {
    7: fc7.data?.total_projected_release_cents ?? 0,
    14: fc14.data?.total_projected_release_cents ?? 0,
    30: fc30.data?.total_projected_release_cents ?? 0,
    60: fc60.data?.total_projected_release_cents ?? 0,
  } as Record<7 | 14 | 30 | 60, number>;

  if (!companyId) {
    return (
      <div className="rounded-sm border bg-white p-4 text-xs text-gray-500">
        Select an operating company to view the reserve tracker.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="faro-reserve-tracker">
      {/* NEW-19: the duplicate 6-tile summary KPI band that used to render here (Submitted/
          Advances/Reserve Held/Fees Paid/Outstanding Liability/Active Factor) was removed —
          FactoringHome.tsx, the only mount point for this component, already renders an
          overlapping band one screen higher from the same summary query. See the file header
          comment for the full explanation. */}

      {/* Release forecast */}
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-gray-800">Estimated Reserve Release Schedule</div>
          <div className="min-w-[220px]" data-testid="reserve-tracker-factor-picker">
            {/* LST-F159: bare <select> had no + Add new — operators left Reserve Tracker to create a factor. */}
            <Combobox
              options={factorFilterOptions}
              value={selectedFactorId || null}
              onChange={(next) => setSelectedFactorId(next ?? "")}
              placeholder="— all factors —"
              loading={factorsQ.isLoading}
              allowClear
              allowAddNew={{
                label: "+ Add new factor",
                onAdd: () => setShowAddFactorModal(true),
              }}
            />
          </div>
        </div>

        {/* Forecast windows */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([7, 14, 30, 60] as const).map((days) => (
            <div key={days} className="rounded-sm border border-gray-200 bg-gray-50 p-2 text-center">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Next {days}d</div>
              <div className="mt-1 text-xs font-bold text-gray-900">
                {fmtM(forecastByWindow[days])}
              </div>
            </div>
          ))}
        </div>

        {/* Forecast schedule table */}
        {fc60.isError ? (
          <ListErrorState
            title="Couldn't load release forecast"
            status={0}
            message={(fc60.error as Error)?.message}
            onRetry={() => void fc60.refetch()}
          />
        ) : (
          <ParityTable<FactoringReserveReleaseForecastPoint>
            columns={FORECAST_COLUMNS}
            rows={fc60.data?.schedule ?? []}
            rowKey={(row) => `${row.release_date}-${row.source_movement_count}`}
            storageKey="factoring-reserve-forecast-schedule"
            tableTestId="reserve-forecast-schedule-table"
            emptyText={fc60.isLoading ? "Calculating…" : "No projected releases in the next 60 days."}
          />
        )}
      </div>

      {/* Per-factor reserve balances */}
      {(balancesQ.data ?? []).length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(balancesQ.data ?? []).map((bal) => (
            <div
              key={bal.factor_id}
              className={`cursor-pointer rounded border p-3 text-xs transition-colors ${
                selectedFactorId === bal.factor_id
                  ? "border-slate-300 bg-slate-100"
                  : "border-gray-200 bg-white hover:border-slate-300"
              }`}
              onClick={() => setSelectedFactorId(bal.factor_id)}
            >
              {/* LINK reverse_link: factor_id was dead text — EntityLink kind="factor" resolves to
                  /factoring/factors?factor_id= (FactorAdmin). stopPropagation so the link doesn't
                  also fire this card's own onClick (local selectedFactorId toggle). */}
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <EntityLink
                  kind="factor"
                  id={bal.factor_id}
                  label={entityLabel(factorNameById.get(bal.factor_id), bal.factor_id, "Factor")}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="mt-1 text-page-title font-bold text-gray-900">{fmtM(bal.balance_cents)}</div>
              <div className="mt-1 text-[11px] text-gray-500">
                Last movement: {fmtDt(bal.last_movement_at)}
              </div>
              <div className="text-[11px] text-gray-500">
                Total movements: {bal.movement_count}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Reserve balance history table */}
      {selectedFactorId ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-gray-800">
            Reserve Movement History — {entityLabel(factorNameById.get(selectedFactorId), selectedFactorId, "Factor")}
          </div>
          {historyQ.isError ? (
            <ListErrorState
              title="Couldn't load reserve movement history"
              status={0}
              message={(historyQ.error as Error)?.message}
              onRetry={() => void historyQ.refetch()}
            />
          ) : (
            <>
              <ParityTable<FactoringReserveBalanceHistoryEntry>
                columns={HISTORY_COLUMNS}
                rows={historyQ.data?.movements ?? []}
                rowKey={(row) => row.id}
                loading={historyQ.isLoading}
                storageKey="factoring-reserve-movement-history"
                tableTestId="reserve-movement-history-table"
                emptyText="No movements recorded for this factor."
                initialPageSize={PAGE_SIZE}
                pageSizeOptions={[PAGE_SIZE]}
              />
              {/* Server-side pager (histPage drives the API offset) — handlers unchanged. */}
              <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                <span>
                  Page {Math.min(histPage + 1, totalHistPages)} of {totalHistPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-40"
                    onClick={() => setHistPage((p) => Math.max(0, p - 1))}
                    disabled={histPage <= 0}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-40"
                    onClick={() => setHistPage((p) => Math.min(totalHistPages - 1, p + 1))}
                    disabled={histPage >= totalHistPages - 1}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Chargebacks pending detail */}
      {chargebacksQ.isError ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-gray-800">Chargeback + Fee History</div>
          <ListErrorState
            title="Couldn't load chargeback + fee history"
            status={0}
            message={userFacingApiError(chargebacksQ.error, "Request failed")}
            onRetry={() => void chargebacksQ.refetch()}
          />
        </div>
      ) : (chargebacksQ.data?.history ?? []).length > 0 ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-gray-800">Chargeback + Fee History</div>
          <ParityTable<FactoringChargebackFeeRow>
            columns={CHARGEBACK_COLUMNS}
            rows={(chargebacksQ.data?.history ?? []).slice(0, 50)}
            rowKey={(row) => row.factoring_advance_id + row.created_at}
            storageKey="factoring-chargeback-fee-history"
            tableTestId="chargeback-fee-history-table"
            emptyText="No chargebacks or fees recorded."
          />
        </div>
      ) : null}

      <ReserveDashboardAddFactorModal
        companyId={companyId}
        open={showAddFactorModal}
        onClose={() => setShowAddFactorModal(false)}
        onCreated={(factorId) => setSelectedFactorId(factorId)}
      />
    </div>
  );
}
