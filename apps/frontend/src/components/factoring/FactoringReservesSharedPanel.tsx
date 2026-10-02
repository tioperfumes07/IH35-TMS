/**
 * ROUND 315 / Lead B7 — Reserves / deductions (CCG) render identically in Factoring and Banking.
 * One panel, one ledger source. ROUND 326.2 item 4: escrow / cash / total reserve and fees are the factoring
 * KPI engine's GL figures (GET /api/v1/factoring/kpis — 1230 / 1235 balances, 6400 accrued), the SAME numbers
 * Banking shows; nothing here re-sums purchases or reads views.factoring_summary.reserve_balance. Plus the
 * reserve-balance history and banking.equipment_loans. Categorize / transfer / apply deep-link to the same
 * Banking actions so numbers close from either module. Never a second engine.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getFactoringSummary,
  getReserveBalanceHistory,
  type FactoringReserveBalanceHistoryEntry,
} from "../../api/factoring";
import { getFactoringKpis } from "../../api/factoring-kpis";
import { listEquipmentLoans, type EquipmentLoanRow } from "../../api/data-infra";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { FACTORING_TAB_PATH } from "../../router/route-manifest";

function cents(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
}

type Props = {
  companyId: string;
  /** Where this panel is mounted — mirrored for testids, same body. */
  host: "factoring" | "banking";
};

