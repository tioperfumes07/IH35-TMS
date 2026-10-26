/**
 * ROUND 315 / Lead B4 — Payments to You.
 * One row per Faro wire (= accounting.factoring_purchases). Click opens the purchase detail:
 * invoices / escrow / cash reserve / fees / wire fee / bank match. Builds on CC-2's purchase
 * engine only — never a second engine.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFactoringPurchase,
  listFactoringPurchases,
  voidFactoringPurchase,
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
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { BoardSection } from "../../components/v3/BoardSection";
import { entityLabel } from "../../lib/entity-label";

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
  /** LEAD 443.174 — Summary = one row per month (wires, gross, fees, net); Detail = one row per purchase (wire). */
  view?: "summary" | "detail";
  /** 443.171 — Undo purchase is the Owner's (the server refuses everyone else). */
  isOwner?: boolean;
  /** 443.171 E — clicking a purchase opens it in the Submit to Factor form in Edit mode (Owner). */
  onEditPurchase?: (purchaseId: string) => void;
};

export const UNDO_PURCHASE_MATCHED_MESSAGE = "Unmatch the Faro wire in Banking first";

type UndoTarget = { id: string; display_id: string; bank_transaction_id: string | null; bank_account_id: string | null };

export type PaymentsToYouMonthRow = {
  month: string;
  wires: number;
  invoices: number;
  gross_cents: number;
  fees_cents: number;
  escrow_reserve_cents: number;
  cash_reserve_cents: number;
  net_to_company_cents: number;
};

/** LEAD 443.174 — the Summary view: purchases grouped by the month of the wire (else the purchase date). */
export function paymentsToYouByMonth(purchases: FactoringPurchaseListRow[]): PaymentsToYouMonthRow[] {
  const c = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
  const by = new Map<string, PaymentsToYouMonthRow>();
  for (const p of purchases) {
    const month = String(p.wire_date ?? p.purchase_date).slice(0, 7);
    const m = by.get(month) ?? { month, wires: 0, invoices: 0, gross_cents: 0, fees_cents: 0, escrow_reserve_cents: 0, cash_reserve_cents: 0, net_to_company_cents: 0 };
    m.wires += 1;
    m.invoices += c(p.invoice_count);
    m.gross_cents += c(p.gross_cents);
    m.fees_cents += c(p.fee_cents) + c(p.wire_fee_cents);
    m.escrow_reserve_cents += c(p.escrow_reserve_cents);
    m.cash_reserve_cents += c(p.cash_reserve_cents);
    m.net_to_company_cents += c(p.net_to_company_cents);
    by.set(month, m);
  }
  return [...by.values()].sort((a, b) => a.month.localeCompare(b.month));
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-");
  return y && m ? `${m}/${y}` : ym;
};

const MONTH_COLUMNS: ParityColumn<PaymentsToYouMonthRow>[] = [
  { key: "month", label: "Month", sortable: true, render: (r) => monthLabel(r.month) },
  { key: "wires", label: "Wires", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => r.wires },
  { key: "invoices", label: "Invoices", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => r.invoices },
  { key: "gross_cents", label: "Purchased", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => formatUsdCents(r.gross_cents) },
  { key: "escrow_reserve_cents", label: "Escrow reserve", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => formatUsdCents(r.escrow_reserve_cents) },
  { key: "cash_reserve_cents", label: "Cash reserve", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => formatUsdCents(r.cash_reserve_cents) },
  { key: "fees_cents", label: "Fees", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => formatUsdCents(r.fees_cents) },
  { key: "net_to_company_cents", label: "Net to IH35", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => formatUsdCents(r.net_to_company_cents) },
];

