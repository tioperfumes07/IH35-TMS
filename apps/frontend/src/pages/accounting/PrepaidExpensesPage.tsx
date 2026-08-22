import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { companyToday } from "../../lib/businessDate";
import {
  getPrepaidExpenses, getPrepaidExpenseDetail, createPrepaidExpense,
  type PrepaidAssetListItem, type PrepaidAssetDetail, type PrepaidAmortRow,
} from "../../api/prepaid-expenses";
import { listCatalogAccounts } from "../../api/catalog-accounts";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useUrlSort } from "../../hooks/useUrlSort";

const fmtCents = (c: number) => formatUsdCents(c);
const fmtDate = (s: string | null) => formatDateUS(s) || "—";

function jeHumanLabel(memo: string | null | undefined, date: string | null | undefined, id: string | null | undefined) {
  if (!id) return undefined;
  if (date) {
    return `${formatDateUS(date)}${memo ? ` — ${memo}` : ""}`;
  }
  return entityLabel(memo ?? null, id, "Journal entry");
}

function accountHumanLabel(number: string | null | undefined, name: string | null | undefined, id: string | null | undefined) {
  if (!id) return undefined;
  if (number && name) return `${number} - ${name}`;
  return entityLabel(name ?? null, id, "Account");
}

const STATUS_COLOR: Record<string, string> = {
  active: "bg-slate-100 text-slate-700",
  fully_amortized: "bg-slate-100 text-slate-700",
  voided: "bg-red-100 text-red-700",
};

// Amortization-schedule columns (SchedulePanel) — display-only 1:1 port of the former
// hand-rolled table: same labels, order, formatting, and the EntityLink JE drill-through.
const SCHEDULE_COLUMNS: ParityColumn<PrepaidAmortRow>[] = [
  { key: "period_number", label: "#", sortable: true, cellClass: "text-gray-500", render: (row) => row.period_number },
  { key: "period_date", label: "Period Date", sortable: true, cellClass: "whitespace-nowrap", render: (row) => fmtDate(row.period_date) },
  { key: "amount_cents", label: "Amount", sortable: true, cellClass: "text-right tabular-nums", render: (row) => fmtCents(row.amount_cents) },
  { key: "remaining_balance_cents", label: "Remaining", sortable: true, cellClass: "text-right tabular-nums text-gray-500", render: (row) => fmtCents(row.remaining_balance_cents) },
  {
    key: "posted",
    label: "Posted",
    sortable: true,
    sortValue: (row) => (row.posted ? 1 : 0),
    render: (row) =>
      row.posted
        ? <span className="inline-block rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">Posted</span>
        : <span className="inline-block rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">Pending</span>,
  },
  {
    key: "posted_journal_entry_id",
    label: "JE",
    sortable: true,
    cellClass: "font-mono text-gray-400",
    render: (row) => (
      <EntityLink
        kind="journal_entry"
        id={row.posted_journal_entry_id}
        label={jeHumanLabel(row.journal_entry_memo, row.journal_entry_date, row.posted_journal_entry_id)}
      />
    ),
  },
];

