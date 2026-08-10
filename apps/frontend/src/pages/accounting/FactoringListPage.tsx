import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { formatDateUS } from "../../lib/formatDate";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listFactoringAdvances, type FactoringAdvance } from "../../api/accounting";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SubmitFactoringModal } from "./SubmitFactoringModal";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters } from "../../components/table";
import { useUrlSort } from "../../hooks/useUrlSort";

const STATUS_OPTIONS: Array<{ value: "all" | FactoringAdvance["status"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "advanced", label: "Advanced" },
  { value: "reserve_held", label: "Reserve Held" },
  { value: "collected", label: "Collected" },
  { value: "released", label: "Released" },
  { value: "recourse_returned", label: "Recourse" },
  { value: "voided", label: "Voided" },
];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function statusPill(status: FactoringAdvance["status"]) {
  const base = "rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (status === "advanced") return `${base} bg-slate-100 text-slate-700 border border-slate-300`;
  if (status === "reserve_held" || status === "collected") return `${base} bg-slate-50 text-slate-600 border border-slate-200`;
  if (status === "released") return `${base} bg-slate-100 text-slate-700 border border-slate-200`;
  if (status === "recourse_returned") return `${base} bg-red-50 text-red-700 border border-red-200`;
  if (status === "voided") return `${base} bg-slate-100 text-slate-500 border border-slate-200 line-through`;
  return `${base} bg-slate-50 text-slate-700 border border-slate-200`;
}

export function FactoringListPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  // BANK-SORT-ROLLOUT-ACCT: ?sort=&dir= URL persistence (same as Bills/Expenses).
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const [status, setStatus] = useState<"all" | FactoringAdvance["status"]>("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);

  const query = useQuery({
    queryKey: ["accounting", "factoring-advances", selectedCompanyId, status, search, fromDate, toDate],
    queryFn: () =>
      listFactoringAdvances(selectedCompanyId!, {
        status,
        search: search || undefined,
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
      }).then((res) => res.rows),
    enabled: Boolean(selectedCompanyId),
  });

  const rows = query.data ?? [];

  const columns = useMemo<ParityColumn<FactoringAdvance>[]>(
    () => [
      {
        key: "display_id",
        label: "Batch #",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="factoring_advance"
            id={row.id}
            label={entityLabel(row.display_id, row.id, "Advance")}
          />
        ),
      },
      { key: "submitted_at", label: "Submitted", sortable: true, render: (row) => formatDateUS(row.submitted_at) },
      { key: "factoring_company_name", label: "Factor", sortable: true },
      { key: "invoice_count", label: "Invoices", sortable: true },
      { key: "invoice_total_cents", label: "Total", sortable: true, render: (row) => money(row.invoice_total_cents) },
      { key: "advance_amount_cents", label: "Advanced", sortable: true, render: (row) => money(row.advance_amount_cents) },
      { key: "reserve_amount_cents", label: "Reserve", sortable: true, render: (row) => money(row.reserve_amount_cents) },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => <span className={statusPill(row.status)}>{row.status.replaceAll("_", " ")}</span>,
      },
    ],
    [],
  );

  if (query.isError) {
    return (
      <AccountingSubNavWrapper title="Factoring" subtitle="Track factoring submissions, reserves, and releases" actions={<Button onClick={() => setSubmitOpen(true)}>+ Submit New Batch</Button>}>
        <ListErrorState
          title="Couldn't load factoring advances"
          status={0}
          message={(query.error as Error | undefined)?.message}
          onRetry={() => void query.refetch()}
        />
      </AccountingSubNavWrapper>
    );
  }

  const factoringActiveFilterCount = (status !== "all" ? 1 : 0) + (fromDate || toDate ? 1 : 0);

  const filterBar = (
    <CollapsedListFilters
      activeFilterCount={factoringActiveFilterCount}
      testIdPrefix="factoring"
      dataAttributes={{ "data-factoring-filter-toolbar": "collapsed" }}
      searchSlot={
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="FAC-2026-00012"
          className="min-h-12 h-12 w-56 rounded-sm border border-gray-300 px-2 text-[13px]"
          aria-label="Search factoring advances"
        />
      }
    >
      <div className="grid gap-2 md:grid-cols-3 w-full">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Status
          <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value as "all" | FactoringAdvance["status"])} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]">
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Date from
          <DatePicker value={fromDate} onChange={(next) => setFromDate(next)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Date to
          <DatePicker value={toDate} onChange={(next) => setToDate(next)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
        </label>
      </div>
    </CollapsedListFilters>
  );

  return (
    <AccountingSubNavWrapper title="Factoring" subtitle="Track factoring submissions, reserves, and releases" actions={<Button onClick={() => setSubmitOpen(true)}>+ Submit New Batch</Button>}>

      {filterBar}

      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isPending || (query.isFetching && rows.length === 0)}
        onRowClick={(row) => navigate(`/accounting/factoring/${row.id}`)}
        exportFilename="factoring-advances"
        storageKey="factoring-list"
        initialPageSize={50}
        pageSizeOptions={[50, 75, 100, 200, 300]}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        emptyText="No factoring batches for selected filters."
      />

      {selectedCompanyId ? (
        <SubmitFactoringModal
          open={submitOpen}
          operatingCompanyId={selectedCompanyId}
          onClose={() => setSubmitOpen(false)}
          onCreated={(batchId) => {
            setSubmitOpen(false);
            void query.refetch();
            navigate(`/accounting/factoring/${batchId}`);
          }}
        />
      ) : null}
    </AccountingSubNavWrapper>
  );
}
