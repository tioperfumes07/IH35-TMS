/**
 * ROUND 315 / Lead B4 — Payments to You.
 * One row per Faro wire (= accounting.factoring_purchases). Click opens the purchase detail:
 * invoices / escrow / cash reserve / fees / wire fee / bank match. Builds on CC-2's purchase
 * engine only — never a second engine.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getFactoringPurchase,
  listFactoringPurchases,
  type FactoringPurchaseDetail,
  type FactoringPurchaseListRow,
} from "../../api/factoring-purchases";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { Button } from "../../components/Button";

function cents(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
}

type Props = {
  companyId: string;
  dateFrom?: string;
  dateTo?: string;
  filterBar?: React.ReactNode;
  summaryDetailToggle?: React.ReactNode;
};

export function PaymentsToYouPanel({ companyId, dateFrom, dateTo, filterBar, summaryDetailToggle }: Props) {
  const [searchParams] = useSearchParams();
  const purchaseIdFromUrl = searchParams.get("purchase_id")?.trim() ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(purchaseIdFromUrl || null);

  useEffect(() => {
    if (purchaseIdFromUrl) setSelectedId(purchaseIdFromUrl);
  }, [purchaseIdFromUrl]);

  const listQuery = useQuery({
    queryKey: ["factoring", "purchases", "payments-to-you", companyId, dateFrom, dateTo],
    queryFn: () =>
      listFactoringPurchases(companyId, {
        status: "posted",
        from: dateFrom || undefined,
        to: dateTo || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const detailQuery = useQuery({
    queryKey: ["factoring", "purchases", "detail", companyId, selectedId],
    queryFn: () => getFactoringPurchase(companyId, selectedId!),
    enabled: Boolean(companyId && selectedId),
  });

  const rows = useMemo(() => {
    const purchases = listQuery.data?.purchases ?? [];
    let runningNet = 0;
    let runningEscrow = 0;
    let runningCash = 0;
    return [...purchases]
      .sort((a, b) => {
        const da = new Date(a.wire_date ?? a.purchase_date).getTime();
        const db = new Date(b.wire_date ?? b.purchase_date).getTime();
        return da - db;
      })
      .map((row) => {
        runningNet += cents(row.net_to_company_cents);
        runningEscrow += cents(row.escrow_reserve_cents);
        runningCash += cents(row.cash_reserve_cents);
        return {
          ...row,
          running_net_cents: runningNet,
          running_escrow_cents: runningEscrow,
          running_cash_cents: runningCash,
        };
      });
  }, [listQuery.data?.purchases]);

  const totalNet = useMemo(
    () => rows.reduce((sum, row) => sum + cents(row.net_to_company_cents), 0),
    [rows]
  );

  const columns: Array<
    ParityColumn<
      FactoringPurchaseListRow & {
        running_net_cents: number;
        running_escrow_cents: number;
        running_cash_cents: number;
      }
    >
  > = [
    {
      key: "wire_date",
      label: "Wire date",
      sortable: true,
      render: (row) => formatDateUS(row.wire_date ?? row.purchase_date),
    },
    {
      key: "display_id",
      label: "Purchase",
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center gap-2">
          <EntityLink kind="factoring_purchase" id={row.id} label={row.display_id} />
          <button
            type="button"
            className="text-xs font-medium text-[#14314F] underline"
            data-testid={`payments-to-you-open-${row.id}`}
            onClick={() => setSelectedId(row.id)}
          >
            Open
          </button>
        </span>
      ),
    },
    {
      key: "faro_report_ref",
      label: "Faro ref",
      sortable: true,
      render: (row) => row.faro_report_ref || "—",
    },
    {
      key: "invoice_count",
      label: "Invoices",
      sortable: true,
      cellClass: "text-right tabular-nums",
      render: (row) => String(row.invoice_count),
    },
    {
      key: "gross_cents",
      label: "Gross",
      sortable: true,
      cellClass: "text-right tabular-nums",
      render: (row) => formatUsdCents(row.gross_cents),
    },
    {
      key: "escrow_reserve_cents",
      label: "Escrow rsv",
      sortable: true,
      cellClass: "text-right tabular-nums",
      render: (row) => formatUsdCents(row.escrow_reserve_cents),
    },
    {
      key: "cash_reserve_cents",
      label: "Cash rsv",
      sortable: true,
      cellClass: "text-right tabular-nums",
      render: (row) => formatUsdCents(row.cash_reserve_cents),
    },
    {
      key: "fee_cents",
      label: "Fees",
      sortable: true,
      cellClass: "text-right tabular-nums",
      render: (row) => formatUsdCents(cents(row.fee_cents) + cents(row.wire_fee_cents)),
    },
    {
      key: "net_to_company_cents",
      label: "Net paid to IH35",
      sortable: true,
      cellClass: "text-right tabular-nums font-semibold",
      render: (row) => formatUsdCents(row.net_to_company_cents),
    },
    {
      key: "running_escrow_cents",
      label: "Run escrow",
      sortable: true,
      cellClass: "text-right tabular-nums",
      render: (row) => formatUsdCents(row.running_escrow_cents),
    },
    {
      key: "running_cash_cents",
      label: "Run cash rsv",
      sortable: true,
      cellClass: "text-right tabular-nums",
      render: (row) => formatUsdCents(row.running_cash_cents),
    },
    {
      key: "running_net_cents",
      label: "Run net paid",
      sortable: true,
      cellClass: "text-right tabular-nums",
      render: (row) => formatUsdCents(row.running_net_cents),
    },
    {
      key: "bank_transaction_id",
      label: "Bank match",
      render: (row) =>
        row.bank_transaction_id ? (
          <EntityLink kind="bank_transaction" id={row.bank_transaction_id} label="Matched" />
        ) : (
          <span className="text-gray-500">Unmatched</span>
        ),
    },
  ];

  return (
    <div className="space-y-3" data-testid="factoring-payments-to-you">
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 text-xs font-medium text-gray-900">Payments to You</div>
        <div className="text-xs text-gray-500" data-testid="factoring-payments-to-you-note">
          One row per Faro wire (= factoring purchase). Click a purchase to see its invoices, fees,
          reserves, and bank match state.
        </div>
      </div>
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          {filterBar}
          {summaryDetailToggle}
        </div>
        {listQuery.isError ? (
          <ListErrorState
            title="Couldn't load payments"
            {...formatQueryErrorDetail(listQuery.error)}
            onRetry={() => void listQuery.refetch()}
          />
        ) : (
          <div className="overflow-x-auto">
            <ParityTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              loading={listQuery.isLoading}
              emptyText="No posted factoring purchases (wires) yet."
              storageKey="factoring-payments-to-you-purchases"
              tableTestId="factoring-payments-to-you-table"
              footerCells={{
                display_id: `${rows.length} wire(s)`,
                net_to_company_cents: formatUsdCents(totalNet),
                running_net_cents: formatUsdCents(totalNet),
              }}
            />
          </div>
        )}
      </div>

      {selectedId ? (
        <PurchaseDetailCard
          detail={detailQuery.data ?? null}
          loading={detailQuery.isLoading}
          error={detailQuery.isError}
          onClose={() => setSelectedId(null)}
          onRetry={() => void detailQuery.refetch()}
        />
      ) : null}
    </div>
  );
}

function PurchaseDetailCard(props: {
  detail: FactoringPurchaseDetail | null;
  loading: boolean;
  error: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { detail, loading, error, onClose, onRetry } = props;
  return (
    <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="factoring-payments-to-you-detail">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-gray-900">
          Purchase {detail?.display_id ?? "…"}
        </div>
        <Button type="button" variant="secondary" onClick={onClose} data-testid="payments-to-you-detail-close">
          Close
        </Button>
      </div>
      {error ? (
        <ListErrorState title="Couldn't load purchase" status={0} message="Retry to reload this wire." onRetry={onRetry} />
      ) : loading || !detail ? (
        <div className="py-4 text-center text-xs text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="payments-to-you-detail-totals">
            <Total label="Gross" value={formatUsdCents(detail.gross_cents)} />
            <Total label="Escrow reserve" value={formatUsdCents(detail.escrow_reserve_cents)} />
            <Total label="Cash reserve" value={formatUsdCents(detail.cash_reserve_cents)} />
            <Total label="Fee" value={formatUsdCents(detail.fee_cents)} />
            <Total label="Wire fee" value={formatUsdCents(detail.wire_fee_cents)} />
            <Total label="Advance" value={formatUsdCents(detail.advance_cents)} />
            <Total label="Net to IH35" value={formatUsdCents(detail.net_to_company_cents)} emphasis />
            <div className="bg-gray-50 p-2">
              <div className="text-xs uppercase tracking-wide text-gray-500">Bank match</div>
              <div className="mt-1 space-y-1 text-xs font-medium text-gray-900">
                {detail.bank_transaction_id ? (
                  <>
                    <EntityLink
                      kind="bank_transaction"
                      id={detail.bank_transaction_id}
                      label={`${formatDateUS(detail.bank_transaction_date)} · ${formatUsdCents(detail.bank_transaction_amount_cents)}`}
                    />
                    {detail.bank_account_id ? (
                      <div>
                        <Link
                          to={`/banking/accounts/${encodeURIComponent(String(detail.bank_account_id))}`}
                          className="text-[#14314F] underline"
                          data-testid="payments-to-you-bank-tieout-link"
                        >
                          Bank tie-out
                        </Link>
                      </div>
                    ) : null}
                  </>
                ) : (
                  "Unmatched"
                )}
              </div>
            </div>
          </div>
          {detail.journal_entry_id ? (
            <div className="text-xs text-gray-600">
              Funding JE:{" "}
              <EntityLink kind="journal_entry" id={detail.journal_entry_id} label={detail.journal_entry_id.slice(0, 8)} />
              {detail.factoring_advance_id ? (
                <>
                  {" · "}
                  Advance:{" "}
                  <EntityLink
                    kind="factoring_advance"
                    id={detail.factoring_advance_id}
                    label={detail.factoring_advance_display_id ?? detail.factoring_advance_id.slice(0, 8)}
                  />
                </>
              ) : null}
            </div>
          ) : null}
          <ParityTable
            columns={[
              {
                key: "invoice_display_id",
                label: "Invoice",
                render: (line) =>
                  line.invoice_id ? (
                    <EntityLink kind="invoice" id={line.invoice_id} label={line.invoice_display_id ?? "Invoice"} />
                  ) : (
                    "—"
                  ),
              },
              {
                key: "customer_name",
                label: "Debtor",
                render: (line) =>
                  line.customer_id ? (
                    <EntityLink kind="customer" id={line.customer_id} label={line.customer_name ?? "Customer"} />
                  ) : (
                    "—"
                  ),
              },
              {
                key: "load_number",
                label: "Load",
                render: (line) =>
                  line.load_id ? (
                    <EntityLink kind="load" id={line.load_id} label={line.load_number ?? "Load"} />
                  ) : (
                    "—"
                  ),
              },
              {
                key: "settlement_display_id",
                label: "Settlement",
                render: (line) =>
                  line.settlement_id ? (
                    <EntityLink kind="settlement" id={line.settlement_id} label={line.settlement_display_id ?? "Settlement"} />
                  ) : (
                    "—"
                  ),
              },
              {
                key: "gross_cents",
                label: "Gross",
                cellClass: "text-right tabular-nums",
                render: (line) => formatUsdCents(line.gross_cents),
              },
              {
                key: "escrow_reserve_cents",
                label: "Escrow",
                cellClass: "text-right tabular-nums",
                render: (line) => formatUsdCents(line.escrow_reserve_cents),
              },
              {
                key: "cash_reserve_cents",
                label: "Cash rsv",
                cellClass: "text-right tabular-nums",
                render: (line) => formatUsdCents(line.cash_reserve_cents),
              },
              {
                key: "fee_cents",
                label: "Fee",
                cellClass: "text-right tabular-nums",
                render: (line) => formatUsdCents(line.fee_cents),
              },
            ]}
            rows={detail.lines ?? []}
            rowKey={(line) => line.id}
            emptyText="No invoice lines on this purchase."
            storageKey="factoring-payments-to-you-lines"
            tableTestId="factoring-payments-to-you-lines-table"
          />
        </div>
      )}
    </div>
  );
}

function Total({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="bg-gray-50 p-2">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-xs text-gray-900 ${emphasis ? "font-semibold" : "font-medium"}`}>{value}</div>
    </div>
  );
}
