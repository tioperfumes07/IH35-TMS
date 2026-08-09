import { formatDateUS } from "../../lib/formatDate";
import { DateTimePicker } from "../../components/forms/DateTimePicker";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getFactoringAdvance,
  getFactoringAdvancePacket,
  markAdvanced,
  markReserveHeld,
  recourseReturn,
  releaseReserve,
  type FactoringAdvanceDetail,
  voidFactoring,
} from "../../api/accounting";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { FactorReserveCard } from "./FactorReserveCard";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";
import { userFacingApiError } from "../../lib/api-error-message";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function statusPill(status: FactoringAdvanceDetail["status"]) {
  const base = "rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (status === "advanced") return `${base} bg-slate-100 text-slate-700 border border-slate-300`;
  if (status === "reserve_held" || status === "collected") return `${base} bg-slate-50 text-slate-600 border border-slate-200`;
  if (status === "released") return `${base} bg-slate-100 text-slate-700 border border-slate-200`;
  if (status === "recourse_returned") return `${base} bg-red-50 text-red-700 border border-red-200`;
  if (status === "voided") return `${base} bg-slate-100 text-slate-500 border border-slate-200 line-through`;
  return `${base} bg-slate-50 text-slate-700 border border-slate-200`;
}

type ActionKind = "advance" | "reserve_held" | "release" | "recourse" | "void";

// CHROME-14: the advance/reserve/release/recourse/void action shell below was swapped from centered
// Modal to ParityDrawer (QBO side-panel chrome), with Cancel/Confirm moved into the drawer's sticky
// footer. Presentational only — every mutationFn branch and payload field above is untouched.