export function PaymentsToYouPanel({ companyId, dateFrom, dateTo, filterBar, summaryDetailToggle, view = "detail", isOwner = false, onEditPurchase }: Props) {
  const canEdit = isOwner && Boolean(onEditPurchase);
  const queryClient = useQueryClient();
  const [undo, setUndo] = useState<UndoTarget | null>(null);
  const [voided, setVoided] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const purchaseIdFromUrl = searchParams.get("purchase_id")?.trim() ?? "";
  // A load's Factoring tab deep-links here with ?load_id= (the reverse of the load link on every purchase line) — the
  // purchases carrying that load, with their wire and bank match. Replaces the deleted Banking "Factoring (Faro)" tab
  // (ROUND-20.8 B3, #21962), whose /banking/factoring?load_id= link had become a redirect that dropped the load.
  const loadIdFromUrl = searchParams.get("load_id")?.trim() ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(purchaseIdFromUrl || null);

  useEffect(() => {
    if (purchaseIdFromUrl) setSelectedId(purchaseIdFromUrl);
  }, [purchaseIdFromUrl]);

  const listQuery = useQuery({
    queryKey: ["factoring", "purchases", "payments-to-you", companyId, dateFrom, dateTo, loadIdFromUrl],
    queryFn: () =>
      listFactoringPurchases(companyId, {
        status: "posted",
        from: dateFrom || undefined,
        to: dateTo || undefined,
        load_id: loadIdFromUrl || undefined,
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
  const monthRows = useMemo(() => paymentsToYouByMonth(listQuery.data?.purchases ?? []), [listQuery.data?.purchases]);

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
          {canEdit && row.status === "posted" ? (
            <button
              type="button"
              className="text-xs font-medium text-[#14314F] underline"
              data-testid={`payments-to-you-edit-${row.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onEditPurchase!(row.id);
              }}
            >
              Edit
            </button>
          ) : null}
          {isOwner && row.status === "posted" ? (
            <button
              type="button"
              className="text-xs font-medium text-red-700 underline"
              data-testid={`payments-to-you-undo-${row.id}`}
              onClick={() => setUndo({ id: row.id, display_id: row.display_id, bank_transaction_id: row.bank_transaction_id, bank_account_id: null })}
            >
              Undo purchase
            </button>
          ) : null}
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
      <BoardSection title="Payments to You" testId="factoring-payments-to-you-intro">
        <div className="px-3.5 py-2 text-xs text-gray-500" data-testid="factoring-payments-to-you-note">
          One row per Faro wire (= factoring purchase). Click a purchase to see its invoices, fees,
          reserves, and bank match state.
        </div>
      </BoardSection>
      {voided ? (
        <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]" role="status" data-testid="payments-to-you-voided">
          Purchase {voided} — Voided. Its invoices are back on Submit to Factor.
        </div>
      ) : null}
      <BoardSection
        title={view === "summary" ? "Payments to you — by month" : "Payments to you — by purchase"}
        testId="factoring-payments-to-you-list"
        headerRight={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {filterBar}
            {summaryDetailToggle}
          </div>
        }
      >
        {listQuery.isError ? (
          <ListErrorState
            title="Couldn't load payments"
            {...formatQueryErrorDetail(listQuery.error)}
            onRetry={() => void listQuery.refetch()}
          />
        ) : (
          <div className="overflow-x-auto">
            {view === "summary" ? (
            <ParityTable
              title="Payments to you — by month"
              columns={MONTH_COLUMNS}
              rows={monthRows}
              rowKey={(row) => row.month}
              loading={listQuery.isLoading}
              emptyText="No posted factoring purchases (wires) yet."
              storageKey="factoring-payments-to-you-by-month"
              tableTestId="factoring-payments-to-you-month-table"
              footerCells={{
                month: `${monthRows.length} month(s)`,
                wires: String(rows.length),
                net_to_company_cents: formatUsdCents(totalNet),
              }}
            />
            ) : (
            <ParityTable
              title="Payments to you — by purchase"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              onRowClick={(row) => (canEdit && row.status === "posted" ? onEditPurchase!(row.id) : setSelectedId(row.id))}
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
            )}
          </div>
        )}
      </BoardSection>

      {selectedId ? (
        <PurchaseDetailCard
          detail={detailQuery.data ?? null}
          loading={detailQuery.isLoading}
          error={detailQuery.isError}
          onClose={() => setSelectedId(null)}
          onRetry={() => void detailQuery.refetch()}
          onEdit={canEdit && detailQuery.data?.status === "posted" ? () => onEditPurchase!(detailQuery.data!.id) : undefined}
          onUndo={
            isOwner && detailQuery.data?.status === "posted"
              ? () => {
                  const d = detailQuery.data!;
                  setUndo({ id: d.id, display_id: d.display_id, bank_transaction_id: d.bank_transaction_id ?? null, bank_account_id: d.bank_account_id ?? null });
                }
              : undefined
          }
        />
      ) : null}

      {undo ? (
        <UndoPurchaseDialog
          companyId={companyId}
          target={undo}
          onClose={() => setUndo(null)}
          onVoided={async () => {
            setVoided(undo.display_id);
            setUndo(null);
            await queryClient.invalidateQueries({ queryKey: ["factoring"] });
          }}
        />
      ) : null}
    </div>
  );
}

/** 443.171 — Undo purchase: voids the posted purchase through the one void route (reverses its funding JE, frees its
 *  invoices). A purchase whose Faro wire is matched to a bank line is refused until that match is undone in Banking. */
function UndoPurchaseDialog(props: { companyId: string; target: UndoTarget; onClose: () => void; onVoided: () => Promise<void> }) {
  const { companyId, target, onClose, onVoided } = props;

  return (
    <VoidReasonModal
      open
      title={`Undo purchase — ${target.display_id}`}
      entityRef="Voids this purchase: its funding JE is reversed and its invoices return to Submit to Factor. The purchase keeps its number, marked Voided. If matched to a bank line, undo the match in Banking first."
      onClose={onClose}
      onSubmit={async (reason) => {
        await voidFactoringPurchase(companyId, target.id, reason);
        await onVoided();
      }}
      submitLabel="Undo purchase"
    />
  );
}

function PurchaseDetailCard(props: {
  detail: FactoringPurchaseDetail | null;
  loading: boolean;
  error: boolean;
  onClose: () => void;
  onRetry: () => void;
  onUndo?: () => void;
  onEdit?: () => void;
}) {
  const { detail, loading, error, onClose, onRetry, onUndo, onEdit } = props;
  return (
    <BoardSection
      title={`Purchase ${detail?.display_id ?? "…"}`}
      testId="factoring-payments-to-you-detail"
      headerRight={
        <span className="flex items-center gap-2">
          {detail?.status === "voided" ? (
            <span className="text-xs font-semibold text-red-700" data-testid="payments-to-you-detail-voided">
              Voided
            </span>
          ) : null}
          {onEdit ? (
            <Button type="button" onClick={onEdit} data-testid="payments-to-you-detail-edit">
              Edit purchase
            </Button>
          ) : null}
          {onUndo ? (
            <Button type="button" variant="secondary" onClick={onUndo} data-testid="payments-to-you-detail-undo">
              Undo purchase
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose} data-testid="payments-to-you-detail-close">
            Close
          </Button>
        </span>
      }
    >
      {error ? (
        <ListErrorState title="Couldn't load purchase" status={0} message="Retry to reload this wire." onRetry={onRetry} />
      ) : loading || !detail ? (
        <div className="px-3.5 py-4 text-center text-xs text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-3 px-3.5 py-2">
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
              <EntityLink
                kind="journal_entry"
                id={detail.journal_entry_id}
                label={entityLabel(detail.journal_entry_memo ?? null, detail.journal_entry_id, "Journal entry")}
              />
              {detail.factoring_advance_id ? (
                <>
                  {" · "}
                  Advance:{" "}
                  <EntityLink
                    kind="factoring_advance"
                    id={detail.factoring_advance_id}
                    label={entityLabel(detail.factoring_advance_display_id ?? null, detail.factoring_advance_id, "Advance")}
                  />
                </>
              ) : null}
            </div>
          ) : null}
          <ParityTable
            title="Invoices on this purchase"
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
    </BoardSection>
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