function SchedulePanel({ detail, onClose }: { detail: PrepaidAssetDetail; onClose: () => void }) {
  const pct = detail.total_amount_cents > 0
    ? Math.round((detail.amortized_cents / detail.total_amount_cents) * 100) : 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{detail.description}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {detail.asset_number ? `#${detail.asset_number} · ` : ""}{fmtCents(detail.total_amount_cents)} over {detail.periods} months
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Amortized: {fmtCents(detail.amortized_cents)}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-200">
            <div className="h-2 rounded-full bg-slate-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-2">
          {detail.purchase_je_id ? (
            <p>
              Purchase JE:{" "}
              <EntityLink
                kind="journal_entry"
                id={detail.purchase_je_id}
                label={jeHumanLabel(detail.purchase_je_memo, detail.purchase_je_date, detail.purchase_je_id)}
              />
            </p>
          ) : null}
          {detail.asset_account_id ? (
            <p>
              Prepaid GL:{" "}
              <EntityLink
                kind="account"
                id={detail.asset_account_id}
                label={accountHumanLabel(detail.asset_account_number, detail.asset_account_name, detail.asset_account_id)}
              />
            </p>
          ) : null}
          {detail.expense_account_id ? (
            <p>
              Expense GL:{" "}
              <EntityLink
                kind="account"
                id={detail.expense_account_id}
                label={accountHumanLabel(detail.expense_account_number, detail.expense_account_name, detail.expense_account_id)}
              />
            </p>
          ) : null}
          {detail.payment_account_id ? (
            <p>
              Payment GL:{" "}
              <EntityLink
                kind="account"
                id={detail.payment_account_id}
                label={accountHumanLabel(detail.payment_account_number, detail.payment_account_name, detail.payment_account_id)}
              />
            </p>
          ) : null}
          {detail.je_preview.purchase_je ? (
            <p className="sm:col-span-2 font-semibold">
              GL Posting Preview (GATED — flag OFF): Dr Prepaid Asset {fmtCents(detail.total_amount_cents)} / Cr Cash{" "}
              {fmtCents(detail.total_amount_cents)}
              {detail.je_preview.amortization_je_template
                ? ` · Per-period Dr Expense ${fmtCents(detail.period_amount_cents)} / Cr Prepaid ${fmtCents(detail.period_amount_cents)}`
                : ""}
            </p>
          ) : null}
        </div>

        <div className="overflow-y-auto flex-1">
          <ParityTable<PrepaidAmortRow>
            columns={SCHEDULE_COLUMNS}
            rows={detail.schedule}
            rowKey={(row) => row.id}
            rowClassName={(row) => (row.posted ? "bg-slate-50" : "hover:bg-gray-50")}
            storageKey="prepaid-expense-schedule"
            tableTestId="prepaid-expense-schedule-table"
            density="compact"
            initialPageSize={12}
            pageSizeOptions={[12, 60, 120, 360]}
            emptyText="No schedule periods."
          />
        </div>
      </div>
    </div>
  );
}

