import { useMemo, useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { ApiError } from "../../api/client";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { CollapsedListFilters } from "../../components/table";
import {
  getRevenueContracts, getRevenueContractDetail, getRevenueLeakage,
  type RevenueContractListItem, type RevenueContractDetail, type RevenueObligation,
  type RevenueLeakageRow,
} from "../../api/revenue-recognition";

const fmtCents = (c: number) => formatUsdCents(c);
const fmtDate = (s: string | null) => formatDateUS(s) || "—";
const titleize = (s: string) => s.replace(/_/g, " ");

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-slate-100 text-slate-700",
  fully_recognized: "bg-slate-100 text-slate-700",
  voided: "bg-red-100 text-red-700",
};

function ObligationBlock({ ob }: { ob: RevenueObligation }) {
  return (
    <div className="rounded-sm border border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <div className="text-sm font-medium text-gray-800">
          #{ob.obligation_number} · {ob.description}
          <span className="ml-2 text-xs text-gray-500">({titleize(ob.recognition_method)})</span>
        </div>
        <div className="text-xs text-gray-600">
          Allocated {fmtCents(ob.allocated_price_cents)} · Recognized <span className="text-slate-700">{fmtCents(ob.recognized_to_date_cents)}</span> · Deferred {fmtCents(ob.remaining_deferred_cents)}
        </div>
      </div>
      {ob.schedule_note && <p className="px-3 py-2 text-xs text-gray-500">{ob.schedule_note}</p>}
      {ob.schedule.length > 0 && (
        <div className="overflow-x-auto">
        <table className="min-w-full text-xs divide-y divide-gray-200">
          <thead className="bg-white">
            <tr>
              {["#", "Period", "Recognized", "Remaining Deferred"].map((h) => (
                <th key={h} className="px-3 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ob.schedule.map((r) => (
              <tr key={r.period_number} className="hover:bg-gray-50">
                <td className="px-3 py-1.5 text-gray-500">{r.period_number}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.period_date)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtCents(r.recognized_amount_cents)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtCents(r.remaining_deferred_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ detail, onClose }: { detail: RevenueContractDetail; onClose: () => void }) {
  const pct = detail.transaction_price_cents > 0
    ? Math.round((detail.recognized_to_date_cents / detail.transaction_price_cents) * 100) : 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{detail.description}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {detail.contract_number ? `#${detail.contract_number} · ` : ""}{titleize(detail.source_type)} · {fmtDate(detail.contract_date)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
          <div><div className="text-xs text-gray-500">Transaction price</div><div className="tabular-nums">{fmtCents(detail.transaction_price_cents)}</div></div>
          <div><div className="text-xs text-gray-500">Recognized to date</div><div className="tabular-nums text-slate-700">{fmtCents(detail.recognized_to_date_cents)}</div></div>
          <div><div className="text-xs text-gray-500">Deferred balance</div><div className="tabular-nums font-semibold">{fmtCents(detail.deferred_balance_cents)}</div></div>
        </div>

        <div className="mb-3 border-t border-gray-200 pt-2 text-xs" data-testid="revenue-recognition-reverse-drill">
          <div className="font-semibold text-gray-700 mb-1">Source links</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600">
            <span>
              Customer:{" "}
              <EntityLink kind="customer" id={detail.customer_uuid} label={detail.customer_uuid ? undefined : "—"} />
            </span>
            <span>
              Invoice:{" "}
              <EntityLink kind="invoice" id={detail.source_invoice_id} label={detail.source_invoice_id ? undefined : "—"} />
            </span>
            <span>
              Load:{" "}
              <EntityLink kind="load" id={detail.source_load_id} label={detail.source_load_id ? undefined : "—"} />
            </span>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Recognized</span><span>{pct}%</span></div>
          <div className="h-2 rounded-full bg-gray-200"><div className="h-2 rounded-full bg-slate-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} /></div>
        </div>

        <div className="mb-3 rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="font-semibold mb-1">GL Posting (GATED — REVENUE_RECOGNITION_POST_ENABLED OFF)</p>
          <p>Deferral: Dr AR / Cr Deferred Revenue · Per-period: Dr Deferred Revenue / Cr Revenue</p>
        </div>

        <div className="overflow-y-auto flex-1 space-y-3">
          {detail.obligations.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No performance obligations on this contract.</p>
          ) : detail.obligations.map((ob) => <ObligationBlock key={ob.id} ob={ob} />)}
        </div>
      </div>
    </div>
  );
}

function LeakagePanel({ operatingCompanyId }: { operatingCompanyId: string }) {
  const q = useQuery({
    queryKey: ["revenue-leakage", operatingCompanyId],
    queryFn: () => getRevenueLeakage({ operating_company_id: operatingCompanyId, limit: 100 }),
    enabled: Boolean(operatingCompanyId),
  });
  const s = q.data;
  const gapLabel = (gap: RevenueLeakageRow["gap"]) =>
    gap === "missing_earn" ? "Missing earn latch" : "Earn without bill latch";

  const columns = useMemo<ParityColumn<RevenueLeakageRow>[]>(
    () => [
      {
        key: "load",
        label: "Load",
        sortable: true,
        sortValue: (row) => row.load_number ?? row.load_id,
        render: (row) => (
          <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number, row.load_id, "Load")} />
        ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => <span className="capitalize text-gray-600">{titleize(row.status)}</span>,
      },
      {
        key: "gap",
        label: "Gap",
        sortable: true,
        render: (row) => <span className="text-slate-700">{gapLabel(row.gap)}</span>,
      },
      {
        key: "rate",
        label: "Rate",
        sortable: true,
        sortValue: (row) => row.rate_total_cents,
        render: (row) => <span className="tabular-nums">{fmtCents(row.rate_total_cents)}</span>,
      },
      {
        key: "links",
        label: "Links",
        render: (row) =>
          row.earn_journal_entry_id ? (
            <EntityLink kind="journal_entry" id={row.earn_journal_entry_id} label="Earn JE" />
          ) : (
            <span className="text-gray-400">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className="mb-4 space-y-2" data-testid="revenue-leakage-panel">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">ASC 606 leakage / unbilled</h3>
        <p className="text-xs text-gray-500">
          Delivered (or later) loads missing the earn latch, or earn posted without the bill event. Read-only — no GL posts from this surface.
        </p>
      </div>
      {q.isError ? (
        <ListErrorState
          title="Failed to load leakage report."
          status={0}
          message="Retry after confirming company context."
          onRetry={() => void q.refetch()}
        />
      ) : (
        <>
          {s ? (
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" data-testid="revenue-leakage-kpis">
              <div>
                <div className="text-gray-500">Delivered+</div>
                <div className="text-base font-semibold tabular-nums">{s.delivered_like_count}</div>
              </div>
              <div>
                <div className="text-gray-500">Missing earn</div>
                <div className="text-base font-semibold tabular-nums text-slate-700">{s.missing_earn_count}</div>
              </div>
              <div>
                <div className="text-gray-500">Earn w/o bill</div>
                <div className="text-base font-semibold tabular-nums text-slate-700">{s.earn_missing_bill_count}</div>
              </div>
              <div>
                <div className="text-gray-500">Unbilled open</div>
                <div className="text-base font-semibold tabular-nums">{fmtCents(s.unbilled_open_cents)}</div>
              </div>
            </div>
          ) : null}
          <ParityTable
            columns={columns}
            rows={s?.rows ?? []}
            rowKey={(row) => `${row.gap}-${row.load_id}`}
            loading={q.isLoading}
            storageKey="revenue-leakage-rows"
            tableTestId="revenue-leakage-table"
            emptyText="No leakage rows for this entity."
          />
        </>
      )}
    </div>
  );
}

export function RevenueRecognitionPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag("REVENUE_RECOGNITION_ENABLED", operatingCompanyId || undefined);
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const limit = 50;

  const listQuery = useQuery({
    queryKey: ["revenue-contracts", operatingCompanyId, statusFilter, offset],
    queryFn: () => getRevenueContracts({ operating_company_id: operatingCompanyId, status: statusFilter || undefined, limit, offset }),
    enabled: Boolean(selectedCompanyId) && enabled,
  });
  const { data, isLoading, isError } = listQuery;

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["revenue-contract-detail", detailId, operatingCompanyId],
    queryFn: () => getRevenueContractDetail(detailId!, operatingCompanyId),
    enabled: Boolean(detailId && operatingCompanyId) && enabled,
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  const columns = useMemo<ParityColumn<RevenueContractListItem>[]>(
    () => [
      {
        key: "contract_number",
        label: "#",
        sortable: true,
        cellClass: "whitespace-nowrap text-gray-500 text-xs",
        render: (row) => row.contract_number ?? "—",
      },
      {
        key: "description",
        label: "Description",
        sortable: true,
        cellClass: "max-w-[220px] truncate font-medium",
        render: (row) => (
          <button onClick={() => setDetailId(row.id)} className="text-slate-700 hover:underline text-left">{row.description}</button>
        ),
      },
      {
        key: "source_type",
        label: "Source",
        sortable: true,
        cellClass: "whitespace-nowrap text-gray-600 capitalize",
        render: (row) => titleize(row.source_type),
      },
      {
        key: "contract_date",
        label: "Date",
        sortable: true,
        cellClass: "whitespace-nowrap text-gray-600",
        render: (row) => fmtDate(row.contract_date),
      },
      {
        key: "transaction_price_cents",
        label: "Price",
        sortable: true,
        className: "text-right",
        cellClass: "whitespace-nowrap text-right tabular-nums",
        render: (row) => fmtCents(row.transaction_price_cents),
      },
      {
        key: "recognized_to_date_cents",
        label: "Recognized",
        sortable: true,
        className: "text-right",
        cellClass: "whitespace-nowrap text-right tabular-nums text-slate-700",
        render: (row) => fmtCents(row.recognized_to_date_cents),
      },
      {
        key: "deferred_balance_cents",
        label: "Deferred",
        sortable: true,
        className: "text-right",
        cellClass: "whitespace-nowrap text-right tabular-nums font-semibold",
        render: (row) => fmtCents(row.deferred_balance_cents),
      },
      {
        key: "obligation_count",
        label: "Obligations",
        sortable: true,
        className: "text-center",
        cellClass: "whitespace-nowrap text-center text-gray-600",
        render: (row) => row.obligation_count,
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        cellClass: "whitespace-nowrap",
        render: (row) => (
          <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.status] ?? "bg-gray-100 text-gray-600"}`}>
            {titleize(row.status)}
          </span>
        ),
      },
    ],
    [],
  );

  const filterBar = (
    <div className="flex flex-wrap gap-2 items-center" data-revrec-filter-toolbar="collapsed">
      <CollapsedListFilters activeFilterCount={statusFilter ? 1 : 0} testIdPrefix="revrec">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setOffset(0);
          }}
          className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-slate-500"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="fully_recognized">Fully Recognized</option>
          <option value="voided">Voided</option>
        </select>
      </CollapsedListFilters>
      <span className="text-xs text-gray-500">
        {total.toLocaleString()} contract{total !== 1 ? "s" : ""}
      </span>
    </div>
  );

  if (!flagLoading && !enabled) {
    return (
      <AccountingSubNavWrapper title="Revenue Recognition" subtitle="Deferred revenue schedules and recognition rules">
        {operatingCompanyId ? <LeakagePanel operatingCompanyId={operatingCompanyId} /> : null}
        <div className="rounded-sm border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          Revenue recognition contract schedules are not yet enabled for this account.
          <p className="mt-1 text-xs text-gray-400">Enable the REVENUE_RECOGNITION_ENABLED feature flag to use the contracts table. Leakage / unbilled tracking above stays available.</p>
        </div>
      </AccountingSubNavWrapper>
    );
  }

  return (
    <AccountingSubNavWrapper title="Revenue Recognition" subtitle="ASC 606 contracts, obligations, and recognition schedule (read-only; GL posting gated)">
      {operatingCompanyId ? <LeakagePanel operatingCompanyId={operatingCompanyId} /> : null}
      {detailId && detail && !detailLoading && (
        <DetailPanel detail={detail} onClose={() => setDetailId(null)} />
      )}

      {isError ? (
        <ListErrorState
          title="Failed to load revenue contracts."
          status={listQuery.error instanceof ApiError ? listQuery.error.status : 0}
          message={(listQuery.error as Error)?.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <ParityTable
          columns={columns}
          rows={items}
          rowKey={(row) => row.id}
          loading={flagLoading || isLoading}
          filterBar={filterBar}
          storageKey="revenue-recognition-contracts"
          tableTestId="revenue-recognition-contracts-table"
          initialPageSize={limit}
          emptyText="No revenue contracts found."
        />
      )}

      {total > limit && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
            className="rounded-sm border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span>{offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}</span>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}
            className="rounded-sm border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}

export default RevenueRecognitionPage;
