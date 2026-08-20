import { humanizeEnumLabel } from "../../lib/humanizeEnumLabel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { cashAdvanceRequestsOfficeApi } from "../../api/cashAdvanceRequests";
import { getDebtSummary, listSettlements, type SettlementListRow } from "../../api/driverFinance";
import { getLiabilitiesByDriver } from "../../api/liabilities";
import { listExpenses, listVendorBills } from "../../api/accounting";
import { getDriverApVendor } from "../../api/mdata";
import { Button } from "../Button";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { useLiveDebt } from "../../pages/driver-finance/hooks/useLiveDebt";
import { listAutoDeductionPolicies } from "../../hooks/useAutoDeductionPolicies";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";

type Props = {
  driverId: string;
  operatingCompanyId: string;
  /**
   * LAW OF THE LAND §9 (2026-07-22): reverse+forward drill from this tab into the driver's
   * Operations sub-views (e.g. escrow-history) without a URL round-trip — DriverDetail.tsx owns the
   * activeTab/operationsSubView state, so this callback lets EarningsTab drive it directly.
   */
  onOpenOperationsView?: (slug: string) => void;
  /**
   * LAW OF THE LAND §9 (2026-07-22): "Pay rate template link if data exists" — verified there is no
   * FK from a driver to a catalogs pay-rate-template row (rate lines are per-qualification
   * line_item_template_id amounts on Equipment Assignments, not a template reference — Rule 16, no
   * guessed mapping). The honest link is to the tab that actually holds the driver's live rates.
   */
  onOpenEquipmentAssignments?: () => void;
};

type LiabilityRow = Record<string, unknown>;

function money(value: number) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function sumBalances(rows: Array<Record<string, unknown>>) {
  return rows.reduce((sum, row) => sum + Number(row.current_balance ?? 0), 0);
}

function weeksElapsedInYear(now = new Date()) {
  const start = new Date(now.getFullYear(), 0, 1);
  const ms = now.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
}

function isYtdSettlement(row: SettlementListRow, year: number) {
  const end = new Date(row.period_end);
  return !Number.isNaN(end.getTime()) && end.getFullYear() === year;
}

const SETTLEMENT_COLUMNS: Array<ParityColumn<SettlementListRow>> = [
  {
    key: "period",
    label: "Period",
    sortable: true,
    sortValue: (row) => row.period_end,
    render: (row) => (
      <EntityLink
        kind="settlement"
        id={row.id}
        label={`${formatDateUS(row.period_start)} → ${formatDateUS(row.period_end)}`}
      />
    ),
  },
  {
    key: "gross_pay",
    label: "Gross",
    sortable: true,
    render: (row) => money(Number(row.gross_pay ?? 0)),
  },
  {
    key: "deductions_total",
    label: "Deductions",
    sortable: true,
    render: (row) => money(Number(row.deductions_total ?? 0)),
  },
  {
    key: "net_pay",
    label: "Net pay",
    sortable: true,
    cellClass: "font-semibold text-green-700",
    render: (row) => money(Number(row.net_pay ?? 0)),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
  },
];

const LIABILITY_COLUMNS: Array<ParityColumn<LiabilityRow>> = [
  {
    key: "type",
    label: "Type",
    sortable: true,
    render: (row) => (
      <EntityLink
        kind="liability"
        id={row.id ? String(row.id) : null}
        label={entityLabel(row.type ? String(row.type) : null, row.id ? String(row.id) : null, "Liability")}
      />
    ),
  },
  {
    key: "source_description",
    label: "Source",
    sortable: true,
    render: (row) => String(row.source_description ?? "—"),
  },
  {
    key: "original_amount",
    label: "Original",
    sortable: true,
    sortValue: (row) => Number(row.original_amount ?? 0),
    render: (row) => money(Number(row.original_amount ?? 0)),
  },
  {
    key: "paid_to_date",
    label: "Paid",
    sortable: true,
    sortValue: (row) => Number(row.paid_to_date ?? 0),
    render: (row) => money(Number(row.paid_to_date ?? 0)),
  },
  {
    key: "current_balance",
    label: "Balance",
    sortable: true,
    sortValue: (row) => Number(row.current_balance ?? 0),
    cellClass: "font-semibold",
    render: (row) => money(Number(row.current_balance ?? 0)),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (row) => humanizeEnumLabel(row.display_status ?? row.status ?? "active"),
  },
];