export function FactoringDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  // BANK-SORT-ROLLOUT-ACCT: linked-invoice grid sort persists in URL (?sort=&dir=).
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

  const [action, setAction] = useState<ActionKind | null>(null);
  const [notes, setNotes] = useState("");
  const [collectedAt, setCollectedAt] = useState("");
  const [advancedAt, setAdvancedAt] = useState("");
  const [releasedAt, setReleasedAt] = useState("");
  const [releaseAmount, setReleaseAmount] = useState("0");
  const [feeAmount, setFeeAmount] = useState("0");
  const [recourseReason, setRecourseReason] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const query = useQuery({
    queryKey: ["accounting", "factoring-advance", selectedCompanyId, id],
    queryFn: () => getFactoringAdvance(id, selectedCompanyId!),
    enabled: Boolean(id && selectedCompanyId),
  });

  // ACCT-SURF-09: reverse drill — packet already returns journal_entry_id on reserve/interest rows;
  // surface EntityLinks so Accounting ↔ factoring JE is not a dead end.
  const packetQuery = useQuery({
    queryKey: ["accounting", "factoring-advance-packet", selectedCompanyId, id],
    queryFn: () => getFactoringAdvancePacket(id, selectedCompanyId!),
    enabled: Boolean(id && selectedCompanyId),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !action) return;
      if (action === "advance") {
        await markAdvanced(id, selectedCompanyId, { advanced_at: advancedAt ? new Date(advancedAt).toISOString() : undefined, notes: notes || undefined });
      } else if (action === "reserve_held") {
        await markReserveHeld(id, selectedCompanyId, { collected_at: collectedAt ? new Date(collectedAt).toISOString() : undefined, notes: notes || undefined });
      } else if (action === "release") {
        await releaseReserve(id, selectedCompanyId, {
          released_at: releasedAt ? new Date(releasedAt).toISOString() : undefined,
          release_amount_cents: Math.max(0, Math.trunc(Number(releaseAmount || "0"))),
          factor_fee_cents: Math.max(0, Math.trunc(Number(feeAmount || "0"))),
          notes: notes || undefined,
        });
      } else if (action === "recourse") {
        await recourseReturn(id, selectedCompanyId, {
          recourse_reason: recourseReason,
        });
      } else if (action === "void") {
        await voidFactoring(id, selectedCompanyId, voidReason || undefined);
      }
    },
    onSuccess: () => {
      setAction(null);
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "factoring-advance", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "factoring-advances"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to update factoring batch"), "error"),
  });

  const detail = query.data;
  const showAdvance = detail?.status === "submitted";
  const showReserveHeld = detail?.status === "advanced";
  const showRelease = detail?.status === "reserve_held" || detail?.status === "collected";
  const showRecourse = detail?.status !== "released" && detail?.status !== "voided";
  const showVoid = detail?.status === "submitted" || detail?.status === "advanced";

  const totals = useMemo(() => {
    if (!detail) return null;
    return {
      total: money(detail.invoice_total_cents),
      advance: money(detail.advance_amount_cents),
      reserve: money(detail.reserve_amount_cents),
      fee: money(detail.factor_fee_cents),
      release: money(detail.release_amount_cents),
    };
  }, [detail]);

  if (query.isLoading) return <div className="text-sm text-gray-500">Loading factoring batch...</div>;
  if (query.isError)
    return (
      <ListErrorState
        title="Couldn't load factoring batch"
        status={0}
        message={(query.error as Error | undefined)?.message}
        onRetry={() => void query.refetch()}
      />
    );
  if (!detail) return <div className="text-sm text-red-600">Factoring batch not found.</div>;

  type FactoringInvoiceRow = FactoringAdvanceDetail["invoices"][number];

  // QBO-parity grid — columns, order, and the row drill-through to the invoice preserved verbatim
  // from the former hand-rolled table.
  const invoiceColumns: Array<ParityColumn<FactoringInvoiceRow>> = [
    {
      key: "display_id",
      label: "Invoice #",
      sortable: true,
      render: (invoice) => (
        <span onClick={(e) => e.stopPropagation()}>
          <EntityLink kind="invoice" id={invoice.id} label={invoice.display_id} />
        </span>
      ),
    },
    { key: "customer_name", label: "Customer", sortable: true },
    { key: "issue_date", label: "Issue Date", sortable: true, render: (invoice) => formatDateUS(invoice.issue_date) },
    { key: "total_cents", label: "Total", sortable: true, render: (invoice) => money(invoice.total_cents) },
    { key: "factoring_status", label: "Factoring Status", sortable: true },
  ];

  return (
    <AccountingSubNavWrapper>
      <PageHeader
        title={detail.display_id}
        backHref="/accounting/factoring"
        breadcrumb={[
          { label: "Accounting", href: "/accounting" },
          { label: "Factoring", href: "/accounting/factoring" },
          { label: detail.display_id },
        ]}
        subtitle={`Factor: ${detail.factoring_company_name}`}
        actions={
          <div className="flex items-center gap-2">
            <span className={statusPill(detail.status)}>{detail.status.replaceAll("_", " ")}</span>
            <Link
              to="/banking/factoring"
              className="rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
              data-testid="factoring-advance-banking-reverse-link"
            >
              Banking · Factoring entry
            </Link>
            <Button variant="secondary" onClick={() => navigate(`/vendors/${detail.factoring_company_vendor_id}`)}>
              Edit factoring company profile
            </Button>
            {showAdvance ? <Button onClick={() => setAction("advance")}>Mark Advanced</Button> : null}
            {showReserveHeld ? (
              <Button variant="secondary" onClick={() => setAction("reserve_held")}>
                Mark Reserve Held
              </Button>
            ) : null}
            {showRelease ? <Button onClick={() => setAction("release")}>Release Reserve</Button> : null}
            {showRecourse ? (
              <Button variant="secondary" onClick={() => setAction("recourse")}>
                Recourse Return
              </Button>
            ) : null}
            {showVoid ? (
              <Button variant="danger" onClick={() => setAction("void")}>
                Void
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        <DataPanel title="Header">
          <DataPanelRow>
            <span className="text-xs text-gray-600">Factor</span>
            <span className="text-sm text-gray-900">{detail.factoring_company_name}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Submitted</span>
            <span className="text-sm text-gray-900">{new Date(detail.submitted_at).toLocaleString()}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Status</span>
            <span className="text-sm text-gray-900">{detail.status}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Batch ref</span>
            <span className="text-sm text-gray-900">{detail.submission_batch_ref ?? "-"}</span>
          </DataPanelRow>
        </DataPanel>

        <DataPanel title="Amounts">
          <DataPanelRow>
            <span className="text-xs text-gray-600">Invoice Total</span>
            <span className="text-sm text-gray-900">{totals?.total}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Advance Rate</span>
            <span className="text-sm text-gray-900">{detail.advance_rate_pct}%</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Advance</span>
            <span className="text-sm text-gray-900">{totals?.advance}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Reserve</span>
            <span className="text-sm text-gray-900">{totals?.reserve}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Fee</span>
            <span className="text-sm text-gray-900">{totals?.fee}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Release</span>
            <span className="text-sm text-gray-900">{totals?.release}</span>
          </DataPanelRow>
        </DataPanel>
      </div>

      <DataPanel title="Linked invoices">
        <ParityTable<FactoringInvoiceRow>
          columns={invoiceColumns}
          rows={detail.invoices}
          rowKey={(invoice) => invoice.id}
          onRowClick={(invoice) => navigate(`/accounting/invoices/${invoice.id}`)}
          loading={query.isFetching && !query.data}
          emptyText="No invoices linked to this factoring batch."
          density="compact"
          storageKey="factoring-detail-invoices"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={onSortChange}
        />
      </DataPanel>

      <DataPanel title="Reserve movements & interest (JE reverse)">
        {packetQuery.isLoading ? (
          <p className="text-xs text-slate-500">Loading advance packet…</p>
        ) : packetQuery.isError ? (
          <p className="text-xs text-red-700">Could not load advance packet for JE links.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600">Reserve movements</p>
              {(packetQuery.data?.reserve_movements ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">No reserve movements yet (honest empty).</p>
              ) : (
                <ul className="space-y-1">
                  {(packetQuery.data?.reserve_movements ?? []).map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-sm border border-slate-200 bg-white px-2 py-1 text-xs">
                      <span className="font-medium">{String(row.movement_type ?? "movement")}</span>
                      <span>{money(Number(row.amount_cents ?? 0))}</span>
                      <span className="text-slate-500">{row.movement_date ? formatDateUS(String(row.movement_date)) : "—"}</span>
                      {row.journal_entry_id ? (
                        <EntityLink kind="journal_entry" id={row.journal_entry_id} label={entityLabel(null, row.journal_entry_id, "Journal entry")} />
                      ) : (
                        <span className="text-slate-400">JE —</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600">Interest accruals</p>
              {(packetQuery.data?.interest_accruals ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">No interest accruals yet (honest empty).</p>
              ) : (
                <ul className="space-y-1">
                  {(packetQuery.data?.interest_accruals ?? []).map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-sm border border-slate-200 bg-white px-2 py-1 text-xs">
                      <span>{row.accrual_date ? formatDateUS(String(row.accrual_date)) : "—"}</span>
                      <span>{money(Number(row.interest_cents ?? 0))}</span>
                      {row.journal_entry_id ? (
                        <EntityLink kind="journal_entry" id={row.journal_entry_id} label={entityLabel(null, row.journal_entry_id, "Journal entry")} />
                      ) : (
                        <span className="text-slate-400">JE —</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DataPanel>

      {selectedCompanyId ? <FactorReserveCard operatingCompanyId={selectedCompanyId} /> : null}

      <ParityDrawer
        open={Boolean(action)}
        title={
          action === "advance"
            ? "Mark Advanced"
            : action === "reserve_held"
              ? "Mark Reserve Held"
              : action === "release"
                ? "Release Reserve"
                : action === "recourse"
                  ? "Recourse Return"
                  : "Void Factoring Batch"
        }
        onClose={() => setAction(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Confirm
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm">
          {action === "advance" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Advanced at</span>
              <DateTimePicker aria-label="Advanced at" value={advancedAt} onChange={setAdvancedAt} />
            </label>
          ) : null}
          {action === "reserve_held" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Collected at</span>
              <DateTimePicker aria-label="Collected at" value={collectedAt} onChange={setCollectedAt} />
            </label>
          ) : null}
          {action === "release" ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-600">Released at</span>
                <DateTimePicker aria-label="Released at" value={releasedAt} onChange={setReleasedAt} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-600">Factor fee (USD)</span>
                {/* M-1: was raw "Factor fee cents" (350=$3.50). cents-mode MoneyInput; submit Math.trunc(Number(feeAmount)) cents unchanged. */}
                <MoneyInput valueCents={feeAmount ? Number(feeAmount) : null} onChangeCents={(c) => setFeeAmount(c == null ? "" : String(c))} ariaLabel="Factor fee (USD)" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-600">Release amount (USD)</span>
                {/* M-1: was raw "Release amount cents". cents-mode MoneyInput; submit Math.trunc(Number(releaseAmount)) cents unchanged. */}
                <MoneyInput valueCents={releaseAmount ? Number(releaseAmount) : null} onChangeCents={(c) => setReleaseAmount(c == null ? "" : String(c))} ariaLabel="Release amount (USD)" />
              </label>
            </>
          ) : null}
          {action === "recourse" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Recourse reason</span>
              <textarea className="min-h-[80px] rounded-sm border border-gray-300 p-2 text-[13px]" value={recourseReason} onChange={(event) => setRecourseReason(event.target.value)} />
            </label>
          ) : null}
          {action === "void" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Void reason</span>
              <textarea className="min-h-[80px] rounded-sm border border-gray-300 p-2 text-[13px]" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
            </label>
          ) : null}

          {action && action !== "recourse" && action !== "void" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Notes</span>
              <textarea className="min-h-[80px] rounded-sm border border-gray-300 p-2 text-[13px]" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          ) : null}
        </div>
      </ParityDrawer>
    </AccountingSubNavWrapper>
  );
}