export function FactoringReservesSharedPanel({ companyId, host }: Props) {
  const rootTestId = host === "banking" ? "banking-factoring-reserves-shared" : "factoring-reserves-shared";

  const summaryQuery = useQuery({
    queryKey: ["factoring", "summary", companyId, "reserves-shared"],
    queryFn: () => getFactoringSummary(companyId),
    enabled: Boolean(companyId),
  });

  // Same query key as FactoringKpiPanel / BankingHome — one fetch, one engine.
  const kpiQuery = useQuery({
    queryKey: ["factoring", "kpis", companyId, null, null],
    queryFn: () => getFactoringKpis(companyId),
    enabled: Boolean(companyId),
  });

  const activeFactorId = summaryQuery.data?.active_factor_id ?? null;

  const reserveHistoryQuery = useQuery({
    queryKey: ["factoring", "reserves", "history", companyId, activeFactorId, "reserves-shared"],
    queryFn: () => getReserveBalanceHistory(activeFactorId!, companyId, { limit: 50 }),
    enabled: Boolean(companyId && activeFactorId),
  });

  const loansQuery = useQuery({
    queryKey: ["data-infra", "equipment-loans", companyId, "reserves-shared"],
    queryFn: () => listEquipmentLoans(companyId),
    enabled: Boolean(companyId),
  });

  const engine = useMemo(() => {
    const kpis = kpiQuery.data?.kpis;
    if (!kpis) return null;
    const pick = (key: string) => kpis.find((k) => k.key === key);
    const escrow = cents(pick("escrow_reserve_balance")?.value);
    const cash = cents(pick("cash_reserve_balance")?.value);
    return { escrow, cash, total: escrow + cash, fee: cents(pick("fees_accrued")?.value), count: pick("purchased_volume")?.row_count ?? 0 };
  }, [kpiQuery.data?.kpis]);
  const engineMoney = (v: number | undefined) => (kpiQuery.isError ? "Unavailable" : v == null ? "…" : formatUsdCents(v));

  // summary.outstanding_liability_balance is dollars.
  const outstandingLiabilityCents = Math.round(
    Number(summaryQuery.data?.outstanding_liability_balance ?? 0) * 100
  );

  const activeLoans = useMemo(
    () => (loansQuery.data?.rows ?? []).filter((r) => r.status === "active"),
    [loansQuery.data?.rows]
  );

  const loanOutstandingCents = useMemo(
    () =>
      activeLoans.reduce((sum, row) => {
        const bal =
          row.outstanding_balance_cents != null ? cents(row.outstanding_balance_cents) : cents(row.principal_cents);
        return sum + bal;
      }, 0),
    [activeLoans]
  );

  const movementColumns: Array<ParityColumn<FactoringReserveBalanceHistoryEntry>> = [
    {
      key: "created_at",
      label: "Date",
      sortable: true,
      render: (row) => formatDateUS(row.created_at),
    },
    {
      key: "reason",
      label: "Note",
      sortable: true,
      sortValue: (row) => row.reason ?? "",
      render: (row) => row.reason ?? "—",
    },
    {
      key: "signed_amount_cents",
      label: "Amount",
      sortable: true,
      cellClass: "text-right",
      render: (row) => formatUsdCents(row.signed_amount_cents),
    },
    {
      key: "running_balance_cents",
      label: "Balance",
      sortable: true,
      cellClass: "text-right",
      render: (row) => formatUsdCents(row.running_balance_cents),
    },
  ];

  const loanColumns: Array<ParityColumn<EquipmentLoanRow>> = [
    {
      key: "equipment_number",
      label: "Unit",
      sortable: true,
      render: (row) =>
        row.equipment_id ? (
          <EntityLink kind="unit" id={row.equipment_id} label={row.equipment_number ?? "Unit"} />
        ) : (
          "—"
        ),
    },
    {
      key: "lender_vendor_name",
      label: "Lender",
      sortable: true,
      render: (row) =>
        row.lender_vendor_id ? (
          <EntityLink kind="vendor" id={row.lender_vendor_id} label={row.lender_vendor_name ?? "Vendor"} />
        ) : (
          "—"
        ),
    },
    {
      key: "principal_cents",
      label: "Principal",
      sortable: true,
      cellClass: "text-right",
      render: (row) => formatUsdCents(row.principal_cents),
    },
    {
      key: "outstanding_balance_cents",
      label: "Outstanding",
      sortable: true,
      cellClass: "text-right",
      render: (row) =>
        formatUsdCents(
          row.outstanding_balance_cents != null ? row.outstanding_balance_cents : row.principal_cents
        ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => row.status,
    },
    {
      key: "id",
      label: "Open",
      sortable: false,
      render: (row) => (
        <Link
          to={`/factoring/equipment-loans?loan_id=${encodeURIComponent(row.id)}`}
          className="text-xs font-medium text-[#14314F] underline"
          data-testid={`${rootTestId}-loan-open-${row.id}`}
        >
          Apply / pay
        </Link>
      ),
    },
  ];

  return (
    <section className="space-y-3" data-testid={rootTestId} data-reserves-shared-host={host}>
      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">
            Factoring reserves & deductions
          </h2>
          <div className="flex flex-wrap gap-2" data-testid={`${rootTestId}-actions`}>
            <Link
              to="/banking/transactions?type=uncategorized"
              className="inline-flex h-7 items-center rounded-sm border border-[#E5E7EB] px-2 text-xs font-medium text-[#14314F]"
              data-testid={`${rootTestId}-action-categorize`}
            >
              Categorize
            </Link>
            <Link
              to="/banking/transactions?type=uncategorized&action=transfer"
              className="inline-flex h-7 items-center rounded-sm border border-[#E5E7EB] px-2 text-xs font-medium text-[#14314F]"
              data-testid={`${rootTestId}-action-transfer`}
            >
              Transfer
            </Link>
            <Link
              to={FACTORING_TAB_PATH.payments_to_you}
              className="inline-flex h-7 items-center rounded-sm border border-[#E5E7EB] px-2 text-xs font-medium text-[#14314F]"
              data-testid={`${rootTestId}-action-apply`}
            >
              Apply / match wire
            </Link>
            <Link
              to={FACTORING_TAB_PATH.reserve_tracker}
              className="inline-flex h-7 items-center rounded-sm border border-[#E5E7EB] px-2 text-xs font-medium text-[#14314F]"
              data-testid={`${rootTestId}-action-tracker`}
            >
              Reserve tracker
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid={`${rootTestId}-kpi-strip`}>
          <Kpi label="Escrow reserve" value={engineMoney(engine?.escrow)} testId={`${rootTestId}-kpi-escrow`} />
          <Kpi label="Cash reserve" value={engineMoney(engine?.cash)} testId={`${rootTestId}-kpi-cash`} />
          <Kpi label="Total reserve" value={engineMoney(engine?.total)} testId={`${rootTestId}-kpi-total`} />
          <Kpi
            label="CCG loans outstanding"
            value={loansQuery.isError ? "—" : formatUsdCents(loanOutstandingCents)}
            testId={`${rootTestId}-kpi-ccg`}
          />
        </div>
        <p className="mt-2 text-xs text-[#6B7280]" data-testid={`${rootTestId}-footnote`}>
          Escrow / cash reserve = GL 1230 / 1235 balances from the factoring KPI engine (the same figures Banking
          shows). CCG = equipment loans (same loan API in both modules). Outstanding liability{" "}
          {summaryQuery.isError ? "Unavailable" : formatUsdCents(outstandingLiabilityCents)} · {engine?.count ?? "…"} posted
          purchases this year · fees accrued {engineMoney(engine?.fee)}.
        </p>
      </div>

      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3">
        <div className="mb-2 text-xs font-medium text-[#0F1219]">Reserve movement history</div>
        {reserveHistoryQuery.isError ? (
          <ListErrorState
            title="Couldn't load reserve movements"
            {...formatQueryErrorDetail(reserveHistoryQuery.error)}
            onRetry={() => void reserveHistoryQuery.refetch()}
          />
        ) : !activeFactorId ? (
          <p className="text-xs text-[#6B7280]">No active factor — reserve ledger has nothing to scope to.</p>
        ) : (
          <ParityTable
            columns={movementColumns}
            rows={reserveHistoryQuery.data?.movements ?? []}
            rowKey={(row) => row.id}
            loading={reserveHistoryQuery.isLoading}
            emptyText="No reserve movements recorded yet."
            storageKey={`${rootTestId}-movements`}
            tableTestId={`${rootTestId}-movements-table`}
          />
        )}
      </div>

      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-[#0F1219]">CCG / equipment loan deductions</div>
          <Link
            to="/factoring/equipment-loans"
            className="text-xs font-medium text-[#14314F] underline"
            data-testid={`${rootTestId}-ccg-open-all`}
          >
            Open equipment loans
          </Link>
        </div>
        {loansQuery.isError ? (
          <ListErrorState
            title="Couldn't load equipment loans"
            {...formatQueryErrorDetail(loansQuery.error)}
            onRetry={() => void loansQuery.refetch()}
          />
        ) : (
          <ParityTable
            columns={loanColumns}
            rows={activeLoans}
            rowKey={(row) => row.id}
            loading={loansQuery.isLoading}
            emptyText="No active CCG / equipment loans."
            storageKey={`${rootTestId}-loans`}
            tableTestId={`${rootTestId}-loans-table`}
          />
        )}
      </div>
    </section>
  );
}

function Kpi({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1" data-testid={testId}>
      <div className="text-center text-xs font-bold uppercase tracking-wide text-[#4B5563]">{label}</div>
      <div className="text-center text-xs font-medium tabular-nums text-[#0F1219]">{value}</div>
    </div>
  );
}
