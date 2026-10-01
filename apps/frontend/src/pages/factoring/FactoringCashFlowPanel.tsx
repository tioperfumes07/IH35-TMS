/**
 * ROUND 315 / Lead B6 — Factoring Home cash-flow panel.
 * Posted purchases (= Faro wires) rolled TOTAL PER DAY + open-invoice candidates as projected
 * expected escrow/cash/fee. Reads CC-2 purchase list + candidates — never a second engine.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listFactoringPurchases, listPurchaseCandidates } from "../../api/factoring-purchases";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { FACTORING_TAB_PATH } from "../../router/route-manifest";

function cents(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
}

export type CashFlowDayRow = {
  day: string;
  wire_count: number;
  invoice_count: number;
  gross_cents: number;
  escrow_reserve_cents: number;
  cash_reserve_cents: number;
  fee_cents: number;
  wire_fee_cents: number;
  net_to_company_cents: number;
  kind: "posted" | "projected";
};

type Props = {
  companyId: string;
  dateFrom?: string;
  dateTo?: string;
};

export function FactoringCashFlowPanel({ companyId, dateFrom, dateTo }: Props) {
  const purchasesQuery = useQuery({
    queryKey: ["factoring", "cash-flow", "purchases", companyId, dateFrom, dateTo],
    queryFn: () =>
      listFactoringPurchases(companyId, {
        status: "posted",
        from: dateFrom || undefined,
        to: dateTo || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const candidatesQuery = useQuery({
    queryKey: ["factoring", "cash-flow", "candidates", companyId],
    queryFn: () => listPurchaseCandidates(companyId, {}),
    enabled: Boolean(companyId),
  });

  const postedDays = useMemo(() => {
    const byDay = new Map<string, CashFlowDayRow>();
    for (const p of purchasesQuery.data?.purchases ?? []) {
      const day = String(p.wire_date ?? p.purchase_date).slice(0, 10);
      const cur = byDay.get(day) ?? {
        day,
        wire_count: 0,
        invoice_count: 0,
        gross_cents: 0,
        escrow_reserve_cents: 0,
        cash_reserve_cents: 0,
        fee_cents: 0,
        wire_fee_cents: 0,
        net_to_company_cents: 0,
        kind: "posted" as const,
      };
      cur.wire_count += 1;
      cur.invoice_count += Number(p.invoice_count ?? 0);
      cur.gross_cents += cents(p.gross_cents);
      cur.escrow_reserve_cents += cents(p.escrow_reserve_cents);
      cur.cash_reserve_cents += cents(p.cash_reserve_cents);
      cur.fee_cents += cents(p.fee_cents);
      cur.wire_fee_cents += cents(p.wire_fee_cents);
      cur.net_to_company_cents += cents(p.net_to_company_cents);
      byDay.set(day, cur);
    }
    return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
  }, [purchasesQuery.data?.purchases]);

  const projected = useMemo(() => {
    const rows = candidatesQuery.data?.candidates ?? [];
    if (rows.length === 0) return null;
    let gross = 0;
    let escrow = 0;
    let cash = 0;
    let fee = 0;
    for (const r of rows) {
      gross += Number(r.open_cents ?? r.total_cents ?? 0);
      escrow += Number(r.expected_escrow_reserve_cents ?? 0);
      cash += Number(r.expected_cash_reserve_cents ?? 0);
      fee += Number(r.expected_fee_cents ?? 0);
    }
    const net = gross - escrow - cash - fee;
    return {
      day: "Projected (open invoices)",
      wire_count: 0,
      invoice_count: rows.length,
      gross_cents: gross,
      escrow_reserve_cents: escrow,
      cash_reserve_cents: cash,
      fee_cents: fee,
      wire_fee_cents: 0,
      net_to_company_cents: net,
      kind: "projected" as const,
    } satisfies CashFlowDayRow;
  }, [candidatesQuery.data?.candidates]);

  const rows = useMemo(() => {
    const out = [...postedDays];
    if (projected) out.push(projected);
    return out;
  }, [postedDays, projected]);

  const totals = useMemo(() => {
    const posted = postedDays;
    return {
      wires: posted.reduce((s, r) => s + r.wire_count, 0),
      invoices: posted.reduce((s, r) => s + r.invoice_count, 0),
      net: posted.reduce((s, r) => s + r.net_to_company_cents, 0),
      escrow: posted.reduce((s, r) => s + r.escrow_reserve_cents, 0),
      cash: posted.reduce((s, r) => s + r.cash_reserve_cents, 0),
      fee: posted.reduce((s, r) => s + r.fee_cents + r.wire_fee_cents, 0),
    };
  }, [postedDays]);

  const columns: Array<ParityColumn<CashFlowDayRow>> = [
    {
      key: "day",
      label: "Day",
      sortable: true,
      render: (row) => (row.kind === "posted" ? formatDateUS(row.day) : row.day),
    },
    {
      key: "kind",
      label: "Kind",
      render: (row) => (row.kind === "posted" ? "Posted wires" : "Projected"),
    },
    {
      key: "wire_count",
      label: "Wires",
      cellClass: "text-right tabular-nums",
      render: (row) => (row.kind === "posted" ? String(row.wire_count) : "—"),
    },
    {
      key: "invoice_count",
      label: "Invoices",
      cellClass: "text-right tabular-nums",
      render: (row) => String(row.invoice_count),
    },
    {
      key: "gross_cents",
      label: "Gross",
      cellClass: "text-right tabular-nums",
      render: (row) => formatUsdCents(row.gross_cents),
    },
    {
      key: "escrow_reserve_cents",
      label: "Escrow rsv",
      cellClass: "text-right tabular-nums",
      render: (row) => formatUsdCents(row.escrow_reserve_cents),
    },
    {
      key: "cash_reserve_cents",
      label: "Cash rsv",
      cellClass: "text-right tabular-nums",
      render: (row) => formatUsdCents(row.cash_reserve_cents),
    },
    {
      key: "fee_cents",
      label: "Fees",
      cellClass: "text-right tabular-nums",
      render: (row) => formatUsdCents(row.fee_cents + row.wire_fee_cents),
    },
    {
      key: "net_to_company_cents",
      label: "Net / expected net",
      cellClass: "text-right tabular-nums font-semibold",
      render: (row) => formatUsdCents(row.net_to_company_cents),
    },
  ];

  const loading = purchasesQuery.isLoading || candidatesQuery.isLoading;
  const error = purchasesQuery.isError || candidatesQuery.isError;

  return (
    <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="factoring-home-cash-flow">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-gray-900">Cash flow · TOTAL PER DAY</div>
          <div className="text-xs text-gray-500">
            Posted Faro wires from factoring purchases + projected open invoices (expected escrow /
            cash / fee from the purchase candidates engine). Same ledger as Payments to You / Escrow /
            Cash Reserve tabs.
          </div>
        </div>
        <div className="text-xs text-gray-600" data-testid="factoring-home-cash-flow-totals">
          {totals.wires} wire(s) · {totals.invoices} inv · net {formatUsdCents(totals.net)} · escrow{" "}
          {formatUsdCents(totals.escrow)} · cash {formatUsdCents(totals.cash)} · fees{" "}
          {formatUsdCents(totals.fee)}
          {" · "}
          <Link className="text-[#14314F] underline" to={FACTORING_TAB_PATH.payments_to_you}>
            Payments to You
          </Link>
        </div>
      </div>
      <div
        className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
        data-testid="factoring-home-cash-flow-kpis"
      >
        <KpiTile testId="factoring-home-kpi-wires" label="Posted wires" value={String(totals.wires)} />
        <KpiTile testId="factoring-home-kpi-invoices" label="Invoices on wires" value={String(totals.invoices)} />
        <KpiTile testId="factoring-home-kpi-net" label="Net wired" value={formatUsdCents(totals.net)} />
        <KpiTile testId="factoring-home-kpi-escrow" label="Escrow / day sum" value={formatUsdCents(totals.escrow)} />
        <KpiTile testId="factoring-home-kpi-cash" label="Cash rsv / day sum" value={formatUsdCents(totals.cash)} />
        <KpiTile
          testId="factoring-home-kpi-projected"
          label="Projected open inv"
          value={projected ? String(projected.invoice_count) : "0"}
        />
      </div>
      {error ? (
        <ListErrorState
          title="Couldn't load cash flow"
          status={0}
          message="Retry purchases + candidates"
          onRetry={() => {
            void purchasesQuery.refetch();
            void candidatesQuery.refetch();
          }}
        />
      ) : (
        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(row) => `${row.kind}:${row.day}`}
          loading={loading}
          emptyText="No posted wires and no open invoices to project."
          storageKey="factoring-home-cash-flow"
          tableTestId="factoring-home-cash-flow-table"
        />
      )}
    </div>
  );
}

function KpiTile({ testId, label, value }: { testId: string; label: string; value: string }) {
  return (
    <div
      className="flex min-h-[93px] max-h-[101px] flex-col items-center justify-center rounded-sm border border-[#E5E7EB] bg-white px-2 py-1 text-center"
      data-testid={testId}
    >
      {/* Locked 11px header via inline style — do not use arbitrary text bracket classes */}
      <div className="font-bold uppercase text-[#4B5563]" style={{ fontSize: "11px" }}>
        {label}
      </div>
      <div className="mt-1 text-xs font-semibold tabular-nums text-[#0F1219]">{value}</div>
    </div>
  );
}