function CreateModal({ companyId, onClose, onCreated }: { companyId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    description: "", asset_number: "",
    purchase_date: companyToday(),
    start_date: companyToday(),
    periods: "12", total_amount_dollars: null as number | null,
    asset_account_id: "" as string,
    payment_account_id: "" as string,
    expense_account_id: "" as string,
  });
  const [error, setError] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["prepaid-expenses", "accounts", companyId],
    queryFn: () => listCatalogAccounts({ operating_company_id: companyId, postable_only: true }),
    enabled: Boolean(companyId),
  });
  const accounts = accountsQuery.data?.accounts ?? [];
  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: a.account_number ? `${a.account_number} · ${a.account_name}` : a.account_name,
        type: a.account_type ?? undefined,
      })),
    [accounts],
  );

  const mutation = useMutation({
    mutationFn: () => createPrepaidExpense({
      operating_company_id: companyId,
      description: form.description.trim(),
      asset_number: form.asset_number.trim() || undefined,
      purchase_date: form.purchase_date,
      start_date: form.start_date,
      periods: Number(form.periods),
      total_amount_cents: Math.round((form.total_amount_dollars ?? 0) * 100),
      asset_account_id: form.asset_account_id || undefined,
      payment_account_id: form.payment_account_id || undefined,
      expense_account_id: form.expense_account_id || undefined,
    }),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Failed to create."),
  });

  const valid = Boolean(form.description.trim() && form.purchase_date && form.start_date
    && Number(form.periods) > 0 && (form.total_amount_dollars ?? 0) > 0
    && form.asset_account_id && form.payment_account_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">New Prepaid Expense</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {error && <p className="text-sm text-red-600 mb-3 rounded-sm bg-red-50 px-3 py-2">{error}</p>}
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Description *</label>
            <input className="w-full rounded-sm border border-gray-300 px-3 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-slate-500"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Annual insurance premium" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Asset Number</label>
            <input className="w-full rounded-sm border border-gray-300 px-3 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-slate-500"
              value={form.asset_number} onChange={(e) => setForm({ ...form, asset_number: e.target.value })} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">Purchase Date *</label>
              <DatePicker className="w-full"
                value={form.purchase_date} onChange={(next) => setForm({ ...form, purchase_date: next })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">Amortization Start *</label>
              <DatePicker className="w-full"
                value={form.start_date} onChange={(next) => setForm({ ...form, start_date: next })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">Total Amount ($) *</label>
              <MoneyInput
                valueDollars={form.total_amount_dollars}
                onChangeDollars={(v) => setForm({ ...form, total_amount_dollars: v })}
                className="w-full"
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">Periods (months) *</label>
              <input type="number" min="1" max="360"
                className="w-full rounded-sm border border-gray-300 px-3 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-slate-500"
                value={form.periods} onChange={(e) => setForm({ ...form, periods: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Prepaid asset GL *</label>
            <ReferenceSelect
              value={form.asset_account_id || null}
              onChange={(v) => setForm({ ...form, asset_account_id: v ?? "" })}
              options={accountOptions}
              createKind="account"
              operatingCompanyId={companyId}
              placeholder="Select prepaid asset account"
              loading={accountsQuery.isLoading}
              onOptionCreated={() => void accountsQuery.refetch()}
              id="prepaid-create-asset-account"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Payment GL (cash or A/P) *</label>
            <ReferenceSelect
              value={form.payment_account_id || null}
              onChange={(v) => setForm({ ...form, payment_account_id: v ?? "" })}
              options={accountOptions}
              createKind="account"
              operatingCompanyId={companyId}
              placeholder="Select payment account"
              loading={accountsQuery.isLoading}
              onOptionCreated={() => void accountsQuery.refetch()}
              id="prepaid-create-payment-account"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Amortization expense GL</label>
            <ReferenceSelect
              value={form.expense_account_id || null}
              onChange={(v) => setForm({ ...form, expense_account_id: v ?? "" })}
              options={accountOptions}
              createKind="account"
              operatingCompanyId={companyId}
              placeholder="Select expense account"
              loading={accountsQuery.isLoading}
              onOptionCreated={() => void accountsQuery.refetch()}
              id="prepaid-create-expense-account"
            />
          </div>
          {(form.total_amount_dollars ?? 0) > 0 && Number(form.periods) > 0 && (
            <p className="text-xs text-gray-500 rounded-sm bg-gray-50 px-2 py-1">
              Monthly: {fmtCents(Math.floor((form.total_amount_dollars ?? 0) * 100 / Number(form.periods)))}
              {form.asset_account_id && form.payment_account_id
                ? " · purchase posts Dr prepaid asset / Cr payment when posting is ON"
                : " · pick prepaid asset GL and payment GL (required while posting is ON)"}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded-sm border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}
            className="rounded-sm bg-slate-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {mutation.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PrepaidExpensesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState("");
  const staged = useStagedListFilters({ applied: { statusFilter }, empty: { statusFilter: "" }, onApply: (next) => { setStatusFilter(next.statusFilter); setOffset(0); } });
  const [offset, setOffset] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(searchParams.get("asset_id"));
  const [showCreate, setShowCreate] = useState(false);
  const limit = 50;
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

  useEffect(() => {
    const assetId = searchParams.get("asset_id");
    if (assetId) setDetailId(assetId);
  }, [searchParams]);

  const openDetail = (id: string) => {
    setDetailId(id);
    const next = new URLSearchParams(searchParams);
    next.set("asset_id", id);
    setSearchParams(next, { replace: true });
  };

  const closeDetail = () => {
    setDetailId(null);
    if (!searchParams.get("asset_id")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("asset_id");
    setSearchParams(next, { replace: true });
  };

  const listQuery = useQuery({
    queryKey: ["prepaid-expenses", operatingCompanyId, statusFilter, offset],
    queryFn: () => getPrepaidExpenses({ operating_company_id: operatingCompanyId, status: statusFilter || undefined, limit, offset }),
    enabled: Boolean(selectedCompanyId),
  });
  const { data, isPending, isFetching, isError } = listQuery;

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["prepaid-expense-detail", detailId, operatingCompanyId],
    queryFn: () => getPrepaidExpenseDetail(detailId!, operatingCompanyId),
    enabled: Boolean(detailId && operatingCompanyId),
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  const columns = useMemo<ParityColumn<PrepaidAssetListItem>[]>(
    () => [
      { key: "asset_number", label: "#", sortable: true, render: (row) => row.asset_number ?? "—" },
      {
        key: "description",
        label: "Description",
        sortable: true,
        render: (row) => (
          <button onClick={() => openDetail(row.id)} className="text-slate-700 hover:underline text-left font-medium">{row.description}</button>
        ),
      },
      { key: "purchase_date", label: "Purchase Date", sortable: true, render: (row) => fmtDate(row.purchase_date) },
      { key: "periods", label: "Periods", sortable: true, className: "text-center", cellClass: "text-center", render: (row) => row.periods },
      { key: "total_amount_cents", label: "Total", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => fmtCents(row.total_amount_cents) },
      {
        key: "amortized_cents",
        label: "Amortized",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums text-slate-700",
        render: (row) => fmtCents(row.amortized_cents),
      },
      {
        key: "remaining",
        label: "Remaining",
        sortable: true,
        sortValue: (row) => row.total_amount_cents - row.amortized_cents,
        className: "text-right",
        cellClass: "text-right tabular-nums text-gray-500",
        render: (row) => fmtCents(row.total_amount_cents - row.amortized_cents),
      },
      { key: "pending_periods", label: "Pending", sortable: true, className: "text-center", cellClass: "text-center text-gray-500", render: (row) => row.pending_periods },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => (
          <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.status] ?? "bg-gray-100 text-gray-600"}`}>
            {row.status.replace("_", " ")}
          </span>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <button onClick={() => openDetail(row.id)} className="text-xs text-slate-700 hover:underline">Schedule</button>
        ),
      },
    ],
    [openDetail],
  );

  const filterBar = (
    <div className="flex flex-wrap gap-2 items-center" data-prepaid-filter-toolbar="collapsed">
      <CollapsedListFilters activeFilterCount={statusFilter ? 1 : 0} testIdPrefix="prepaid" onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}>
        <select
          value={staged.draft.statusFilter}
          onChange={(e) => staged.setDraft({ statusFilter: e.target.value })}
          className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-slate-500"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="fully_amortized">Fully Amortized</option>
          <option value="voided">Voided</option>
        </select>
      </CollapsedListFilters>
      <span className="text-xs text-gray-500">
        {total.toLocaleString()} asset{total !== 1 ? "s" : ""}
      </span>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Prepaid Expenses"
      subtitle="Prepaid assets and amortization schedules"
      actions={
        <button onClick={() => setShowCreate(true)}
          className="rounded-sm bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800">
          + Create Prepaid
        </button>
      }
    >
      {showCreate && (
        <CreateModal companyId={operatingCompanyId} onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["prepaid-expenses", operatingCompanyId] })} />
      )}
      {detailId && detail && !detailLoading && (
        <SchedulePanel detail={detail} onClose={closeDetail} />
      )}

      {isError ? <p className="text-sm text-red-600 py-2 text-center">Failed to load prepaid expenses.</p> : null}

      <ParityTable
        columns={columns}
        rows={items}
        rowKey={(row) => row.id}
        loading={isPending || (isFetching && items.length === 0)}
        filterBar={filterBar}
        storageKey="prepaid-expenses-list"
        initialPageSize={limit}
        emptyText="No prepaid expenses found."
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
      />

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

export default PrepaidExpensesPage;