export function EarningsTab({ driverId, operatingCompanyId, onOpenOperationsView, onOpenEquipmentAssignments }: Props) {
  const queryClient = useQueryClient();
  const enabled = Boolean(driverId) && Boolean(operatingCompanyId);
  const { debt, computedAt, loading: debtLoading, refresh } = useLiveDebt(
    enabled ? driverId : null,
    enabled ? operatingCompanyId : null
  );

  const liabilitiesQuery = useQuery({
    queryKey: ["driver-liabilities", driverId, operatingCompanyId],
    queryFn: () => getLiabilitiesByDriver(driverId, operatingCompanyId),
    enabled,
  });

  const settlementsQuery = useQuery({
    queryKey: ["driver-settlements-summary", operatingCompanyId],
    queryFn: () => listSettlements(operatingCompanyId),
    enabled,
  });

  const cashAdvancesQuery = useQuery({
    queryKey: ["driver-cash-advances", operatingCompanyId, driverId],
    queryFn: () => cashAdvanceRequestsOfficeApi.list(operatingCompanyId, "approved"),
    enabled,
  });

  // LAW OF THE LAND §9 (2026-07-22): driver profile reverse link for "active deductions /
  // auto-deduction policies" — backend already supports driver_id filtering
  // (settlements/auto-deductions/policy.routes.ts), just wasn't wired to this tab.
  const autoDeductionPoliciesQuery = useQuery({
    queryKey: ["driver-auto-deduction-policies", operatingCompanyId, driverId],
    queryFn: () => listAutoDeductionPolicies(operatingCompanyId, { driver_id: driverId }),
    enabled,
  });

  // FAIL-AP1 — reverse of mdata.vendors.driver_id (not QBO Mapping).
  const apVendorQuery = useQuery({
    queryKey: ["driver-ap-vendor", driverId, operatingCompanyId],
    queryFn: () => getDriverApVendor(driverId, operatingCompanyId),
    enabled,
  });
  const apVendorId = apVendorQuery.data?.vendor?.id ?? null;
  const openBillsQuery = useQuery({
    queryKey: ["driver-ap-vendor-open-bills", operatingCompanyId, apVendorId],
    queryFn: () =>
      listVendorBills(operatingCompanyId, {
        vendor_id: apVendorId!,
        status: "unpaid",
        include_balance: true,
        limit: 50,
      }),
    enabled: enabled && Boolean(apVendorId),
  });
  // EXPENSE column-wave: accounting.expenses.driver_uuid is a SEPARATE leaf from the driver-as-vendor
  // AP bills above — a driver-attributed general expense (recorded via RecordExpenseForm's driver
  // picker, added in this same commit). Backend has supported create/list/detail-by-driver since the
  // route's original build; no Driver page ever queried it until now.
  const driverExpensesQuery = useQuery({
    queryKey: ["driver-expenses", operatingCompanyId, driverId],
    queryFn: () => listExpenses(operatingCompanyId, { driver_id: driverId, limit: 50 }).then((res) => res.rows),
    enabled,
  });
  const openBillTotalCents = useMemo(() => {
    const rows = openBillsQuery.data?.rows ?? [];
    return rows.reduce((sum, row) => {
      const bal =
        row.balance_cents != null
          ? Number(row.balance_cents)
          : Number(row.amount_cents ?? 0) - Number(row.paid_cents ?? 0);
      return sum + (Number.isFinite(bal) ? bal : 0);
    }, 0);
  }, [openBillsQuery.data?.rows]);

  const liabilities = liabilitiesQuery.data?.liabilities ?? [];
  const driverSettlements = useMemo(() => {
    const rows = settlementsQuery.data?.settlements ?? [];
    return rows
      .filter((row) => row.driver_id === driverId)
      .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)));
  }, [driverId, settlementsQuery.data?.settlements]);

  const ytdYear = new Date().getFullYear();
  const ytdSettlements = driverSettlements.filter((row) => isYtdSettlement(row, ytdYear));
  const ytdEarnings = ytdSettlements.reduce((sum, row) => sum + Number(row.gross_pay ?? 0), 0);
  const lastFourSettlements = driverSettlements.slice(0, 4);
  const averagePerWeek = ytdEarnings / weeksElapsedInYear();

  const totalOutstandingLiabilities = sumBalances(liabilities);
  const cashAdvancesUnpaid = liabilities
    .filter((row) => String(row.type ?? "") === "advance")
    .reduce((sum, row) => sum + Number(row.current_balance ?? 0), 0);

  const approvedAdvancesForDriver = (cashAdvancesQuery.data?.requests ?? []).filter(
    (row) => String(row.driver_id ?? "") === driverId
  );

  const handleRefresh = async () => {
    await refresh();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["driver-liabilities", driverId, operatingCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["driver-settlements-summary", operatingCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["driver-cash-advances", operatingCompanyId, driverId] }),
    ]);
    await getDebtSummary(driverId, operatingCompanyId);
  };

  if (!enabled) {
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Select an operating company to view earnings and debt.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="driver-earnings-debt-tab">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white p-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Live debt summary</h2>
          <div className="text-xs text-gray-500">
            Recomputed at {computedAt ? new Date(computedAt).toLocaleString() : "—"}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={debtLoading}
          onClick={() => void handleRefresh()}
          data-testid="driver-earnings-debt-refresh"
        >
          Refresh
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <div className="rounded-sm border border-red-200 bg-red-50 p-3">
          <div className="text-[11px] uppercase text-red-700">Total active debt</div>
          <div className="text-lg font-semibold text-red-800" data-testid="driver-earnings-total-debt">
            {money(Number(debt?.total_active_debt ?? 0))}
          </div>
        </div>
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-3">
          <div className="text-[11px] uppercase text-slate-700">Outstanding liabilities</div>
          <div className="text-lg font-semibold text-slate-800" data-testid="driver-earnings-liabilities-total">
            {money(totalOutstandingLiabilities)}
          </div>
        </div>
        <div className="rounded-sm border border-slate-300 bg-slate-100 p-3">
          <div className="text-[11px] uppercase text-slate-700">Cash advances unpaid</div>
          <div className="text-lg font-semibold text-slate-700" data-testid="driver-earnings-cash-advances-unpaid">
            {money(cashAdvancesUnpaid)}
          </div>
          <div className="text-[10px] text-slate-700">{approvedAdvancesForDriver.length} approved advance(s)</div>
          <Link
            to={`/cash-advances?driver_id=${encodeURIComponent(driverId)}`}
            className="text-[10px] text-slate-700 underline"
            data-testid="driver-earnings-cash-advances-link"
          >
            View all cash advances →
          </Link>
        </div>
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-3">
          <div className="text-[11px] uppercase text-slate-700">Pending ack liabilities</div>
          <div className="text-lg font-semibold text-slate-800">
            {money(Number(debt?.pending_ack_total ?? 0))}
          </div>
          <div className="text-[10px] text-slate-700">{Number(debt?.pending_ack_count ?? 0)} pending</div>
        </div>
      </div>

      {/* LAW OF THE LAND §9 (2026-07-22): escrow balance tile — honest empty ($0.00) rather than
          hidden when the driver has no escrow clause, per driver-profile reverse-link scope. */}
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Escrow</h3>
          {onOpenOperationsView ? (
            <button
              type="button"
              className="text-xs text-slate-700 underline"
              data-testid="driver-earnings-escrow-link"
              onClick={() => onOpenOperationsView("escrow-history")}
            >
              View escrow history →
            </button>
          ) : null}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase text-gray-500">Pre-clause balance</div>
            <div className="text-lg font-semibold text-gray-900" data-testid="driver-earnings-escrow-pre">
              {money(Number(debt?.escrow_pre_clause ?? 0))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-gray-500">Post-clause balance</div>
            <div className="text-lg font-semibold text-gray-900" data-testid="driver-earnings-escrow-post">
              {money(Number(debt?.escrow_post_clause ?? 0))}
            </div>
          </div>
        </div>
      </div>

      {/* FAIL-AP1 — Driver → A/P vendor reverse (canonical mdata.vendors.driver_id).
          Distinct from Profile → QBO Mapping (qbo_vendor_id). */}
      <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="driver-earnings-ap-vendor">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">A/P vendor (driver payee)</h3>
          {apVendorId ? (
            <EntityLinkOrTombstone
              kind="vendor"
              id={apVendorId}
              name={apVendorQuery.data?.vendor?.name}
              noun="Vendor"
              className="text-xs text-slate-700 underline"
              data-testid="driver-earnings-ap-vendor-open"
            />
          ) : null}
        </div>
        {apVendorQuery.isPending ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : !apVendorQuery.data?.vendor ? (
          <p className="text-xs text-gray-500" data-testid="driver-earnings-ap-vendor-empty">
            No A/P vendor linked for this company. Link the vendor&apos;s driver_id (or run ensure-drivers)
            before posting driver pay.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <div className="text-[11px] uppercase text-gray-500">Vendor</div>
              <div className="text-sm font-semibold text-gray-900" data-testid="driver-earnings-ap-vendor-link">
                <EntityLink
                  kind="vendor"
                  id={apVendorQuery.data.vendor.id}
                  label={entityLabel(
                    apVendorQuery.data.vendor.name,
                    apVendorQuery.data.vendor.id,
                    "Vendor"
                  )}
                />
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-500">Open bills</div>
              <div className="text-lg font-semibold text-gray-900" data-testid="driver-earnings-ap-vendor-open-total">
                {openBillsQuery.isPending ? "…" : money(openBillTotalCents / 100)}
              </div>
              <div className="text-[10px] text-gray-500">
                {(openBillsQuery.data?.rows ?? []).length} unpaid bill(s)
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="driver-earnings-expenses">
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase text-gray-600">Driver-attributed expenses</h4>
          <Link
            to={`/accounting/expenses?driver_id=${encodeURIComponent(driverId)}`}
            className="text-xs text-slate-700 underline"
          >
            Open all →
          </Link>
        </div>
        {driverExpensesQuery.isPending ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : (driverExpensesQuery.data ?? []).length === 0 ? (
          <p className="text-xs text-gray-500" data-testid="driver-earnings-expenses-empty">
            No expenses recorded against this driver.
          </p>
        ) : (
          <div className="space-y-1">
            {(driverExpensesQuery.data ?? []).slice(0, 5).map((row) => (
              <div key={row.id} className="flex items-center justify-between text-xs">
                <EntityLink kind="expense" id={row.id} label={entityLabel(row.memo, row.id, "Expense")} />
                <span className="text-gray-700">{money(Number(row.total_amount_cents ?? 0) / 100)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="text-[11px] uppercase text-gray-500">YTD earnings</div>
          <div className="text-lg font-semibold text-gray-900" data-testid="driver-earnings-ytd">
            {money(ytdEarnings)}
          </div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="text-[11px] uppercase text-gray-500">Average per week</div>
          <div className="text-lg font-semibold text-gray-900" data-testid="driver-earnings-avg-week">
            {money(averagePerWeek)}
          </div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="text-[11px] uppercase text-gray-500">Settlements YTD</div>
          <div className="text-lg font-semibold text-gray-900">{ytdSettlements.length}</div>
        </div>
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Last 4 settlements</h3>
          <Link
            to={`/driver-finance/settlements?driver_id=${encodeURIComponent(driverId)}`}
            className="text-xs text-slate-700 underline"
            data-testid="driver-earnings-settlements-link"
          >
            View all settlements →
          </Link>
        </div>
        <ParityTable
          columns={SETTLEMENT_COLUMNS}
          rows={lastFourSettlements}
          rowKey={(row) => row.id}
          loading={settlementsQuery.isPending}
          storageKey="driver-earnings-last-settlements"
          emptyText="No settlements for this driver yet."
          initialPageSize={10}
          pageSizeOptions={[10, 25, 50]}
          rowTestId={(row) => `driver-earnings-settlement-${row.id}`}
        />
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Active liabilities</h3>
          <Link
            to={`/liabilities?driver_id=${encodeURIComponent(driverId)}`}
            className="text-xs text-slate-700 underline"
            data-testid="driver-earnings-liabilities-link"
          >
            View all liabilities →
          </Link>
        </div>
        <ParityTable
          columns={LIABILITY_COLUMNS}
          rows={liabilities}
          rowKey={(row) => String(row.id)}
          loading={liabilitiesQuery.isPending}
          storageKey="driver-earnings-active-liabilities"
          emptyText="No active liabilities for this driver."
          initialPageSize={25}
          pageSizeOptions={[10, 25, 50, 100]}
          rowTestId={(row) => `driver-earnings-liability-${String(row.id)}`}
        />
      </div>

      {/* LAW OF THE LAND §9 (2026-07-22): active deductions / auto-deduction policies reverse-link. */}
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Active deductions</h3>
          <EntityLink
            kind="driver_deductions_filter"
            id={driverId}
            label="Manage auto-deduction policies →"
            className="text-xs text-slate-700 underline"
            data-testid="driver-earnings-auto-deductions-link"
          />
        </div>
        {autoDeductionPoliciesQuery.isPending ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : (autoDeductionPoliciesQuery.data?.rows ?? []).length === 0 ? (
          <p className="text-xs text-gray-500">No auto-deduction policies for this driver.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(autoDeductionPoliciesQuery.data?.rows ?? []).map((policy) => (
              <div
                key={policy.id}
                className="flex items-center justify-between px-1 py-1.5 text-xs"
                data-testid={`driver-earnings-auto-deduction-${policy.id}`}
              >
                <span>
                  {policy.deduction_type} · {policy.status}
                </span>
                <span className="font-semibold">
                  {money((policy.deducted_so_far_cents ?? 0) / 100)} / {money((policy.total_owed_cents ?? 0) / 100)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* LAW OF THE LAND §9 (2026-07-22): pay rate — honest note, not a fabricated catalog FK.
          Verified: driver current_rates are per-qualification line_item_template_id amounts, not a
          reference to catalogs pay-rate-template rows (Rule 16 — no guessed mapping). */}
      {onOpenEquipmentAssignments ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Pay rates</h3>
              <p className="text-[11px] text-gray-500">
                Per-load and per-mile rates live on the driver's equipment qualifications, not a shared template.
              </p>
            </div>
            <button
              type="button"
              className="whitespace-nowrap text-xs text-slate-700 underline"
              data-testid="driver-earnings-pay-rates-link"
              onClick={onOpenEquipmentAssignments}
            >
              View rates on Equipment Assignments →
            </button>
          </div>
        </div>
      ) : null}

      {/* ARCHIVE (A24-5): prior placeholder copy lived inline in DriverDetail.tsx — Sunset 2026-09-01 */}
    </div>
  );
}
